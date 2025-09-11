using MailKit.Net.Smtp;
using MimeKit;

namespace AuthService.Services;

public class EmailService : IEmailService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmailService> _logger;
    
    public EmailService(IConfiguration configuration, ILogger<EmailService> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }
    
    public async Task SendVerificationEmailAsync(string email, string token)
    {
        var verificationUrl = $"https://ritchermap.com/verify-email?token={token}";
        var subject = "Verify Your RitcherMap Account";
        var body = $@"
            <h2>Welcome to RitcherMap!</h2>
            <p>Please click the link below to verify your email address:</p>
            <p><a href='{verificationUrl}'>Verify Email</a></p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create an account, please ignore this email.</p>
        ";
        
        await SendEmailAsync(email, subject, body);
    }
    
    public async Task SendPasswordResetEmailAsync(string email, string token)
    {
        var resetUrl = $"https://ritchermap.com/reset-password?token={token}";
        var subject = "Reset Your RitcherMap Password";
        var body = $@"
            <h2>Password Reset Request</h2>
            <p>Click the link below to reset your password:</p>
            <p><a href='{resetUrl}'>Reset Password</a></p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request a password reset, please ignore this email.</p>
        ";
        
        await SendEmailAsync(email, subject, body);
    }
    
    public async Task SendWelcomeEmailAsync(string email, string username)
    {
        var subject = "Welcome to RitcherMap!";
        var body = $@"
            <h2>Welcome aboard, {username}!</h2>
            <p>Your account has been successfully created and verified.</p>
            <p>Start exploring interactive maps and discovering new locations!</p>
            <p>If you have any questions, feel free to contact our support team.</p>
        ";
        
        await SendEmailAsync(email, subject, body);
    }
    
    private async Task SendEmailAsync(string to, string subject, string htmlBody)
    {
        try
        {
            var emailSettings = _configuration.GetSection("EmailSettings");
            
            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(emailSettings["FromName"], emailSettings["FromEmail"]));
            message.To.Add(new MailboxAddress(to, to));
            message.Subject = subject;
            
            message.Body = new TextPart("html")
            {
                Text = htmlBody
            };
            
            using var client = new SmtpClient();
            await client.ConnectAsync(emailSettings["SmtpHost"], int.Parse(emailSettings["SmtpPort"]!), false);
            await client.AuthenticateAsync(emailSettings["SmtpUsername"], emailSettings["SmtpPassword"]);
            await client.SendAsync(message);
            await client.DisconnectAsync(true);
            
            _logger.LogInformation($"Email sent successfully to {to}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Failed to send email to {to}");
            // Don't throw - email failures shouldn't break the flow
        }
    }
}
