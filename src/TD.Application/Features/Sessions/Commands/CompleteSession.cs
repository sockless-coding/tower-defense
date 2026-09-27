using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TD.Application.Features.Campaign;
using TD.Application.Features.Content;
using TD.Application.Features.Leaderboards;
using TD.Application.Features.Progression;
using TD.Application.Infrastructure.Audit;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;
using TD.Application.Infrastructure.Realtime;
using TD.Application.Infrastructure.Telemetry;

namespace TD.Application.Features.Sessions;

/// <summary>Reward formulas. Pure functions of validated data and the session's reward multiplier.</summary>
public static class RewardMath
{
    public static int Stars(bool victory, int coresLost, int totalCores) =>
        !victory ? 0 : coresLost == 0 ? 3 : coresLost <= totalCores * 0.25 ? 2 : 1;

    public static int Tier(LevelDefinition level, int wavesCleared) => level.Mode switch
    {
        GameMode.Survival => 20 + wavesCleared,
        GameMode.Endless => 30 + wavesCleared,
        _ => level.Number,
    };

    public static long Xp(int tier, bool victory, int wavesCleared, int waves, double multiplier)
    {
        var completion = victory ? 1.0 : 0.3 * wavesCleared / Math.Max(1, waves);
        return (long)Math.Round((120 + 25 * tier) * completion * multiplier);
    }

    public static long Gears(int tier, bool victory, int stars, int wavesCleared, double multiplier) =>
        victory
            ? (long)Math.Round((20 + 5 * tier) * (0.6 + 0.2 * stars) * multiplier)
            : (long)Math.Round(5 * wavesCleared * multiplier);

    public static long Score(long goldEarned, int coresRemaining, int wavesCleared, double multiplier) =>
        (long)Math.Round((goldEarned + coresRemaining * 250L + wavesCleared * 50L) * multiplier);
}

