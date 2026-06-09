# Issues and verifies session JWTs.
#
# CONTRACT WITH THE GATEWAY (Go). The gateway validates these tokens at the edge
# with the SAME shared secret (ENV["JWT_SECRET"]). It requires:
#   - HS256 signing
#   - a string `sub` claim  = the user id   (gateway reads it as the user id)
#   - an int  `iat` claim   = issued-at (unix seconds)
#   - an int  `exp` claim   = expiry    (unix seconds; gateway sets WithExpirationRequired)
#   - a bool  `premium` claim = whether the user has an active subscription. The
#     gateway gates free-tier limits on this flag (premium users bypass them), so
#     it must match the REST `premium` boolean exactly — both derive from
#     User#premium? (the single source of truth). See auth.v1.SessionClaims.
# Keep this in lockstep with gateway/internal/auth. If you change the algorithm
# or claim names here, change them there too.
class JwtService
  ALGORITHM = "HS256".freeze
  DEFAULT_TTL = 24.hours

  class << self
    def encode(user, ttl: DEFAULT_TTL)
      now = Time.now.to_i
      payload = {
        sub: user.id.to_s,   # string subject — matches the gateway's expectation
        iat: now,
        exp: now + ttl.to_i,
        # Same rule the REST layer uses for `premium` (User#premium?). Coerce to a
        # real bool and never crash if the user has no subscription (=> false).
        premium: user.premium? ? true : false
      }
      JWT.encode(payload, secret, ALGORITHM)
    end

    # Returns the decoded payload hash, or nil if invalid/expired. The jwt gem
    # verifies the signature and the exp claim when verify: true.
    def decode(token)
      return nil if token.blank?

      payload, _header = JWT.decode(
        token, secret, true,
        { algorithm: ALGORITHM, verify_expiration: true }
      )
      payload
    rescue JWT::DecodeError
      nil
    end

    private

    def secret
      ENV.fetch("JWT_SECRET")
    end
  end
end
