using System.ComponentModel.DataAnnotations;

namespace AuthService.DTOs;

public class RefreshTokenRequest
{
    [Required]
    public string RefreshToken { get; set; } = string.Empty;
}