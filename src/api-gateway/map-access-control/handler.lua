local BasePlugin = require "kong.plugins.base_plugin"
local jwt = require "resty.jwt"
local cjson = require "cjson"

local MapAccessControlHandler = BasePlugin:extend()

MapAccessControlHandler.VERSION = "1.0.0"
MapAccessControlHandler.PRIORITY = 1000

-- Contructor
function MapAccessControlHandler:new()
    MapAccessControlHandler.super.new(self, "map-access-control")
end

local schema = {
    name = "map-access-control",
    fields = {
        {
            config = {
                type = "record",
                fields = {
                    { redis_host = {type="string", default="redis"}},
                    {redis_port={type="number", default=6379}},
                    { redis_timeout = { type = "number", default = 2000 } },
                    { cache_ttl = { type = "number", default = 300 } },
                    { require_subscription = { type = "boolean", default = false } },
                    { allowed_tiers = {
                        type = "array",
                        elements = { type = "string" },
                        default = { "free", "premium", "enterprise" }
                    }},
                    { rate_limit_by_tier = {
                        type = "map",
                        keys = { type = "string" },
                        values = { type = "number" },
                        default = {
                            free = 100,
                            premium = 1000,
                            enterprise = 10000
                        }
                    }},
                    { map_permissions = {
                        type = "map",
                        keys = { type = "string" },
                        values = {
                            type = "array",
                            elements = { type = "string" }
                        },
                        default = {}
                    }}
                }
            }
        }
    }
}

-- Utility functions
local function get_user_from_jwt(jwt_token)
    local jwt_obj = jwt:load_jwt(jwt_token)
    if not jwt_obj.valid then
        return nil, "Invalid JWT token"
    end

    return jwt_obj.payload, nil
end

local function check_redis_cache(redis_client, key)
    local res, err = redis_client:get(key)
    if err then
        kong.log.err("Redis error: ", err)
        return nil
    end
    return res
end

local function set_redis_cache(redis_client, key, value, ttl)
    local ok, err = redis_client:setex(key, ttl, value)
    if not ok then
        kong.log.err("Redis set error: ", err)
    end
end

local function check_map_access(map_id, user_data, config)
    -- Check if user has access to specific map
    if not user_data then
        return false, "No user data"
    end

    -- Check subscription tier
    if config.require_subscription then
        local user_tier = user_data.subscription_tier or "free"
        local allowed = false

        for _, tier in ipairs(config.allowed_tiers) do
            if tier == user_tier then
                allowed = true
                break
            end
        end

        if not allowed then
            return false, "Subscription tier not allowed"
        end
    end

    -- Check specific map permissions
    if config.map_permissions and config.map_permissions[map_id] then
        local required_permissions = config.map_permissions[map_id]
        local user_permissions = user_data.permissions or {}

        for _, perm in ipairs(required_permissions) do
            local has_permission = false
            for _, user_perm in ipairs(user_permissions) do
                if user_perm == perm then
                    has_permission = true
                    break
                end
            end

            if not has_permission then
                return false, "Missing required permission: " .. perm
            end
        end
    end

    -- Check if map is public or user owns it
    if user_data.owned_maps then
        for _, owned_map in ipairs(user_data.owned_maps) do
            if owned_map == map_id then
                return true, nil
            end
        end
    end

    return true, nil
end

local function apply_rate_limit_by_tier(user_tier, config)
    local limit = config.rate_limit_by_tier[user_tier] or config.rate_limit_by_tier["free"]
    kong.service.request.set_header("X-RateLimit-Tier", user_tier)
    kong.service.request.set_header("X-RateLimit-Limit", tostring(limit))
    return limit
end

