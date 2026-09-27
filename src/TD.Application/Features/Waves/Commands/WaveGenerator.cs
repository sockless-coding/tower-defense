using TD.Application.Features.Enemies;

namespace TD.Application.Features.Waves;

/// <param name="Tier">Effective difficulty tier (campaign level number). Controls the enemy pool and base budget.</param>
/// <param name="HpGrowthPerWave">Additional health multiplier per wave; survival and endless modes ramp faster.</param>
/// <param name="EnemyFilter">Optional restriction of the enemy pool (e.g. air-only challenges).</param>
public sealed record WaveGenerationSpec(
    int Tier,
    int WaveCount,
    int SpawnCount,
    string? BossId,
    double BudgetMul,
    uint Seed,
    double HpGrowthPerWave = 0.012,
    Func<EnemyDefinition, bool>? EnemyFilter = null);

/// <summary>
/// Deterministic wave composer. Each wave receives a threat budget that grows with tier and wave number; the budget is
/// spent on one to three groups drawn from the unlocked enemy pool, favouring recently introduced enemies.
/// </summary>
public static class WaveGenerator
{
    public const int MaxGroupSize = 60;

    public static int WaveCountForTier(int tier) => 8 + tier / 5;

    public static double BaseBudget(int tier) => 40 + 9 * tier;

    public static double HpMulFor(int tier, int waveIndex, double growthPerWave) => 1 + 0.025 * (tier - 1) + growthPerWave * waveIndex;

    public static IReadOnlyList<WaveDefinition> Generate(WaveGenerationSpec spec, IReadOnlyList<EnemyDefinition> enemies)
    {
        var rng = new SeededRandom(spec.Seed);
        var pool = enemies
            .Where(e => !e.IsBoss && e.Threat > 0 && e.IntroducedAtLevel <= Math.Max(1, spec.Tier))
            .Where(e => spec.EnemyFilter?.Invoke(e) ?? true)
            .OrderBy(e => e.IntroducedAtLevel)
            .ToList();

        if (pool.Count == 0)
        {
            pool = enemies.Where(e => !e.IsBoss && e.Threat > 0).OrderBy(e => e.Threat).Take(1).ToList();
        }

        var waves = new List<WaveDefinition>(spec.WaveCount);
        for (var w = 0; w < spec.WaveCount; w++)
        {
            var budget = BaseBudget(spec.Tier) * Math.Pow(1 + 0.16 * w, 1.3) * spec.BudgetMul;
            var hpMul = Math.Round(HpMulFor(spec.Tier, w, spec.HpGrowthPerWave), 3);
            var groupCount = 1 + (w >= 3 ? rng.Next(2) : 0) + (w >= 8 && spec.Tier > 15 ? rng.Next(2) : 0);
            var groups = new List<WaveGroup>(groupCount + 1);
            var delay = 0.0;

            for (var g = 0; g < groupCount; g++)
            {
                var enemy = w < 2
                    ? pool[rng.Next(Math.Min(2, pool.Count))]
                    : rng.Pick(pool, e => spec.Tier - e.IntroducedAtLevel < 6 ? 3.0 : 1.0);
                var share = budget / groupCount;
                var count = Math.Clamp((int)Math.Round(share / enemy.Threat), 1, MaxGroupSize);
                var interval = Math.Round(Math.Min(Math.Clamp(0.3 + enemy.Size * 1.8, 0.25, 1.6), 24.0 / count), 2);

                groups.Add(new WaveGroup(enemy.Id, count, interval, rng.Next(spec.SpawnCount), Math.Round(delay, 2), false, hpMul));
                delay += rng.Range(2, 5);
            }

            if (spec.BossId is not null && w == spec.WaveCount - 1)
            {
                var bossHpMul = Math.Round(1 + 0.015 * (spec.Tier - 1), 3);
                groups.Add(new WaveGroup(spec.BossId, 1, 1, rng.Next(spec.SpawnCount), Math.Round(delay + 4, 2), false, bossHpMul));
            }

            waves.Add(new WaveDefinition(w + 1, groups, 15 + 3 * (w + 1) + spec.Tier / 2));
        }

        return waves;
    }
}
