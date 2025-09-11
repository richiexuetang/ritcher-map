using AuthService.DTOs;
using AuthService.Models;

namespace AuthService.Services;

public interface ITokenService
{
        string GenerateAccessToken(User user);
        Task<TokenValidationResponse> ValidateTokenAsync(string token);
}