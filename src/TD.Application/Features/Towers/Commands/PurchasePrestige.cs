using TD.Application.Features.Content;
using TD.Application.Features.Progression;
using TD.Application.Infrastructure.Audit;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;
using TD.Application.Infrastructure.Realtime;

namespace TD.Application.Features.Towers;

/// <summary>Buys the next prestige rank of a tower with gears; the final rank also grants the gilded skin.</summary>
public sealed class PurchasePrestigeHandler(
    AppDbContext db,
    ICurrentUser currentUser,
    ContentCatalog catalog,
    ProgressionService progression,
    AuditLog audit,
    LiveNotifier live,
    TimeProvider clock) : IHandler
{
    public async Task<Result<ProgressionOverview>> Handle(string towerId, CancellationToken ct)
    {
        var accountId = currentUser.AccountId;
        if (!catalog.Current.TowersById.TryGetValue(towerId, out var tower))
        {
            return Error.NotFound("tower.not_found", "Unknown tower.");
        }

        var p = await progression.LoadAsync(accountId, ct);
        if (p is null)
        {
            return Error.NotFound("profile.not_found", "Profile not found.");
        }

        if (!progression.HasFeature(p, "feature.prestige"))
        {
            return Error.Forbidden("prestige.locked", $"Prestige unlocks at Commander level {progression.FeatureLevel("feature.prestige")}.");
        }

        if (!progression.UnlockedTowers(p).Contains(tower.Id))
        {
            return Error.Forbidden("tower.locked", "Unlock this tower before prestiging it.");
        }

        var now = clock.GetUtcNow().UtcDateTime;
        if (!p.Prestige.TryGetValue(tower.Id, out var rank))
        {
            rank = new TowerPrestigeRank { AccountId = accountId, TowerId = tower.Id };
            db.TowerPrestige.Add(rank);
            p.Prestige[tower.Id] = rank;
        }

        if (rank.Rank >= tower.Prestige.MaxRank)
        {
            return Error.Conflict("prestige.max", "Already at maximum prestige.");
        }

        var cost = tower.Prestige.GearCost[rank.Rank];
        if (p.Profile.Gears < cost)
        {
            return Error.Validation("prestige.insufficient", "Not enough gears.");
        }

        p.Profile.Gears -= cost;
        p.Profile.UpdatedAt = now;
        rank.Rank++;
        rank.UpdatedAt = now;
        if (rank.Rank == tower.Prestige.MaxRank)
        {
            await progression.GrantCosmeticAsync(p, tower.Prestige.SkinAtMaxRank, $"prestige:{tower.Id}", ct);
        }

        audit.Record(AuditCategories.Progression, "prestige.purchased", new { TowerId = tower.Id, rank.Rank, cost });
        await db.SaveChangesAsync(ct);
        await live.ProfileChanged(accountId, p.Profile.Version);
        return await GetProgressionHandler.Build(p, db, accountId, catalog, progression, ct);
    }
}
