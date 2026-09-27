using Microsoft.EntityFrameworkCore;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;
using TD.Application.Infrastructure.Realtime;

namespace TD.Application.Features.Profiles;

public sealed class UpdateProfileHandler(AppDbContext db, ICurrentUser currentUser, LiveNotifier live, TimeProvider clock) : IHandler
{
    public async Task<Result<ProfileDto>> Handle(UpdateProfileRequest request, CancellationToken ct)
    {
        var accountId = currentUser.AccountId;
        var profile = await db.Profiles.SingleOrDefaultAsync(p => p.AccountId == accountId, ct);
        if (profile is null)
        {
            return Error.NotFound("profile.not_found", "Profile not found.");
        }

        if (profile.Version != request.ExpectedVersion)
        {
            return Error.Conflict("profile.version_conflict", "The profile was changed on another device. Reload and try again.");
        }

        profile.DisplayName = request.DisplayName.Trim();
        profile.UpdatedAt = clock.GetUtcNow().UtcDateTime;

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Error.Conflict("profile.version_conflict", "The profile was changed on another device. Reload and try again.");
        }

        await live.ProfileChanged(accountId, profile.Version);
        var kind = await db.Accounts.Where(a => a.Id == accountId).Select(a => a.Kind).SingleAsync(ct);
        return GetMyProfileHandler.ToDto(profile, kind);
    }
}

public sealed class UpdateSettingsHandler(AppDbContext db, ICurrentUser currentUser, TimeProvider clock) : IHandler
{
    public async Task<Result<Unit>> Handle(UpdateSettingsRequest request, CancellationToken ct)
    {
        var accountId = currentUser.AccountId;
        var updated = await db.Profiles
            .Where(p => p.AccountId == accountId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.SettingsJson, request.Settings.GetRawText())
                .SetProperty(p => p.UpdatedAt, clock.GetUtcNow().UtcDateTime), ct);

        return updated == 0 ? Error.NotFound("profile.not_found", "Profile not found.") : Unit.Value;
    }
}
