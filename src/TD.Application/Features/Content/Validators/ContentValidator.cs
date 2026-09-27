using TD.Application.Features.Maps;
using TD.Application.Features.Towers;

namespace TD.Application.Features.Content;

/// <summary>Cross-reference and invariant checks over a whole content snapshot. Startup fails if any check fails.</summary>
public static class ContentValidator
{
    private static readonly HashSet<string> DamageTypes = Enum.GetNames<DamageType>().Select(n => char.ToLowerInvariant(n[0]) + n[1..]).ToHashSet();

    public static IReadOnlyList<string> Validate(ContentSnapshot c)
    {
        var errors = new List<string>();
        void Check(bool condition, string message)
        {
            if (!condition)
            {
                errors.Add(message);
            }
        }

        var cosmetics = c.Commander.Cosmetics.Select(x => x.Id).ToHashSet();
        var categories = Enum.GetNames<TowerCategory>().Select(n => n.ToLowerInvariant()).ToHashSet();

        foreach (var t in c.Towers)
        {
            var slots = t.Upgrades.Select(u => $"{u.Tier}{u.Branch}").OrderBy(s => s).ToList();
            Check(slots.SequenceEqual(["2A", "2B", "3A", "3B", "4U"]), $"Tower {t.Id} must have upgrades 2A, 2B, 3A, 3B and 4U.");
            Check(t.Cost > 0 && t.Upgrades.All(u => u.Cost > 0), $"Tower {t.Id} has a non-positive cost.");
            Check(t.Stats.Values.All(v => v >= 0 && double.IsFinite(v)), $"Tower {t.Id} has an invalid stat.");
            Check(t.Unlock.CampaignLevel is >= 1 and <= 100, $"Tower {t.Id} unlock level out of range.");
            Check(t.Unlock.Research is null || c.ResearchById.ContainsKey(t.Unlock.Research), $"Tower {t.Id} references unknown research {t.Unlock.Research}.");
            Check(t.Prestige.GearCost.Count == t.Prestige.MaxRank, $"Tower {t.Id} prestige costs do not match max rank.");
            Check(cosmetics.Contains(t.Prestige.SkinAtMaxRank), $"Tower {t.Id} prestige skin {t.Prestige.SkinAtMaxRank} is not a cosmetic.");
            foreach (var s in t.Synergies)
            {
                var ok = s.Partner.StartsWith("category:", StringComparison.Ordinal)
                    ? categories.Contains(s.Partner[9..])
                    : c.TowersById.ContainsKey(s.Partner);
                Check(ok, $"Tower {t.Id} synergy partner {s.Partner} is unknown.");
            }
        }

        foreach (var e in c.Enemies)
        {
            Check(e.Hp > 0 && e.Speed > 0, $"Enemy {e.Id} needs positive hp and speed.");
            Check(e.Resist.Keys.All(DamageTypes.Contains), $"Enemy {e.Id} has an unknown resistance key.");
            foreach (var spawn in e.Abilities.Select(a => a.Spawns).Concat(e.Phases.SelectMany(p => p.Abilities).Select(a => a.Spawns)).OfType<string>())
            {
                Check(c.EnemiesById.ContainsKey(spawn), $"Enemy {e.Id} spawns unknown enemy {spawn}.");
            }
        }

        foreach (var m in c.Maps)
        {
            Check(m.Grid.Count > 0 && m.Grid.All(r => r.Length == m.Width), $"Map {m.Id} grid rows differ in width.");
            Check(m.Cells(MapLegend.Core).Count() == 1, $"Map {m.Id} must have exactly one core.");
            Check(m.Cells(MapLegend.Spawn).Any(), $"Map {m.Id} has no spawn.");
            if (errors.Count == 0)
            {
                Check(MapPathing.RoutesIntact(m, new HashSet<(int, int)>()), $"Map {m.Id} has a spawn that cannot reach the core.");
            }
        }

        foreach (var r in c.Research)
        {
            Check(r.Requires.All(c.ResearchById.ContainsKey), $"Research {r.Id} requires an unknown node.");
            foreach (var unlock in r.Effects.Where(e => e.Target == "unlock"))
            {
                Check(unlock.Stat.StartsWith("tower:", StringComparison.Ordinal) && c.TowersById.ContainsKey(unlock.Stat[6..]), $"Research {r.Id} unlocks unknown {unlock.Stat}.");
            }
        }

        Check(!HasCycle(c), "Research tree contains a cycle.");

        foreach (var a in c.Achievements)
        {
            Check(a.RewardCosmetic is null || cosmetics.Contains(a.RewardCosmetic), $"Achievement {a.Id} awards unknown cosmetic {a.RewardCosmetic}.");
        }

        foreach (var reward in c.Commander.Rewards.Where(r => r.Kind == Progression.CommanderRewardKind.Cosmetic))
        {
            Check(cosmetics.Contains(reward.Id), $"Commander level {reward.Level} awards unknown cosmetic {reward.Id}.");
        }

        foreach (var l in c.Campaign.Concat(c.Challenges))
        {
            Check(c.MapsById.ContainsKey(l.MapId), $"Level {l.Id} uses unknown map {l.MapId}.");
            foreach (var g in l.Waves.SelectMany(w => w.Groups))
            {
                Check(c.EnemiesById.ContainsKey(g.Enemy), $"Level {l.Id} spawns unknown enemy {g.Enemy}.");
                Check(g.Spawn >= 0 && g.Spawn < l.ActiveSpawns.Count, $"Level {l.Id} uses spawn index {g.Spawn} out of range.");
                Check(g.Count > 0 && g.Interval > 0, $"Level {l.Id} has an empty or zero-interval group.");
            }
        }

        Check(c.Campaign.Count == Campaign.CampaignGenerator.CampaignLength, "Campaign must have 100 levels.");
        return errors;
    }

    private static bool HasCycle(ContentSnapshot c)
    {
        var state = new Dictionary<string, int>();
        bool Visit(string id)
        {
            if (state.TryGetValue(id, out var s))
            {
                return s == 1;
            }

            state[id] = 1;
            var cycle = c.ResearchById.TryGetValue(id, out var node) && node.Requires.Any(Visit);
            state[id] = 2;
            return cycle;
        }

        return c.Research.Any(r => Visit(r.Id));
    }
}
