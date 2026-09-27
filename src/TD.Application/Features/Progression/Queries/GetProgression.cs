using Microsoft.EntityFrameworkCore;
using TD.Application.Features.Content;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;

namespace TD.Application.Features.Progression;

public sealed class GetProgressionHandler(AppDbContext db, ICurrentUser currentUser, ContentCatalog catalog, ProgressionService progression) : IHandler
{
    public async Task<Result<ProgressionOverview>> Handle(CancellationToken ct)
    {
        var accountId = currentUser.AccountId;
        var p = await progression.LoadAsync(accountId, ct);
        if (p is null)
        {
            return Error.NotFound("profile.not_found", "Profile not found.");
        }

        return await Build(p, db, accountId, catalog, progression, ct);
    }

    public static async Task<ProgressionOverview> Build(PlayerProgress p, AppDbContext db, Guid accountId, ContentCatalog catalog, ProgressionService progression, CancellationToken ct)
    {
        var c = catalog.Current;
        var (level, into) = c.Commander.LevelFor(p.Profile.CommanderXp);
        var unlockDates = await db.AchievementUnlocks.AsNoTracking()
            .Where(a => a.AccountId == accountId)
            .ToDictionaryAsync(a => a.AchievementId, a => a.UnlockedAt, ct);

        var cosmetics = p.Cosmetics.Append(ProgressionService.DefaultBanner).Append(ProgressionService.DefaultTitle).Distinct().ToList();
        var completedMaps = c.Maps.Where(m => progression.MapCompleted(p, m.Id)).Select(m => m.Id).ToList();

        return new ProgressionOverview(
            new CommanderStatus(level, p.Profile.CommanderXp, into, c.Commander.XpToNext(level), c.Commander.MaxLevel),
            p.Profile.Gears,
            p.Profile.ResearchPoints,
            progression.HighestCampaignCompleted(p),
            p.Levels.ToDictionary(kv => kv.Key, kv => new LevelProgressDto(kv.Value.BestStars, kv.Value.BestScore, kv.Value.Completions)),
            p.Research.ToList(),
            p.Prestige.ToDictionary(kv => kv.Key, kv => kv.Value.Rank),
            cosmetics,
            p.Profile.SelectedBanner,
            p.Profile.SelectedTitle,
            c.Achievements.Select(a => new AchievementStatus(
                a.Id,
                unlockDates.ContainsKey(a.Id),
                unlockDates.TryGetValue(a.Id, out var at) ? at : null,
                p.Stat(a.Stat))).ToList(),
            progression.UnlockedTowers(p),
            progression.Features(p.Profile.CommanderLevel).ToList(),
            completedMaps,
            p.Statistics.ToDictionary(kv => kv.Key, kv => kv.Value.Value),
            p.Profile.Version);
    }
}
