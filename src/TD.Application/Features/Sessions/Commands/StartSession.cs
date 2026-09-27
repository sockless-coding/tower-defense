using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TD.Application.Features.Campaign;
using TD.Application.Features.Content;
using TD.Application.Features.Difficulty;
using TD.Application.Features.Progression;
using TD.Application.Infrastructure.Audit;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;
using TD.Application.Infrastructure.Telemetry;

namespace TD.Application.Features.Sessions;

public sealed class GameSessionOptions
{
    public const string SectionName = "Sessions";

    public string SigningKey { get; set; } = string.Empty;

    /// <summary>Sessions older than this cannot be completed.</summary>
    public int MaxAgeHours { get; set; } = 8;
}

/// <summary>HMAC binding of session id, account and seed; the client echoes it on completion.</summary>
public static class GameSessionExtensions
{
    public static IServiceCollection AddGameSessions(this IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetSection(GameSessionOptions.SectionName).Get<GameSessionOptions>() ?? new GameSessionOptions();
        if (Encoding.UTF8.GetByteCount(options.SigningKey) < 32)
        {
            throw new InvalidOperationException("Sessions:SigningKey must be configured and at least 32 bytes long.");
        }

        return services.AddSingleton(options);
    }
}

public sealed class SessionTokens(GameSessionOptions options) : ISliceService
{
    public string Sign(Guid sessionId, Guid accountId, uint seed)
    {
        var key = Encoding.UTF8.GetBytes(options.SigningKey);
        var payload = Encoding.UTF8.GetBytes($"{sessionId:N}|{accountId:N}|{seed}");
        return Convert.ToBase64String(HMACSHA256.HashData(key, payload));
    }

    public bool Verify(string? token, Guid sessionId, Guid accountId, uint seed) =>
        token is not null &&
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(token), Encoding.UTF8.GetBytes(Sign(sessionId, accountId, seed)));
}