public sealed class CompleteSessionHandler(
    AppDbContext db,
    ICurrentUser currentUser,
    ContentCatalog catalog,
    ProgressionService progression,
    SessionTokens tokens,
    GameSessionOptions options,
    AuditLog audit,
    LiveNotifier live,
    GameTelemetry telemetry,
    TimeProvider clock) : IHandler
{
    public async Task<Result<CompletionResponse>> Handle(Guid sessionId, string? token, CompleteSessionRequest request, CancellationToken ct)
    {
        var accountId = currentUser.AccountId;
        var now = clock.GetUtcNow().UtcDateTime;
        var session = await db.GameSessions.SingleOrDefaultAsync(s => s.Id == sessionId && s.AccountId == accountId, ct);
        if (session is null)
        {
            return Error.NotFound("session.not_found", "Session not found.");
        }

        if (session.Status != SessionStatus.Active)
        {
            return Error.Conflict("session.closed", "This session has already ended.");
        }

        if (!tokens.Verify(token, session.Id, accountId, session.Seed))
        {
            return await Reject(session, "invalid session token", now, ct);
        }

        if (now - session.StartedAt > TimeSpan.FromHours(options.MaxAgeHours))
        {
            session.Status = SessionStatus.Abandoned;
            await db.SaveChangesAsync(ct);
            return Error.Conflict("session.expired", "This session has expired.");
        }

        var content = catalog.Current;
        var config = JsonSerializer.Deserialize<SessionConfig>(session.ConfigJson, ContentJson.Options)!;
        var (run, failure) = RunValidator.Validate(config, content, request, now - session.StartedAt);
        if (run is null)
        {
            return await Reject(session, failure!, now, ct);
        }

        var progress = (await progression.LoadAsync(accountId, ct))!;
        var level = config.Level;
        var result = request.Result;
        var stats = result.Stats;
        var multiplier = session.RewardMultiplier;
        var levelBefore = progress.Profile.CommanderLevel;
        var unlockedBefore = progression.UnlockedTowers(progress).ToHashSet();

        // ---------------------------------------------------------------- Level progress and research points
        var stars = RewardMath.Stars(run.Victory, run.CoresLost, run.TotalCores);
        var score = RewardMath.Score(stats.GoldEarned, result.CoresRemaining, result.WavesCleared, multiplier);
        var previousStars = 0;
        long researchPoints = 0;
        if (run.Victory && level.Mode is GameMode.Campaign or GameMode.Challenge)
        {
            progress.Levels.TryGetValue(level.Id, out var lp);
            previousStars = lp?.BestStars ?? 0;
            var firstClear = lp is null;
            if (lp is null)
            {
                lp = new LevelProgress { AccountId = accountId, LevelId = level.Id, FirstCompletedAt = now };
                db.LevelProgress.Add(lp);
                progress.Levels[level.Id] = lp;
                progression.Increment(progress, level.Mode == GameMode.Challenge ? "challenge.completed" : "levels.completed", 1);
            }

            if (stars == 3 && lp.PerfectCompletions == 0)
            {
                progression.Increment(progress, "levels.perfect", 1);
            }

            lp.Completions++;
            lp.PerfectCompletions += stars == 3 ? 1 : 0;
            lp.LastCompletedAt = now;
            lp.BestStars = Math.Max(lp.BestStars, stars);
            lp.BestScore = Math.Max(lp.BestScore, score);
            progression.Increment(progress, "levels.stars", Math.Max(0, stars - previousStars));
            researchPoints += (firstClear ? (level.Mode == GameMode.Challenge ? 3 : 2) : 0) + Math.Max(0, stars - previousStars);
            if (level.Mode == GameMode.Campaign)
            {
                progression.SetMax(progress, "campaign.highest", progression.HighestCampaignCompleted(progress));
            }
        }

        if (level.Mode is GameMode.Survival or GameMode.Endless)
        {
            var key = level.Mode == GameMode.Survival ? "survival.bestWave" : "endless.bestWave";
            var previousBest = progress.Stat(key);
            researchPoints += Math.Max(0, result.WavesCleared / 10 - previousBest / 10);
            progression.SetMax(progress, key, result.WavesCleared);
        }

        if (run.Victory && level.Mode is GameMode.Daily or GameMode.Weekly)
        {
            var already = await db.GameSessions.AnyAsync(
                s => s.AccountId == accountId && s.EventKey == session.EventKey && s.Mode == session.Mode && s.Status == SessionStatus.Completed && s.Outcome == "victory",
                ct);
            if (!already)
            {
                researchPoints += level.Mode == GameMode.Daily ? 2 : 4;
                progression.Increment(progress, level.Mode == GameMode.Daily ? "daily.completed" : "weekly.completed", 1);
            }
        }

        if (run.Victory && session.PresetId is not null)
        {
            progression.Increment(progress, $"difficulty.{session.PresetId}.completed", 1);
        }

        // ---------------------------------------------------------------- Statistics
        var totalKills = 0L;
        foreach (var (enemyId, kills) in stats.Kills)
        {
            progression.Increment(progress, $"kills.{enemyId}", kills);
            totalKills += kills;
        }

        progression.Increment(progress, "kills.total", totalKills);
        progression.Increment(progress, "bosses.defeated", stats.BossesDefeated);
        progression.Increment(progress, "towers.built", stats.TowersBuilt);
        progression.Increment(progress, "upgrades.ultimate", stats.UltimatesPurchased);
        progression.Increment(progress, "gold.earned", stats.GoldEarned);
        progression.Increment(progress, "interactions.used", stats.InteractionsUsed);
        progression.Increment(progress, "cores.recovered", stats.CoresRecovered);
        progression.Increment(progress, "sessions.completed", 1);

        // ---------------------------------------------------------------- Currency, XP, achievements
        var tier = RewardMath.Tier(level, result.WavesCleared);
        var xp = RewardMath.Xp(tier, run.Victory, result.WavesCleared, level.Waves.Count, multiplier);
        var gears = RewardMath.Gears(tier, run.Victory, stars, result.WavesCleared, multiplier);
        progress.Profile.Gears += gears;
        progress.Profile.ResearchPoints += researchPoints;
        var levelRewards = await progression.AwardXpAsync(progress, xp, ct);
        var achievements = await progression.EvaluateAchievementsAsync(progress, ct);
        progress.Profile.UpdatedAt = now;

        // ---------------------------------------------------------------- Leaderboard
        var boardKey = LeaderboardKeys.For(level, session.EventKey, run.Victory);
        if (boardKey is not null)
        {
            var entry = await db.LeaderboardEntries.SingleOrDefaultAsync(e => e.BoardKey == boardKey && e.AccountId == accountId, ct);
            if (entry is null)
            {
                db.LeaderboardEntries.Add(new LeaderboardEntry
                {
                    BoardKey = boardKey,
                    AccountId = accountId,
                    DisplayName = progress.Profile.DisplayName,
                    Score = score,
                    Waves = result.WavesCleared,
                    Stars = stars,
                    SessionId = session.Id,
                    AchievedAt = now,
                });
            }
            else if (score > entry.Score)
            {
                entry.Score = score;
                entry.Waves = result.WavesCleared;
                entry.Stars = stars;
                entry.SessionId = session.Id;
                entry.DisplayName = progress.Profile.DisplayName;
                entry.AchievedAt = now;
            }
        }

        session.Status = SessionStatus.Completed;
        session.CompletedAt = now;
        session.Outcome = result.Outcome;
        session.Score = score;
        session.Stars = stars;
        session.ResultJson = JsonSerializer.Serialize(new { result, xp, gears, researchPoints }, ContentJson.Options);
        audit.Record(AuditCategories.Progression, "session.completed", new { session.Id, result.Outcome, score, stars, xp, gears, researchPoints });

        await db.SaveChangesAsync(ct);

        int? rank = null;
        if (boardKey is not null)
        {
            var best = await db.LeaderboardEntries.Where(e => e.BoardKey == boardKey && e.AccountId == accountId).Select(e => e.Score).SingleAsync(ct);
            rank = await db.LeaderboardEntries.CountAsync(e => e.BoardKey == boardKey && e.Score > best, ct) + 1;
            await live.LeaderboardUpdated(boardKey);
        }

        await live.ProfileChanged(accountId, progress.Profile.Version);
        telemetry.SessionsCompleted.Add(1, new KeyValuePair<string, object?>("mode", session.Mode.ToString()), new KeyValuePair<string, object?>("outcome", result.Outcome));
        telemetry.SessionDuration.Record((now - session.StartedAt).TotalSeconds);

        var newlyUnlocked = progression.UnlockedTowers(progress).Where(t => !unlockedBefore.Contains(t)).ToList();
        return new CompletionResponse(
            result.Outcome,
            stars,
            previousStars,
            score,
            xp,
            gears,
            researchPoints,
            levelBefore,
            progress.Profile.CommanderLevel,
            levelRewards,
            achievements.Select(a => a.Id).ToList(),
            newlyUnlocked,
            boardKey,
            rank);
    }

    private async Task<Result<CompletionResponse>> Reject(GameSession session, string reason, DateTime now, CancellationToken ct)
    {
        session.Status = SessionStatus.Rejected;
        session.CompletedAt = now;
        session.RejectionReason = reason;
        audit.Record(AuditCategories.AntiCheat, "session.rejected", new { session.Id, reason }, AuditSeverity.Critical);
        await db.SaveChangesAsync(ct);
        telemetry.SessionsRejected.Add(1, new KeyValuePair<string, object?>("reason", reason));
        return Error.Cheat("session.rejected", reason);
    }
}

public static class LeaderboardKeys
{
    public static string? For(LevelDefinition level, string? eventKey, bool victory) => level.Mode switch
    {
        GameMode.Campaign or GameMode.Challenge => victory ? $"level:{level.Id}" : null,
        GameMode.Daily => $"daily:{eventKey}",
        GameMode.Weekly => $"weekly:{eventKey}",
        GameMode.Survival => $"survival:{level.MapId}",
        GameMode.Endless => $"endless:{level.MapId}",
        _ => null,
    };
}
