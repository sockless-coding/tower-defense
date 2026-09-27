namespace TD.Application.Features.Difficulty;

/// <summary>
/// The full modifier set applied to a run. Multipliers are relative to 1.0 (Engineer baseline).
/// The server always recomputes <see cref="DifficultyMath.RewardMultiplier"/> from these values.
/// </summary>
public sealed record DifficultyModifiers(
    double EnemySpeed,
    double EnemyHealth,
    double EnemyArmor,
    double TowerCost,
    double TowerDamage,
    double Economy,
    double Fog,
    double EliteChance,
    double BossFrequency);

public sealed record DifficultyPreset(string Id, string Name, string Description, int Order, int RequiredCommanderLevel, DifficultyModifiers Modifiers);

public sealed record ModifierRange(string Key, string Name, double Min, double Max, double Step, double RewardWeight, bool HigherIsHarder);

public sealed record DifficultyCatalog(IReadOnlyList<DifficultyPreset> Presets, IReadOnlyList<ModifierRange> Ranges);

public static class DifficultyMath
{
    public const double MinReward = 0.25;
    public const double MaxReward = 6.0;

    public static double Get(DifficultyModifiers m, string key) => key switch
    {
        "enemySpeed" => m.EnemySpeed,
        "enemyHealth" => m.EnemyHealth,
        "enemyArmor" => m.EnemyArmor,
        "towerCost" => m.TowerCost,
        "towerDamage" => m.TowerDamage,
        "economy" => m.Economy,
        "fog" => m.Fog,
        "eliteChance" => m.EliteChance,
        "bossFrequency" => m.BossFrequency,
        _ => throw new ArgumentOutOfRangeException(nameof(key), key, "Unknown modifier"),
    };

    /// <summary>
    /// Each modifier contributes <c>1 + weight × harderness</c>, where harderness is the signed distance from the
    /// neutral value. The product is clamped so easy settings still pay a little and extreme ones cannot overflow.
    /// </summary>
    public static double RewardMultiplier(DifficultyModifiers modifiers, IEnumerable<ModifierRange> ranges)
    {
        var product = 1.0;
        foreach (var range in ranges)
        {
            var neutral = range.Key is "fog" or "eliteChance" ? 0.0 : 1.0;
            var delta = Get(modifiers, range.Key) - neutral;
            var harder = range.HigherIsHarder ? delta : -delta;
            product *= Math.Max(0.2, 1 + range.RewardWeight * harder);
        }

        return Math.Round(Math.Clamp(product, MinReward, MaxReward), 3);
    }

    public static IEnumerable<string> Validate(DifficultyModifiers modifiers, IEnumerable<ModifierRange> ranges)
    {
        foreach (var range in ranges)
        {
            var value = Get(modifiers, range.Key);
            if (double.IsNaN(value) || value < range.Min - 1e-9 || value > range.Max + 1e-9)
            {
                yield return $"{range.Name} must be between {range.Min} and {range.Max}.";
            }
        }
    }
}
