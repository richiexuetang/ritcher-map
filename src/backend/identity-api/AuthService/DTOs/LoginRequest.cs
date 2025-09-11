using System.ComponentModel.DataAnnotations;

namespace AuthService.DTOs;

public class LoginRequest
{
    [Required]
    public string EmailOrUsername { get; set; } = string.Empty;
    
    [Required]
    public string Password { get; set; } = string.Empty;
}