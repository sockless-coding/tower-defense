using TD.Application.Features.Enemies;
using TD.Application.Features.Maps;
using TD.Application.Features.Towers;
using TD.Application.Features.Waves;

namespace TD.Application.Features.Campaign;

/// <summary>
/// Builds the 100-level campaign and the per-map challenge levels deterministically from content.
/// Level n uses map (n-1) mod 25 and variant (n-1) div 25, so every map is visited four times with rising complexity:
/// variant I opens one spawn, II two, III and IV all spawns, with IV also tightening the budget. Every tenth level is a boss.
/// </summary>
public static class CampaignGenerator
{
    public const int CampaignLength = 100;
    public const int DefaultCores = 20;

    private static readonly string[] VariantNames = ["I", "II", "III", "IV"];

    private static readonly string[] VariantBriefings =
    [
        "Scouts report a single column approaching. Establish the defence and learn the ground.",
        "The enemy is probing a second approach. Split your attention, but keep the vault sealed.",
        "Every gate is open and the machines are coming in force.",
        "An all-out assault. Resources are thin and the district's machinery is running at its most dangerous.",
    ];

    public static string CampaignLevelId(int number) => $"campaign-{number:000}";

    public static string BossFor(int number) => number switch
    {
        <= 30 => "pressure-titan",
        <= 60 => "ironclad-behemoth",
        _ => "grand-orrery",
    };

    public static IReadOnlyList<LevelDefinition> GenerateCampaign(
        IReadOnlyList<MapDefinition> maps,
        IReadOnlyList<EnemyDefinition> enemies,
        IReadOnlyList<TowerDefinition> towers)
    {
        var levels = new List<LevelDefinition>(CampaignLength);
        for (var n = 1; n <= CampaignLength; n++)
        {
            var map = maps[(n - 1) % maps.Count];
            var variant = (n - 1) / maps.Count % VariantNames.Length;
            var spawnCount = map.Cells(MapLegend.Spawn).Count();
            var active = variant switch
            {
                0 => 1,
                1 => Math.Min(2, spawnCount),
                _ => spawnCount,
            };
            var bossId = n % 10 == 0 ? BossFor(n) : null;

            var waves = WaveGenerator.Generate(
                new WaveGenerationSpec(
                    Tier: n,
                    WaveCount: WaveGenerator.WaveCountForTier(n),
                    SpawnCount: active,
                    BossId: bossId,
                    BudgetMul: 1 + 0.08 * variant,
                    Seed: SeededRandom.Hash(CampaignLevelId(n))),
                enemies);

            var unlocks = towers.Where(t => t.Unlock.CampaignLevel == n + 1).Select(t => t.Id).ToList();
            var name = $"{map.Name} {VariantNames[variant]}";
            var briefing = $"{map.Description} {VariantBriefings[variant]}" + (bossId is null ? string.Empty : $" Intelligence warns of a {Titleize(bossId)} leading the final wave.");

            levels.Add(new LevelDefinition(
                Id: CampaignLevelId(n),
                Mode: GameMode.Campaign,
                Number: n,
                MapId: map.Id,
                Name: name,
                Briefing: briefing,
                Variant: variant,
                ActiveSpawns: Enumerable.Range(0, active).ToList(),
                StartingGold: 300 + 6 * n - (variant == 3 ? 40 : 0),
                Cores: DefaultCores,
                MechanicIntensity: 0.5 + 0.25 * variant,
                Waves: waves,
                BossId: bossId,
                UnlocksTowers: unlocks,
                AllowedTowers: null,
                Rules: []));
        }

        return levels;
    }

    /// <summary>Challenge rule sets, cycled across maps. Rules are enforced by the client simulation and the server validator.</summary>
    private static readonly (string Name, string[] Rules, string[]? Categories, bool AirOnly)[] Challenges =
    [
        ("Iron Discipline", ["noSell", "maxTowers:12"], null, false),
        ("Guns Only", [], ["ballistic", "mechanical"], false),
        ("Single Core", ["cores:1"], null, false),
        ("Air Raid", [], null, true),
        ("Shoestring Budget", ["startingGoldMul:0.5"], null, false),
        ("No Frills", ["maxTier:2"], null, false),
        ("Hands Off", ["noInteraction", "noSell"], null, false),
        ("Elemental", [], ["electrical", "flame", "chemical"], false),
        ("Support Network", ["maxTowers:16"], ["support", "ballistic"], false),
    ];

    public static IReadOnlyList<LevelDefinition> GenerateChallenges(
        IReadOnlyList<MapDefinition> maps,
        IReadOnlyList<EnemyDefinition> enemies,
        IReadOnlyList<TowerDefinition> towers)
    {
        var levels = new List<LevelDefinition>(maps.Count);
        for (var i = 0; i < maps.Count; i++)
        {
            var map = maps[i];
            var (name, rules, categories, airOnly) = Challenges[i % Challenges.Length];
            var id = $"challenge-{map.Id}";
            var spawnCount = map.Cells(MapLegend.Spawn).Count();
            var tier = 30 + i * 2;
            var allowed = categories is null
                ? null
                : towers.Where(t => categories.Contains(t.Category.ToString(), StringComparer.OrdinalIgnoreCase)).Select(t => t.Id).ToList();

            var waves = WaveGenerator.Generate(
                new WaveGenerationSpec(
                    Tier: tier,
                    WaveCount: 20,
                    SpawnCount: spawnCount,
                    BossId: null,
                    BudgetMul: 1.1,
                    Seed: SeededRandom.Hash(id),
                    EnemyFilter: airOnly ? e => e.Movement == Movement.Air : null),
                enemies);

            var cores = rules.Select(r => r.StartsWith("cores:", StringComparison.Ordinal) ? int.Parse(r[6..]) : 0).DefaultIfEmpty(0).Max();
            levels.Add(new LevelDefinition(
                Id: id,
                Mode: GameMode.Challenge,
                Number: i + 1,
                MapId: map.Id,
                Name: $"{map.Name}: {name}",
                Briefing: $"Challenge — {name}. {DescribeRules(rules, categories, airOnly)}",
                Variant: 2,
                ActiveSpawns: Enumerable.Range(0, spawnCount).ToList(),
                StartingGold: 450 + tier * 6,
                Cores: cores > 0 ? cores : DefaultCores,
                MechanicIntensity: 1,
                Waves: waves,
                BossId: null,
                UnlocksTowers: [],
                AllowedTowers: allowed,
                Rules: rules));
        }

        return levels;
    }

    private static string DescribeRules(string[] rules, string[]? categories, bool airOnly)
    {
        var parts = new List<string>();
        foreach (var rule in rules)
        {
            var (key, value) = rule.Split(':') is [var k, var v] ? (k, v) : (rule, string.Empty);
            parts.Add(key switch
            {
                "noSell" => "Towers cannot be sold.",
                "maxTowers" => $"At most {value} towers.",
                "cores" => $"Only {value} power core{(value == "1" ? string.Empty : "s")}.",
                "startingGoldMul" => "Starting gold is halved.",
                "maxTier" => $"Upgrades are limited to tier {value}.",
                "noInteraction" => "Map interactions are disabled.",
                _ => rule,
            });
        }

        if (categories is not null)
        {
            parts.Add($"Only {string.Join(", ", categories)} towers may be built.");
        }

        if (airOnly)
        {
            parts.Add("Every enemy is airborne.");
        }

        return string.Join(" ", parts);
    }

    private static string Titleize(string id) =>
        string.Join(' ', id.Split('-').Select(p => char.ToUpperInvariant(p[0]) + p[1..]));
}
