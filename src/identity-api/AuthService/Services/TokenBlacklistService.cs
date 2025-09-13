using StackExchange.Redis;

namespace AuthService.Services;

public class TokenBlacklistService : ITokenBlacklistService
{
    private readonly IConnectionMultiplexer _redis;
    private readonly ILogger<TokenBlacklistService> _logger;
    
    public TokenBlacklistService(IConfiguration configuration, ILogger<TokenBlacklistService> logger)
    {
        _logger = logger;
        var redisConnection = configuration.GetConnectionString("Redis") ?? "localhost:6379";
        _redis = ConnectionMultiplexer.Connect(redisConnection);
    }
    
    public async Task BlacklistTokenAsync(string token, TimeSpan expiry)
    {
        try
        {
            var db = _redis.GetDatabase();
            await db.StringSetAsync($"blacklist:{token}", "true", expiry);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to blacklist token");
        }
    }
    
    public async Task<bool> IsBlacklistedAsync(string token)
    {
        try
        {
            var db = _redis.GetDatabase();
            return await db.KeyExistsAsync($"blacklist:{token}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to check blacklist");
            return false; // Fail open if Redis is down
        }
    }
}