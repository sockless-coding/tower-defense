using System.Globalization;
using TD.Application.Features.Content;
using TD.Application.Features.Maps;
using TD.Application.Features.Waves;

namespace TD.Application.Features.Campaign;

/// <summary>
/// Generates non-campaign levels on demand: survival and endless per map, plus the rotating daily challenge and weekly
/// event, whose map, rules and waves are all derived from the date so every player gets the same one.
/// </summary>
public static class ModeLevels
{
    public const int SurvivalWaves = 60;
    public const int EndlessWaves = 150;

    private static readonly string[][] EventRules =
    [
        [],
        ["noSell"],
        ["maxTowers:14"],
        ["maxTier:3"],
        ["noInteraction"],
        ["startingGoldMul:0.7"],
    ];

    public static string DailyKey(DateTime utc) => utc.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    public static string WeeklyKey(DateTime utc) =>
        $"{ISOWeek.GetYear(utc)}-W{ISOWeek.GetWeekOfYear(utc):00}";

    public static DateTime DailyEndsAt(DateTime utc) => utc.Date.AddDays(1);

    public static DateTime WeeklyEndsAt(DateTime utc) =>
        ISOWeek.ToDateTime(ISOWeek.GetYear(utc), ISOWeek.GetWeekOfYear(utc), DayOfWeek.Monday).AddDays(7);

    public static LevelDefinition Survival(ContentSnapshot c, MapDefinition map) =>
        Build(c, map, GameMode.Survival, $"survival-{map.Id}", $"{map.Name}: Survival",
            "Hold for as long as the vault stands. Waves never stop, and they only grow stronger.",
            tier: 30, waves: SurvivalWaves, hpGrowth: 0.035, gold: 650, rules: [], allowed: null);

    public static LevelDefinition Endless(ContentSnapshot c, MapDefinition map) =>
        Build(c, map, GameMode.Endless, $"endless-{map.Id}", $"{map.Name}: Endless Nightmare",
            "Nightmare difficulty, no respite, no end. How deep can you go?",
            tier: 60, waves: EndlessWaves, hpGrowth: 0.06, gold: 800, rules: [], allowed: null);

    public static LevelDefinition Daily(ContentSnapshot c, string key)
    {
        var rng = new SeededRandom(SeededRandom.Hash($"daily:{key}"));
        var map = c.Maps[rng.Next(c.Maps.Count)];
        var rules = EventRules[rng.Next(EventRules.Length)];
        return Build(c, map, GameMode.Daily, $"daily-{key}", $"Daily Challenge · {map.Name}",
            $"Today's challenge on {map.Name}. Everyone faces the same waves; climb the daily leaderboard.",
            tier: 40, waves: 25, hpGrowth: 0.02, gold: 700, rules: rules, allowed: null, seedKey: $"daily:{key}");
    }

    public static LevelDefinition Weekly(ContentSnapshot c, string key)
    {
        var rng = new SeededRandom(SeededRandom.Hash($"weekly:{key}"));
        var map = c.Maps[rng.Next(c.Maps.Count)];
        var rules = EventRules[1 + rng.Next(EventRules.Length - 1)];
        // A themed arsenal: a random dozen towers from those every veteran has unlocked.
        var pool = c.Towers.Where(t => t.Unlock.Research is null && t.Unlock.CampaignLevel <= 40).Select(t => t.Id).ToList();
        var allowed = new List<string>();
        while (allowed.Count < 12 && pool.Count > 0)
        {
            var i = rng.Next(pool.Count);
            allowed.Add(pool[i]);
            pool.RemoveAt(i);
        }

        return Build(c, map, GameMode.Weekly, $"weekly-{key}", $"Weekly Event · {map.Name}",
            "This week's grand event: a restricted arsenal against a relentless assault. Rankings reset every Monday.",
            tier: 55, waves: 35, hpGrowth: 0.025, gold: 900, rules: rules, allowed: allowed, seedKey: $"weekly:{key}");
    }

    private static LevelDefinition Build(
        ContentSnapshot c,
        MapDefinition map,
        GameMode mode,
        string id,
        string name,
        string briefing,
        int tier,
        int waves,
        double hpGrowth,
        int gold,
        string[] rules,
        IReadOnlyList<string>? allowed,
        string? seedKey = null)
    {
        var spawnCount = map.Cells(MapLegend.Spawn).Count();
        var waveList = WaveGenerator.Generate(
            new WaveGenerationSpec(tier, waves, spawnCount, BossId: null, BudgetMul: 1, Seed: SeededRandom.Hash(seedKey ?? id), HpGrowthPerWave: hpGrowth),
            c.Enemies);

        // Long modes get a boss every tenth wave, cycling through the three.
        var bosses = new[] { "pressure-titan", "ironclad-behemoth", "grand-orrery" };
        var withBosses = waveList.Select(w => w.Number % 10 == 0
            ? w with { Groups = [.. w.Groups, new WaveGroup(bosses[(w.Number / 10 - 1) % 3], 1, 1, 0, 6, false, Math.Round(0.4 + w.Number * 0.04, 3))] }
            : w).ToList();

        var fixedCores = rules.Select(r => r.StartsWith("cores:", StringComparison.Ordinal) ? int.Parse(r[6..], CultureInfo.InvariantCulture) : 0).DefaultIfEmpty(0).Max();
        return new LevelDefinition(
            Id: id,
            Mode: mode,
            Number: tier,
            MapId: map.Id,
            Name: name,
            Briefing: briefing,
            Variant: 2,
            ActiveSpawns: Enumerable.Range(0, spawnCount).ToList(),
            StartingGold: gold,
            Cores: fixedCores > 0 ? fixedCores : CampaignGenerator.DefaultCores,
            MechanicIntensity: 1,
            Waves: withBosses,
            BossId: null,
            UnlocksTowers: [],
            AllowedTowers: allowed,
            Rules: rules);
    }
}
