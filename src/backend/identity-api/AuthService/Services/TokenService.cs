using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AuthService.DTOs;
using AuthService.Models;
using Microsoft.IdentityModel.Tokens;

namespace AuthService.Services;

public class TokenService: ITokenService
{
    private readonly IConfiguration _configuration;
    private readonly ITokenBlacklistService _blacklistService;
    private readonly ILogger<TokenService> _logger;
    
    public TokenService(IConfiguration configuration, ITokenBlacklistService blacklistService, ILogger<TokenService> logger)
    {
        _configuration = configuration;
        _blacklistService = blacklistService;
        _logger = logger;
    }
    
    public string GenerateAccessToken(User user)
    {
        var jwtSettings = _configuration.GetSection("JwtSettings");
        var secretKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings["Secret"]!));
        var signingCredentials = new SigningCredentials(secretKey, SecurityAlgorithms.HmacSha256);
        
        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim(CustomClaims.UserId, user.Id.ToString()),
            new Claim(CustomClaims.Username, user.Username),
            new Claim(CustomClaims.Email, user.Email),
            new Claim(CustomClaims.Role, user.Role),
            new Claim(CustomClaims.IsEmailVerified, user.IsEmailVerified.ToString())
        };
        
        var tokenOptions = new JwtSecurityToken(
            issuer: jwtSettings["Issuer"],
            audience: jwtSettings["Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(Convert.ToDouble(jwtSettings["AccessTokenExpirationMinutes"])),
            signingCredentials: signingCredentials
        );
        
        return new JwtSecurityTokenHandler().WriteToken(tokenOptions);
    }
    
    public async Task<TokenValidationResponse> ValidateTokenAsync(string token)
    {
        try
        {
            // Check if token is blacklisted
            if (await _blacklistService.IsBlacklistedAsync(token))
            {
                return new TokenValidationResponse { IsValid = false };
            }
            
            var jwtSettings = _configuration.GetSection("JwtSettings");
            var secretKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings["Secret"]!));
            
            var tokenHandler = new JwtSecurityTokenHandler();
            var validationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = jwtSettings["Issuer"],
                ValidAudience = jwtSettings["Audience"],
                IssuerSigningKey = secretKey,
                ClockSkew = TimeSpan.Zero
            };
            
            var principal = tokenHandler.ValidateToken(token, validationParameters, out var validatedToken);
            
            return new TokenValidationResponse
            {
                IsValid = true,
                UserId = Guid.Parse(principal.FindFirst(CustomClaims.UserId)?.Value ?? ""),
                Username = principal.FindFirst(CustomClaims.Username)?.Value,
                Email = principal.FindFirst(CustomClaims.Email)?.Value,
                Role = principal.FindFirst(CustomClaims.Role)?.Value
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Token validation failed");
            return new TokenValidationResponse { IsValid = false };
        }
    }
}