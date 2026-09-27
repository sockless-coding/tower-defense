using Microsoft.EntityFrameworkCore;
using TD.Application.Features.Campaign;
using TD.Application.Features.Content;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;

namespace TD.Application.Features.DailyChallenges;

public sealed record LiveEvent(string Kind, string Key, string BoardKey, DateTime EndsAt, LevelSummary Level, string PresetId, long? MyBest);

public sealed record LiveEvents(LiveEvent Daily, LiveEvent Weekly);

/// <summary>The current daily challenge and weekly event, identical for every player.</summary>
public sealed class GetEventsHandler(AppDbContext db, ICurrentUser currentUser, ContentCatalog catalog, TimeProvider clock) : IHandler
{
    public async Task<LiveEvents> Handle(CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var content = catalog.Current;
        var dailyKey = ModeLevels.DailyKey(now);
        var weeklyKey = ModeLevels.WeeklyKey(now);
        var me = currentUser.AccountIdOrNull;

        async Task<long?> Best(string board) => me is null
            ? null
            : await db.LeaderboardEntries.Where(e => e.BoardKey == board && e.AccountId == me).Select(e => (long?)e.Score).SingleOrDefaultAsync(ct);

        var daily = new LiveEvent("daily", dailyKey, $"daily:{dailyKey}", ModeLevels.DailyEndsAt(now), LevelSummary.From(ModeLevels.Daily(content, dailyKey)), "veteran", await Best($"daily:{dailyKey}"));
        var weekly = new LiveEvent("weekly", weeklyKey, $"weekly:{weeklyKey}", ModeLevels.WeeklyEndsAt(now), LevelSummary.From(ModeLevels.Weekly(content, weeklyKey)), "inventor", await Best($"weekly:{weeklyKey}"));
        return new LiveEvents(daily, weekly);
    }
}
