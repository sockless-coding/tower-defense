using Microsoft.EntityFrameworkCore;
using TD.Application.Features.Profiles;
using TD.Application.Infrastructure.Audit;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;
using TD.Application.Infrastructure.Telemetry;

namespace TD.Application.Features.Accounts;

public sealed class RegisterAccountHandler(
    AppDbContext db,
    AuthSessionIssuer issuer,
    AuditLog audit,
    GameTelemetry telemetry,
    TimeProvider clock) : IHandler
{
    public async Task<Result<AuthResponse>> Handle(RegisterRequest request, CancellationToken ct)
    {
        var normalized = AuthSessionIssuer.NormalizeEmail(request.Email);
        if (await db.Accounts.AnyAsync(a => a.NormalizedEmail == normalized, ct))
        {
            return Error.Conflict("account.email_taken", "An account with this email already exists.");
        }

        var now = clock.GetUtcNow().UtcDateTime;
        var account = new Account
        {
            Kind = AccountKind.Registered,
            Email = request.Email.Trim(),
            NormalizedEmail = normalized,
            CreatedAt = now,
            LastSeenAt = now,
        };
        account.PasswordHash = AuthSessionIssuer.PasswordHasher.HashPassword(account, request.Password);
        var profile = ProfileFactory.Create(account.Id, request.DisplayName.Trim(), now);

        db.Accounts.Add(account);
        db.Profiles.Add(profile);
        var response = issuer.Issue(account, profile);
        audit.Record(AuditCategories.Auth, "account.registered", accountId: account.Id);

        await db.SaveChangesAsync(ct);
        telemetry.AccountsCreated.Add(1, new KeyValuePair<string, object?>("kind", "registered"));
        return response;
    }
}
