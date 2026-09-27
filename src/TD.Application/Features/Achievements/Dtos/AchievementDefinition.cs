namespace TD.Application.Features.Achievements;

/// <summary>Unlocked when the player's server-side statistic <see cref="Stat"/> reaches <see cref="Threshold"/>.</summary>
public sealed record AchievementDefinition(
    string Id,
    string Name,
    string Description,
    string Category,
    string Stat,
    long Threshold,
    int RewardGears,
    string? RewardCosmetic,
    bool Hidden);
