using TD.Application.Features.Content;
using TD.Application.Features.Progression;
using TD.Application.Infrastructure.Audit;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;
using TD.Application.Infrastructure.Realtime;
using TD.Application.Infrastructure.Telemetry;

namespace TD.Application.Features.Research;

public sealed class PurchaseResearchHandler(
    AppDbContext db,
    ICurrentUser currentUser,
    ContentCatalog catalog,
    ProgressionService progression,
    AuditLog audit,
    LiveNotifier live,
    GameTelemetry telemetry,
    TimeProvider clock) : IHandler
{
    public async Task<Result<ProgressionOverview>> Handle(string nodeId, CancellationToken ct)
    {
        var accountId = currentUser.AccountId;
        if (!catalog.Current.ResearchById.TryGetValue(nodeId, out var node))
        {
            return Error.NotFound("research.not_found", "Unknown research project.");
        }

        var p = await progression.LoadAsync(accountId, ct);
        if (p is null)
        {
            return Error.NotFound("profile.not_found", "Profile not found.");
        }

        if (p.Research.Contains(node.Id))
        {
            return Error.Conflict("research.owned", "Already researched.");
        }

        var missing = node.Requires.Where(r => !p.Research.Contains(r)).ToList();
        if (missing.Count > 0)
        {
            var names = missing.Select(id => catalog.Current.ResearchById[id].Name);
            return Error.Validation("research.prerequisites", $"Requires {string.Join(", ", names)}.");
        }

        if (p.Profile.ResearchPoints < node.Cost)
        {
            return Error.Validation("research.insufficient", "Not enough research points.");
        }

        var now = clock.GetUtcNow().UtcDateTime;
        p.Profile.ResearchPoints -= node.Cost;
        p.Profile.UpdatedAt = now;
        p.Research.Add(node.Id);
        db.ResearchUnlocks.Add(new ResearchUnlock { AccountId = accountId, NodeId = node.Id, Cost = node.Cost, PurchasedAt = now });
        progression.Increment(p, "research.nodes", 1);
        await progression.EvaluateAchievementsAsync(p, ct);
        audit.Record(AuditCategories.Progression, "research.purchased", new { node.Id, node.Cost });
        await db.SaveChangesAsync(ct);

        telemetry.ResearchPurchased.Add(1, new KeyValuePair<string, object?>("category", node.Category.ToString()));
        await live.ProfileChanged(accountId, p.Profile.Version);
        return await GetProgressionHandler.Build(p, db, accountId, catalog, progression, ct);
    }
}
