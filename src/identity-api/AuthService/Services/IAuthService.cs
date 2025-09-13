using AuthService.DTOs;

namespace AuthService.Services;

public interface IAuthService
{
    Task<ApiResponse<AuthResponse>> RegisterAsync(RegisterRequest request, string ipAddress);
    Task<ApiResponse<AuthResponse>> LoginAsync(LoginRequest request, string ipAddress);
    Task<ApiResponse<AuthResponse>> RefreshTokenAsync(string refreshToken, string ipAddress);
    Task<ApiResponse<bool>> LogoutAsync(string refreshToken, string ipAddress);
    Task<ApiResponse<bool>> VerifyEmailAsync(string token);
    Task<ApiResponse<bool>> ForgotPasswordAsync(string email);
    Task<ApiResponse<bool>> ResetPasswordAsync(ResetPasswordRequest request);
    Task<ApiResponse<UserDto>> GetUserAsync(Guid userId);
    Task<ApiResponse<UserDto>> UpdateProfileAsync(Guid userId, UpdateProfileRequest request);
    Task<ApiResponse<bool>> ChangePasswordAsync(Guid userId, ChangePasswordRequest request);
    Task<TokenValidationResponse> ValidateTokenAsync(string token);
}