public sealed class StartSessionHandler(
    AppDbContext db,
    ICurrentUser currentUser,
    ContentCatalog catalog,
    ProgressionService progression,
    SessionTokens tokens,
    AuditLog audit,
    GameTelemetry telemetry,
    TimeProvider clock) : IHandler
{
    public const int MaxActiveSessions = 3;

    public async Task<Result<SessionStartResponse>> Handle(StartSessionRequest request, CancellationToken ct)
    {
        var accountId = currentUser.AccountId;
        var content = catalog.Current;
        var progress = await progression.LoadAsync(accountId, ct);
        if (progress is null)
        {
            return Error.NotFound("profile.not_found", "Profile not found.");
        }

        var now = clock.GetUtcNow().UtcDateTime;
        var levelResult = ResolveLevel(request, progress, content, now);
        if (!levelResult.IsSuccess)
        {
            return levelResult.Error!;
        }

        var (level, eventKey) = levelResult.Value;

        var difficulty = ResolveDifficulty(request, progress, content);
        if (!difficulty.IsSuccess)
        {
            return difficulty.Error!;
        }

        var (modifiers, presetId) = difficulty.Value;
        var seed = BitConverter.ToUInt32(RandomNumberGenerator.GetBytes(4));
        var resolved = SessionLevelResolver.Resolve(level, modifiers, seed, content);

        var unlocked = progression.UnlockedTowers(progress);
        if (level.AllowedTowers is not null)
        {
            unlocked = unlocked.Intersect(level.AllowedTowers).ToList();
            if (unlocked.Count == 0)
            {
                // Event arsenals may exceed a newcomer's unlocks; fall back to the event list so the level is playable.
                unlocked = level.AllowedTowers.ToList();
            }
        }

        var config = new SessionConfig(
            resolved,
            modifiers,
            presetId,
            DifficultyMath.RewardMultiplier(modifiers, content.Difficulty.Ranges),
            seed,
            progression.Bonuses(progress),
            progression.PrestigeRanks(progress),
            unlocked);

        // Keep a handful of resumable sessions; older ones are abandoned.
        var active = await db.GameSessions
            .Where(s => s.AccountId == accountId && s.Status == SessionStatus.Active)
            .OrderByDescending(s => s.StartedAt)
            .ToListAsync(ct);
        foreach (var stale in active.Skip(MaxActiveSessions - 1))
        {
            stale.Status = SessionStatus.Abandoned;
        }

        var session = new GameSession
        {
            AccountId = accountId,
            Mode = request.Mode,
            LevelId = level.Id,
            EventKey = eventKey,
            PresetId = presetId,
            Seed = seed,
            RewardMultiplier = config.RewardMultiplier,
            ConfigJson = JsonSerializer.Serialize(config, ContentJson.Options),
            ContentVersion = content.Version,
            Status = SessionStatus.Active,
            StartedAt = now,
        };
        db.GameSessions.Add(session);
        audit.Record(AuditCategories.Progression, "session.started", new { SessionId = session.Id, request.Mode, LevelId = level.Id, presetId, config.RewardMultiplier });
        await db.SaveChangesAsync(ct);

        telemetry.SessionsStarted.Add(1, new KeyValuePair<string, object?>("mode", request.Mode.ToString()));
        return new SessionStartResponse(session.Id, tokens.Sign(session.Id, accountId, seed), config, content.Version);
    }

    private Result<(LevelDefinition Level, string? EventKey)> ResolveLevel(StartSessionRequest request, PlayerProgress progress, ContentSnapshot content, DateTime now)
    {
        switch (request.Mode)
        {
            case GameMode.Campaign:
            case GameMode.Challenge:
            {
                if (request.LevelId is null || !content.LevelsById.TryGetValue(request.LevelId, out var level) || level.Mode != request.Mode)
                {
                    return Error.NotFound("level.not_found", "That level does not exist.");
                }

                return progression.IsLevelUnlocked(progress, level)
                    ? (level, null)
                    : Error.Forbidden("level.locked", "That level is still locked.");
            }

            case GameMode.Survival:
            case GameMode.Endless:
            {
                var feature = request.Mode == GameMode.Survival ? "feature.survival" : "feature.endless";
                if (!progression.HasFeature(progress, feature))
                {
                    return Error.Forbidden("mode.locked", $"Unlocks at Commander level {progression.FeatureLevel(feature)}.");
                }

                if (request.MapId is null || !content.MapsById.TryGetValue(request.MapId, out var map))
                {
                    return Error.NotFound("map.not_found", "That map does not exist.");
                }

                if (!progression.MapCompleted(progress, map.Id))
                {
                    return Error.Forbidden("map.locked", "Complete this map in the campaign first.");
                }

                var level = request.Mode == GameMode.Survival ? ModeLevels.Survival(content, map) : ModeLevels.Endless(content, map);
                return (level, null);
            }

            case GameMode.Daily:
            {
                if (!progression.HasFeature(progress, "feature.daily"))
                {
                    return Error.Forbidden("mode.locked", $"Unlocks at Commander level {progression.FeatureLevel("feature.daily")}.");
                }

                var key = ModeLevels.DailyKey(now);
                return (ModeLevels.Daily(content, key), key);
            }

            case GameMode.Weekly:
            {
                if (!progression.HasFeature(progress, "feature.weekly"))
                {
                    return Error.Forbidden("mode.locked", $"Unlocks at Commander level {progression.FeatureLevel("feature.weekly")}.");
                }

                var key = ModeLevels.WeeklyKey(now);
                return (ModeLevels.Weekly(content, key), key);
            }

            default:
                return Error.Validation("mode.invalid", "Unknown game mode.");
        }
    }

    private Result<(DifficultyModifiers Modifiers, string? PresetId)> ResolveDifficulty(StartSessionRequest request, PlayerProgress progress, ContentSnapshot content)
    {
        // Events are fixed so leaderboards compare like with like; Endless is always at least Nightmare.
        if (request.Mode is GameMode.Daily or GameMode.Weekly)
        {
            var preset = content.PresetsById[request.Mode == GameMode.Daily ? "veteran" : "inventor"];
            return (preset.Modifiers, preset.Id);
        }

        if (request.Mode == GameMode.Endless)
        {
            return (content.PresetsById["nightmare"].Modifiers, "nightmare");
        }

        if (request.Custom is not null)
        {
            if (!progression.HasFeature(progress, "feature.customDifficulty"))
            {
                return Error.Forbidden("difficulty.locked", "Custom difficulty is still locked.");
            }

            var errors = DifficultyMath.Validate(request.Custom, content.Difficulty.Ranges).ToList();
            return errors.Count > 0 ? Error.Validation("difficulty.invalid", string.Join(" ", errors)) : (request.Custom, null);
        }

        var presetId = request.PresetId ?? "engineer";
        if (!content.PresetsById.TryGetValue(presetId, out var chosen))
        {
            return Error.Validation("difficulty.unknown", "Unknown difficulty preset.");
        }

        return progress.Profile.CommanderLevel < chosen.RequiredCommanderLevel
            ? Error.Forbidden("difficulty.locked", $"{chosen.Name} unlocks at Commander level {chosen.RequiredCommanderLevel}.")
            : (chosen.Modifiers, chosen.Id);
    }
}
