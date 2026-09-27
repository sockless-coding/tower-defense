using Microsoft.AspNetCore.Identity;
using TD.Application.Features.Profiles;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;

namespace TD.Application.Features.Accounts;

/// <summary>Issues an access token plus a persisted refresh token. The caller commits the unit of work.</summary>
public sealed class AuthSessionIssuer(AppDbContext db, TokenService tokens, IHttpContextAccessor http, TimeProvider clock) : ISliceService
{
    public AuthResponse Issue(Account account, PlayerProfile profile, Guid? familyId = null)
    {
        var role = account.IsAdmin ? AppRoles.Admin : account.Kind == AccountKind.Guest ? AppRoles.Guest : AppRoles.Player;
        var access = tokens.CreateAccessToken(account.Id, profile.DisplayName, role);
        var refresh = tokens.CreateRefreshToken();

        db.RefreshTokens.Add(new RefreshToken
        {
            AccountId = account.Id,
            TokenHash = refresh.Hash,
            FamilyId = familyId ?? Guid.NewGuid(),
            CreatedAt = clock.GetUtcNow().UtcDateTime,
            ExpiresAt = refresh.ExpiresAt,
            CreatedByIp = http.HttpContext?.Connection.RemoteIpAddress?.ToString(),
        });

        return new AuthResponse(account.Id, profile.DisplayName, account.Kind, access.Token, access.ExpiresAt, refresh.Token, refresh.ExpiresAt);
    }

    public static string NormalizeEmail(string email) => email.Trim().ToUpperInvariant();

    public static readonly PasswordHasher<Account> PasswordHasher = new();
}
