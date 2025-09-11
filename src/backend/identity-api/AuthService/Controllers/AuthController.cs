using AuthService.DTOs;
using AuthService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AuthService.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly ILogger<AuthController> _logger;
    
    public AuthController(IAuthService authService, ILogger<AuthController> logger)
    {
        _authService = authService;
        _logger = logger;
    }
    
    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }
        
        var ipAddress = GetIpAddress();
        var result = await _authService.RegisterAsync(request, ipAddress);
        
        if (result.Success)
        {
            return Ok(result);
        }
        
        return BadRequest(result);
    }
    
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }
        
        var ipAddress = GetIpAddress();
        var result = await _authService.LoginAsync(request, ipAddress);
        
        if (result.Success)
        {
            return Ok(result);
        }
        
        return Unauthorized(result);
    }
    
    [HttpPost("refresh")]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }
        
        var ipAddress = GetIpAddress();
        var result = await _authService.RefreshTokenAsync(request.RefreshToken, ipAddress);
        
        if (result.Success)
        {
            return Ok(result);
        }
        
        return Unauthorized(result);
    }
    
    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout([FromBody] RefreshTokenRequest request)
    {
        var ipAddress = GetIpAddress();
        var result = await _authService.LogoutAsync(request.RefreshToken, ipAddress);
        
        return Ok(result);
    }
    
    [HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail([FromBody] VerifyEmailRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }
        
        var result = await _authService.VerifyEmailAsync(request.Token);
        
        if (result.Success)
        {
            return Ok(result);
        }
        
        return BadRequest(result);
    }
    
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }
        
        var result = await _authService.ForgotPasswordAsync(request.Email);
        return Ok(result); // Always return OK to prevent email enumeration
    }
    
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }
        
        var result = await _authService.ResetPasswordAsync(request);
        
        if (result.Success)
        {
            return Ok(result);
        }
        
        return BadRequest(result);
    }
    
    [HttpPost("validate-token")]
    public async Task<IActionResult> ValidateToken([FromBody] Dictionary<string, string> request)
    {
        if (!request.ContainsKey("token"))
        {
            return BadRequest(new { message = "Token is required" });
        }
        
        var result = await _authService.ValidateTokenAsync(request["token"]);
        return Ok(result);
    }
    
    private string GetIpAddress()
    {
        var ipAddress = Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (string.IsNullOrEmpty(ipAddress))
        {
            ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        }
        return ipAddress ?? "Unknown";
    }
}