namespace AuthService.Services;

public interface ITokenBlacklistService
{
    Task BlacklistTokenAsync(string token, TimeSpan expiry);
    Task<bool> IsBlacklistedAsync(string token);
}