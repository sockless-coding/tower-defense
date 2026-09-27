using TD.Application.Features.Content;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;
using TD.Application.Infrastructure.Realtime;

namespace TD.Application.Features.Progression;

public sealed class SelectCosmeticsHandler(
    AppDbContext db,
    ICurrentUser currentUser,
    ContentCatalog catalog,
    ProgressionService progression,
    LiveNotifier live,
    TimeProvider clock) : IHandler
{
    public async Task<Result<ProgressionOverview>> Handle(SelectCosmeticsRequest request, CancellationToken ct)
    {
        var accountId = currentUser.AccountId;
        var p = await progression.LoadAsync(accountId, ct);
        if (p is null)
        {
            return Error.NotFound("profile.not_found", "Profile not found.");
        }

        bool Owns(string id, string kind) =>
            (id == ProgressionService.DefaultBanner || id == ProgressionService.DefaultTitle || p.Cosmetics.Contains(id)) &&
            catalog.Current.Commander.Cosmetics.Any(c => c.Id == id && c.Kind == kind);

        if (!Owns(request.Banner, "banner") || !Owns(request.Title, "title"))
        {
            return Error.Forbidden("cosmetic.locked", "You have not unlocked that cosmetic.");
        }

        p.Profile.SelectedBanner = request.Banner;
        p.Profile.SelectedTitle = request.Title;
        p.Profile.UpdatedAt = clock.GetUtcNow().UtcDateTime;
        await db.SaveChangesAsync(ct);
        await live.ProfileChanged(accountId, p.Profile.Version);
        return await GetProgressionHandler.Build(p, db, accountId, catalog, progression, ct);
    }
}
