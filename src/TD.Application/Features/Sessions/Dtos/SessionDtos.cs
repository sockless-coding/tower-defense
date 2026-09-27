using TD.Application.Features.Campaign;
using TD.Application.Features.Difficulty;
using TD.Application.Features.Progression;
using TD.Application.Features.Research;

namespace TD.Application.Features.Sessions;

/// <param name="LevelId">Campaign/challenge level id. Ignored for survival, endless, daily and weekly modes.</param>
/// <param name="MapId">Map for survival and endless modes.</param>
/// <param name="PresetId">Difficulty preset; ignored when <paramref name="Custom"/> is supplied.</param>
public sealed record StartSessionRequest(GameMode Mode, string? LevelId, string? MapId, string? PresetId, DifficultyModifiers? Custom);

/// <summary>Everything the client simulation needs, frozen at session start.</summary>
public sealed record SessionConfig(
    LevelDefinition Level,
    DifficultyModifiers Modifiers,
    string? PresetId,
    double RewardMultiplier,
    uint Seed,
    IReadOnlyList<BonusEffect> Bonuses,
    IReadOnlyDictionary<string, int> Prestige,
    IReadOnlyList<string> UnlockedTowers);

public sealed record SessionStartResponse(Guid SessionId, string Token, SessionConfig Config, string ContentVersion);

/// <summary>One recorded player action. Fields not used by an action type are null.</summary>
public sealed record ActionDto(int T, string Type, string? Tower, double? X, double? Y, int? Id, string? Upgrade, string? Mode);

public sealed record RunStatsDto(
    Dictionary<string, int> Kills,
    int BossesDefeated,
    int TowersBuilt,
    Dictionary<string, int> TowersBuiltById,
    int UpgradesPurchased,
    int UltimatesPurchased,
    long GoldEarned,
    long GoldSpent,
    int CoresRecovered,
    int InteractionsUsed,
    int WavesCleared,
    double DamageDealt);

public sealed record RunResultDto(string Outcome, int Ticks, int CoresRemaining, int CoresTotal, int WavesCleared, RunStatsDto Stats);

public sealed record CompleteSessionRequest(IReadOnlyList<ActionDto> Actions, RunResultDto Result);

public sealed record CompletionResponse(
    string Outcome,
    int Stars,
    int PreviousBestStars,
    long Score,
    long XpGained,
    long GearsGained,
    long ResearchPointsGained,
    int CommanderLevelBefore,
    int CommanderLevelAfter,
    IReadOnlyList<GrantedReward> LevelRewards,
    IReadOnlyList<string> NewAchievements,
    IReadOnlyList<string> NewlyUnlockedTowers,
    string? LeaderboardKey,
    int? LeaderboardRank);

public sealed record SessionDetails(Guid SessionId, SessionStatus Status, SessionConfig Config, string ContentVersion, DateTime StartedAt);
