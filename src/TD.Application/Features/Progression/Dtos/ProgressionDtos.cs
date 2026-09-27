namespace TD.Application.Features.Progression;

public sealed record CommanderStatus(int Level, long TotalXp, long XpIntoLevel, long XpToNext, int MaxLevel);

public sealed record LevelProgressDto(int Stars, long BestScore, int Completions);

public sealed record AchievementStatus(string Id, bool Unlocked, DateTime? UnlockedAt, long Progress);

/// <summary>The complete server-owned progression state, fetched once and refreshed on change.</summary>
public sealed record ProgressionOverview(
    CommanderStatus Commander,
    long Gears,
    long ResearchPoints,
    int HighestCampaignLevel,
    IReadOnlyDictionary<string, LevelProgressDto> Levels,
    IReadOnlyList<string> Research,
    IReadOnlyDictionary<string, int> Prestige,
    IReadOnlyList<string> Cosmetics,
    string SelectedBanner,
    string SelectedTitle,
    IReadOnlyList<AchievementStatus> Achievements,
    IReadOnlyList<string> UnlockedTowers,
    IReadOnlyList<string> Features,
    IReadOnlyList<string> CompletedMaps,
    IReadOnlyDictionary<string, long> Statistics,
    long Version);

public sealed record SelectCosmeticsRequest(string Banner, string Title);
