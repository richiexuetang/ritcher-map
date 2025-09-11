using System.ComponentModel.DataAnnotations;

namespace AuthService.DTOs;

public class VerifyEmailRequest
{
    [Required]
    public string Token { get; set; } = string.Empty;
}