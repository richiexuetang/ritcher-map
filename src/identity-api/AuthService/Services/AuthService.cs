using System.Security.Cryptography;
using AuthService.Data;
using AuthService.DTOs;
using AuthService.Models;
using Microsoft.EntityFrameworkCore;

namespace AuthService.Services;

public class AuthService: IAuthService
{
    private readonly AuthDbContext _context;
    private readonly ITokenService _tokenService;
    private readonly IPasswordService _passwordService;
    private readonly IEmailService _emailService;
    private readonly ILogger<AuthService> _logger;
    
    public AuthService(
        AuthDbContext context,
        ITokenService tokenService,
        IPasswordService passwordService,
        IEmailService emailService,
        ILogger<AuthService> logger)
    {
        _context = context;
        _tokenService = tokenService;
        _passwordService = passwordService;
        _emailService = emailService;
        _logger = logger;
    }
    
    public async Task<ApiResponse<AuthResponse>> RegisterAsync(RegisterRequest request, string ipAddress)
    {
        try
        {
            // Check if user exists
            var existingUser = await _context.Users
                .FirstOrDefaultAsync(u => u.Email == request.Email || u.Username == request.Username);
            
            if (existingUser != null)
            {
                return new ApiResponse<AuthResponse>
                {
                    Success = false,
                    Message = "User already exists",
                    Errors = new List<string> { "Email or username is already taken" }
                };
            }
            
            // Create new user
            var user = new User
            {
                Id = Guid.NewGuid(),
                Email = request.Email,
                Username = request.Username,
                PasswordHash = _passwordService.HashPassword(request.Password),
                FirstName = request.FirstName,
                LastName = request.LastName,
                EmailVerificationToken = GenerateToken(),
                EmailVerificationTokenExpiry = DateTime.UtcNow.AddHours(24)
            };
            
            // Generate tokens
            var accessToken = _tokenService.GenerateAccessToken(user);
            var refreshToken = await CreateRefreshToken(user, ipAddress);
            
            user.RefreshTokens.Add(refreshToken);
            _context.Users.Add(user);
            await _context.SaveChangesAsync();
            
            // Send verification email
            await _emailService.SendVerificationEmailAsync(user.Email, user.EmailVerificationToken);
            
            return new ApiResponse<AuthResponse>
            {
                Success = true,
                Message = "Registration successful",
                Data = new AuthResponse
                {
                    AccessToken = accessToken,
                    RefreshToken = refreshToken.Token,
                    ExpiresAt = DateTime.UtcNow.AddMinutes(15),
                    User = MapToDto(user)
                }
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during registration");
            return new ApiResponse<AuthResponse>
            {
                Success = false,
                Message = "Registration failed",
                Errors = new List<string> { "An error occurred during registration" }
            };
        }
    }
    
    public async Task<ApiResponse<AuthResponse>> LoginAsync(LoginRequest request, string ipAddress)
    {
        try
        {
            var user = await _context.Users
                .Include(u => u.RefreshTokens)
                .FirstOrDefaultAsync(u => u.Email == request.EmailOrUsername || u.Username == request.EmailOrUsername);
            
            if (user == null || !_passwordService.VerifyPassword(request.Password, user.PasswordHash))
            {
                return new ApiResponse<AuthResponse>
                {
                    Success = false,
                    Message = "Invalid credentials",
                    Errors = new List<string> { "Email/username or password is incorrect" }
                };
            }
            
            if (!user.IsActive)
            {
                return new ApiResponse<AuthResponse>
                {
                    Success = false,
                    Message = "Account is deactivated",
                    Errors = new List<string> { "Your account has been deactivated" }
                };
            }
            
            // Generate tokens
            var accessToken = _tokenService.GenerateAccessToken(user);
            var refreshToken = await CreateRefreshToken(user, ipAddress);
            
            // Remove old refresh tokens
            user.RefreshTokens.RemoveAll(rt => !rt.IsActive);
            user.RefreshTokens.Add(refreshToken);
            user.LastLoginAt = DateTime.UtcNow;
            
            await _context.SaveChangesAsync();
            
            return new ApiResponse<AuthResponse>
            {
                Success = true,
                Message = "Login successful",
                Data = new AuthResponse
                {
                    AccessToken = accessToken,
                    RefreshToken = refreshToken.Token,
                    ExpiresAt = DateTime.UtcNow.AddMinutes(15),
                    User = MapToDto(user)
                }
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during login");
            return new ApiResponse<AuthResponse>
            {
                Success = false,
                Message = "Login failed",
                Errors = new List<string> { "An error occurred during login" }
            };
        }
    }
    
    public async Task<ApiResponse<AuthResponse>> RefreshTokenAsync(string refreshToken, string ipAddress)
    {
        try
        {
            var user = await _context.Users
                .Include(u => u.RefreshTokens)
                .FirstOrDefaultAsync(u => u.RefreshTokens.Any(rt => rt.Token == refreshToken));
            
            if (user == null)
            {
                return new ApiResponse<AuthResponse>
                {
                    Success = false,
                    Message = "Invalid refresh token"
                };
            }
            
            var oldToken = user.RefreshTokens.Single(rt => rt.Token == refreshToken);
            
            if (!oldToken.IsActive)
            {
                return new ApiResponse<AuthResponse>
                {
                    Success = false,
                    Message = "Invalid refresh token"
                };
            }
            
            // Revoke old token and generate new one
            oldToken.RevokedAt = DateTime.UtcNow;
            oldToken.RevokedByIp = ipAddress;
            oldToken.IsRevoked = true;
            
            var newRefreshToken = await CreateRefreshToken(user, ipAddress);
            user.RefreshTokens.Add(newRefreshToken);
            
            // Clean up old tokens
            user.RefreshTokens.RemoveAll(rt => !rt.IsActive && rt.CreatedAt.AddDays(7) < DateTime.UtcNow);
            
            await _context.SaveChangesAsync();
            
            var accessToken = _tokenService.GenerateAccessToken(user);
            
            return new ApiResponse<AuthResponse>
            {
                Success = true,
                Message = "Token refreshed successfully",
                Data = new AuthResponse
                {
                    AccessToken = accessToken,
                    RefreshToken = newRefreshToken.Token,
                    ExpiresAt = DateTime.UtcNow.AddMinutes(15),
                    User = MapToDto(user)
                }
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error refreshing token");
            return new ApiResponse<AuthResponse>
            {
                Success = false,
                Message = "Token refresh failed"
            };
        }
    }
    
    public async Task<ApiResponse<bool>> LogoutAsync(string refreshToken, string ipAddress)
    {
        try
        {
            var user = await _context.Users
                .Include(u => u.RefreshTokens)
                .FirstOrDefaultAsync(u => u.RefreshTokens.Any(rt => rt.Token == refreshToken));
            
            if (user != null)
            {
                var token = user.RefreshTokens.Single(rt => rt.Token == refreshToken);
                token.RevokedAt = DateTime.UtcNow;
                token.RevokedByIp = ipAddress;
                token.IsRevoked = true;
                await _context.SaveChangesAsync();
            }
            
            return new ApiResponse<bool>
            {
                Success = true,
                Message = "Logged out successfully",
                Data = true
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during logout");
            return new ApiResponse<bool>
            {
                Success = false,
                Message = "Logout failed"
            };
        }
    }
    
    public async Task<ApiResponse<bool>> VerifyEmailAsync(string token)
    {
        try
        {
            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.EmailVerificationToken == token && u.EmailVerificationTokenExpiry > DateTime.UtcNow);
            
            if (user == null)
            {
                return new ApiResponse<bool>
                {
                    Success = false,
                    Message = "Invalid or expired verification token"
                };
            }
            
            user.IsEmailVerified = true;
            user.EmailVerificationToken = null;
            user.EmailVerificationTokenExpiry = null;
            
            await _context.SaveChangesAsync();
            
            return new ApiResponse<bool>
            {
                Success = true,
                Message = "Email verified successfully",
                Data = true
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verifying email");
            return new ApiResponse<bool>
            {
                Success = false,
                Message = "Email verification failed"
            };
        }
    }
    
    public async Task<ApiResponse<bool>> ForgotPasswordAsync(string email)
    {
        try
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);
            
            if (user == null)
            {
                // Don't reveal if user exists
                return new ApiResponse<bool>
                {
                    Success = true,
                    Message = "If the email exists, a password reset link has been sent",
                    Data = true
                };
            }
            
            user.PasswordResetToken = GenerateToken();
            user.PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(1);
            
            await _context.SaveChangesAsync();
            await _emailService.SendPasswordResetEmailAsync(user.Email, user.PasswordResetToken);
            
            return new ApiResponse<bool>
            {
                Success = true,
                Message = "If the email exists, a password reset link has been sent",
                Data = true
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in forgot password");
            return new ApiResponse<bool>
            {
                Success = false,
                Message = "Password reset request failed"
            };
        }
    }
    
    public async Task<ApiResponse<bool>> ResetPasswordAsync(ResetPasswordRequest request)
    {
        try
        {
            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.PasswordResetToken == request.Token && u.PasswordResetTokenExpiry > DateTime.UtcNow);
            
            if (user == null)
            {
                return new ApiResponse<bool>
                {
                    Success = false,
                    Message = "Invalid or expired reset token"
                };
            }
            
            user.PasswordHash = _passwordService.HashPassword(request.NewPassword);
            user.PasswordResetToken = null;
            user.PasswordResetTokenExpiry = null;
            
            await _context.SaveChangesAsync();
            
            return new ApiResponse<bool>
            {
                Success = true,
                Message = "Password reset successfully",
                Data = true
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resetting password");
            return new ApiResponse<bool>
            {
                Success = false,
                Message = "Password reset failed"
            };
        }
    }
    
    public async Task<ApiResponse<UserDto>> GetUserAsync(Guid userId)
    {
        try
        {
            var user = await _context.Users.FindAsync(userId);
            
            if (user == null)
            {
                return new ApiResponse<UserDto>
                {
                    Success = false,
                    Message = "User not found"
                };
            }
            
            return new ApiResponse<UserDto>
            {
                Success = true,
                Data = MapToDto(user)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting user");
            return new ApiResponse<UserDto>
            {
                Success = false,
                Message = "Failed to get user"
            };
        }
    }
    
    public async Task<ApiResponse<UserDto>> UpdateProfileAsync(Guid userId, UpdateProfileRequest request)
    {
        try
        {
            var user = await _context.Users.FindAsync(userId);
            
            if (user == null)
            {
                return new ApiResponse<UserDto>
                {
                    Success = false,
                    Message = "User not found"
                };
            }
            
            if (request.FirstName != null) user.FirstName = request.FirstName;
            if (request.LastName != null) user.LastName = request.LastName;
            if (request.AvatarUrl != null) user.AvatarUrl = request.AvatarUrl;
            
            await _context.SaveChangesAsync();
            
            return new ApiResponse<UserDto>
            {
                Success = true,
                Message = "Profile updated successfully",
                Data = MapToDto(user)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating profile");
            return new ApiResponse<UserDto>
            {
                Success = false,
                Message = "Profile update failed"
            };
        }
    }
    
    public async Task<ApiResponse<bool>> ChangePasswordAsync(Guid userId, ChangePasswordRequest request)
    {
        try
        {
            var user = await _context.Users.FindAsync(userId);
            
            if (user == null)
            {
                return new ApiResponse<bool>
                {
                    Success = false,
                    Message = "User not found"
                };
            }
            
            if (!_passwordService.VerifyPassword(request.CurrentPassword, user.PasswordHash))
            {
                return new ApiResponse<bool>
                {
                    Success = false,
                    Message = "Current password is incorrect"
                };
            }
            
            user.PasswordHash = _passwordService.HashPassword(request.NewPassword);
            await _context.SaveChangesAsync();
            
            return new ApiResponse<bool>
            {
                Success = true,
                Message = "Password changed successfully",
                Data = true
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error changing password");
            return new ApiResponse<bool>
            {
                Success = false,
                Message = "Password change failed"
            };
        }
    }
    
    public async Task<TokenValidationResponse> ValidateTokenAsync(string token)
    {
        var validation = await _tokenService.ValidateTokenAsync(token);
        return validation;
    }
    
    private async Task<RefreshToken> CreateRefreshToken(User user, string ipAddress)
    {
        var token = new RefreshToken
        {
            Id = Guid.NewGuid(),
            Token = GenerateToken(),
            ExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow,
            CreatedByIp = ipAddress,
            UserId = user.Id
        };
        
        return token;
    }
    
    private string GenerateToken()
    {
        var randomBytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        return Convert.ToBase64String(randomBytes);
    }
    
    private UserDto MapToDto(User user)
    {
        return new UserDto
        {
            Id = user.Id,
            Email = user.Email,
            Username = user.Username,
            FirstName = user.FirstName,
            LastName = user.LastName,
            AvatarUrl = user.AvatarUrl,
            Role = user.Role,
            IsEmailVerified = user.IsEmailVerified,
            CreatedAt = user.CreatedAt,
            LastLoginAt = user.LastLoginAt
        };
    }
}