-- Plugin lifecycle methods
function MapAccessControlHandler:access(config)
    MapAccessControlHandler.super.access(self)

    -- Get JWT token from Authorization header
    local auth_header = kong.request.get_header("Authorization")
    if not auth_header then
        return kong.response.exit(401, { message = "No Authorization header" })
    end

    local jwt_token = string.match(auth_header, "Bearer%s+(.+)")
    if not jwt_token then
        return kong.response.exit(401, { message = "Invalid Authorization header format" })
    end

    -- Parse JWT and get user data
    local user_data, err = get_user_from_jwt(jwt_token)
    if err then
        return kong.response.exit(401, { message = err })
    end

    -- Connect to Redis for caching
    local redis = require "resty.redis"
    local red = redis:new()
    red:set_timeout(config.redis_timeout)

    local ok, err = red:connect(config.redis_host, config.redis_port)
    if not ok then
        kong.log.warn("Could not connect to Redis: ", err)
        -- Continue without cache
    end

    -- Extract map_id from path (assuming /api/v1/maps/{map_id}/...)
    local path = kong.request.get_path()
    local map_id = string.match(path, "/api/v1/maps/([^/]+)")

    if map_id then
        -- Check cache first
        local cache_key = "map_access:" .. user_data.user_id .. ":" .. map_id
        local cached_result = nil

        if ok then
            cached_result = check_redis_cache(red, cache_key)
        end

        if cached_result == "allowed" then
            kong.log.debug("Cache hit: Access allowed for user ", user_data.user_id)
        elseif cached_result == "denied" then
            return kong.response.exit(403, { message = "Access denied to this map" })
        else
            -- No cache hit, check access
            local allowed, access_err = check_map_access(map_id, user_data, config)

            if not allowed then
                if ok then
                    set_redis_cache(red, cache_key, "denied", config.cache_ttl)
                end
                return kong.response.exit(403, { message = access_err or "Access denied to this map" })
            end

            if ok then
                set_redis_cache(red, cache_key, "allowed", config.cache_ttl)
            end
        end
    end

    -- Apply rate limiting based on tier
    local user_tier = user_data.subscription_tier or "free"
    apply_rate_limit_by_tier(user_tier, config)

    -- Add user context headers for downstream services
    kong.service.request.set_header("X-User-ID", user_data.user_id)
    kong.service.request.set_header("X-User-Tier", user_tier)
    kong.service.request.set_header("X-User-Email", user_data.email or "")

    -- Set map context if available
    if map_id then
        kong.service.request.set_header("X-Map-ID", map_id)
    end

    -- Track analytics
    if user_data.user_id then
        kong.log.info("User ", user_data.user_id, " accessing ", path)

        -- Send async analytics event
        local analytics_data = {
            user_id = user_data.user_id,
            path = path,
            map_id = map_id,
            tier = user_tier,
            timestamp = ngx.now()
        }

        -- Queue for analytics service (using Kong's event system)
        kong.event.post("map_access", analytics_data)
    end

    -- Close Redis connection
    if ok then
        local ok, err = red:set_keepalive(10000, 100)
        if not ok then
            kong.log.warn("Failed to set Redis keepalive: ", err)
        end
    end
end

function MapAccessControlHandler:header_filter(config)
    MapAccessControlHandler.super.header_filter(self)

    -- Add custom headers to response
    kong.response.set_header("X-Map-Access-Control", "1.0.0")

    -- Add rate limit headers
    local tier_limit = kong.service.request.get_header("X-RateLimit-Limit")
    if tier_limit then
        kong.response.set_header("X-RateLimit-Tier-Limit", tier_limit)
    end
end

function MapAccessControlHandler:log(config)
    MapAccessControlHandler.super.log(self)

    -- Log access metrics
    local latency = kong.ctx.plugin.latency or 0
    local status = kong.response.get_status()
    local user_id = kong.service.request.get_header("X-User-ID")

    kong.log.info(string.format(
        "Request completed - User: %s, Status: %d, Latency: %dms",
        user_id or "anonymous",
        status,
        latency
    ))
end

return MapAccessControlHandler