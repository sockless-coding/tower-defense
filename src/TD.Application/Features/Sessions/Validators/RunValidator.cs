using System.Globalization;
using TD.Application.Features.Content;
using TD.Application.Features.Maps;
using TD.Application.Features.Towers;
using TD.Application.Features.Waves;

namespace TD.Application.Features.Sessions;

public sealed record ValidatedRun(bool Victory, int CoresLost, int TotalCores, long IncomeCeiling);

/// <summary>
/// Plausibility validation of a submitted run against the frozen session config. The server does not re-simulate;
/// instead it replays the action log's economy and structure exactly (costs, placements, upgrade order, rules) and
/// bounds everything it cannot replay (income, kills, timing). Any failure rejects the run without rewards.
/// </summary>
public static class RunValidator
{
    public const int MaxActions = 6000;
    private static readonly HashSet<string> TargetModes = ["first", "last", "strong", "weak", "close"];

    private sealed class PlacedTower
    {
        public required TowerDefinition Def { get; init; }
        public required (int X, int Y) Cell { get; init; }
        public List<string> Upgrades { get; } = [];
        public long Invested { get; set; }
    }

    public static (ValidatedRun? Run, string? Failure) Validate(
        SessionConfig config,
        ContentSnapshot content,
        CompleteSessionRequest request,
        TimeSpan wallClock)
    {
        var level = config.Level;
        var rules = content.Rules;
        var result = request.Result;
        var stats = result.Stats;
        var actions = request.Actions;
        var map = content.MapsById[level.MapId];
        var econ = new RunEconomy(config.Bonuses);
        var m = config.Modifiers;

        string? Rule(string key) => level.Rules.FirstOrDefault(r => r.StartsWith($"{key}:", StringComparison.Ordinal))?[(key.Length + 1)..];
        bool HasRule(string rule) => level.Rules.Contains(rule);
        double? RuleNumber(string key) => Rule(key) is { } v ? double.Parse(v, CultureInfo.InvariantCulture) : null;

        // ---------------------------------------------------------------- Shape and timing
        if (actions.Count > MaxActions)
        {
            return (null, "too many actions");
        }

        if (result.Outcome is not ("victory" or "defeat"))
        {
            return (null, "unknown outcome");
        }

        if (result.Ticks <= 0 || actions.Any(a => a.T < 0 || a.T > result.Ticks))
        {
            return (null, "action outside run");
        }

        for (var i = 1; i < actions.Count; i++)
        {
            if (actions[i].T < actions[i - 1].T)
            {
                return (null, "actions out of order");
            }
        }

        var gameSeconds = result.Ticks / (double)rules.TickRate;
        if (wallClock.TotalSeconds + 5 < gameSeconds / rules.MaxGameSpeed * 0.85)
        {
            return (null, "run finished faster than the maximum game speed allows");
        }

        // ---------------------------------------------------------------- Replay the economy and structure
        var startingGold = RunEconomy.JsRound((level.StartingGold + econ["startingGold"]) * (RuleNumber("startingGoldMul") ?? 1));
        var totalCores = RuleNumber("cores") is { } fixedCores ? (int)fixedCores : level.Cores + (int)econ["cores"];
        var ceiling = IncomeCeiling(config, content, econ);
        var maxTowers = RuleNumber("maxTowers");
        var maxTier = RuleNumber("maxTier");
        var unlocked = config.UnlockedTowers.ToHashSet();
        var interactionCooldownTicks = map.Interaction.Cooldown * econ["cooldownMul"] * rules.TickRate;

        var towers = new Dictionary<int, PlacedTower>();
        var nextTowerId = 1;
        long gold = startingGold;
        long spent = 0;
        int builds = 0, upgrades = 0, ultimates = 0, interacts = 0, calls = 0;
        int? lastInteract = null;

        foreach (var a in actions)
        {
            switch (a.Type)
            {
                case "build":
                {
                    if (a.Tower is null || !content.TowersById.TryGetValue(a.Tower, out var def) || !unlocked.Contains(def.Id))
                    {
                        return (null, "built a locked tower");
                    }

                    if (a.X is not { } fx || a.Y is not { } fy || fx != Math.Floor(fx) || fy != Math.Floor(fy))
                    {
                        return (null, "invalid build cell");
                    }

                    var cell = ((int)fx, (int)fy);
                    if (cell.Item1 < 0 || cell.Item2 < 0 || cell.Item1 >= map.Width || cell.Item2 >= map.Height)
                    {
                        return (null, "build out of bounds");
                    }

                    var tile = map.At(cell.Item1, cell.Item2);
                    if (!MapLegend.IsBuildable(tile) || towers.Values.Any(t => t.Cell == cell))
                    {
                        return (null, "built on an unbuildable cell");
                    }

                    if (def.MaxPerLevel is { } maxPer && towers.Values.Count(t => t.Def.Id == def.Id) >= maxPer)
                    {
                        return (null, "tower limit exceeded");
                    }

                    if (maxTowers is { } limit && towers.Count >= limit)
                    {
                        return (null, "challenge tower limit exceeded");
                    }

                    if (tile == MapLegend.Floor)
                    {
                        var blocked = towers.Values.Where(t => map.At(t.Cell.X, t.Cell.Y) == MapLegend.Floor).Select(t => t.Cell).ToHashSet();
                        blocked.Add(cell);
                        if (!MapPathing.RoutesIntact(map, blocked))
                        {
                            return (null, "placement sealed every route");
                        }
                    }

                    var cost = econ.TowerCost(def, m);
                    gold -= cost;
                    spent += cost;
                    towers[nextTowerId++] = new PlacedTower { Def = def, Cell = cell, Invested = cost };
                    builds++;
                    break;
                }

                case "upgrade":
                {
                    if (a.Id is not { } id || !towers.TryGetValue(id, out var tower) || a.Upgrade is null)
                    {
                        return (null, "upgraded a missing tower");
                    }

                    if (!TowerTiers.CanPurchase(tower.Def, tower.Upgrades, a.Upgrade))
                    {
                        return (null, "illegal upgrade order");
                    }

                    var upgrade = tower.Def.Upgrades.Single(u => u.Id == a.Upgrade);
                    if (maxTier is { } tierLimit && upgrade.Tier > tierLimit)
                    {
                        return (null, "challenge tier limit exceeded");
                    }

                    var cost = econ.UpgradeCost(upgrade, m);
                    gold -= cost;
                    spent += cost;
                    tower.Invested += cost;
                    tower.Upgrades.Add(upgrade.Id);
                    upgrades++;
                    if (upgrade.Tier == TowerTiers.Ultimate)
                    {
                        ultimates++;
                    }

                    break;
                }

                case "sell":
                {
                    if (HasRule("noSell"))
                    {
                        return (null, "sold in a no-sell challenge");
                    }

                    if (a.Id is not { } id || !towers.Remove(id, out var tower))
                    {
                        return (null, "sold a missing tower");
                    }

                    gold += econ.SellValue(tower.Invested, rules.SellRefund);
                    break;
                }

                case "target":
                    if (a.Id is not { } targetId || !towers.ContainsKey(targetId) || a.Mode is null || !TargetModes.Contains(a.Mode))
                    {
                        return (null, "invalid targeting change");
                    }

                    break;

                case "callWave":
                    if (++calls > level.Waves.Count)
                    {
                        return (null, "called more waves than exist");
                    }

                    break;

                case "interact":
                    if (HasRule("noInteraction"))
                    {
                        return (null, "interacted in a no-interaction challenge");
                    }

                    if (a.X is not { } ix || a.Y is not { } iy || !double.IsFinite(ix) || !double.IsFinite(iy) || ix < 0 || iy < 0 || ix >= map.Width || iy >= map.Height)
                    {
                        return (null, "interaction out of bounds");
                    }

                    if (lastInteract is { } previous && a.T - previous < interactionCooldownTicks - 1)
                    {
                        return (null, "interaction used during cooldown");
                    }

                    lastInteract = a.T;
                    interacts++;
                    break;

                default:
                    return (null, $"unknown action '{a.Type}'");
            }

            // Gold can only go negative if more was earned than the whole level could ever pay out.
            if (gold < -ceiling)
            {
                return (null, "spent more gold than the level can provide");
            }
        }

        // ---------------------------------------------------------------- Claimed statistics
        if (stats.GoldSpent != spent)
        {
            return (null, "reported spend does not match actions");
        }

        if (stats.TowersBuilt != builds || stats.UpgradesPurchased != upgrades || stats.UltimatesPurchased != ultimates || stats.InteractionsUsed != interacts)
        {
            return (null, "reported counts do not match actions");
        }

        if (stats.GoldEarned < 0 || stats.GoldEarned > ceiling)
        {
            return (null, "reported income exceeds the level's ceiling");
        }

        var allowedKills = KillAllowance(level, content, gameSeconds);
        foreach (var (enemyId, kills) in stats.Kills)
        {
            if (kills < 0 || !allowedKills.TryGetValue(enemyId, out var max) || kills > max)
            {
                return (null, $"implausible kills of {enemyId}");
            }
        }

        var bossGroups = level.Waves.SelectMany(w => w.Groups).Count(g => content.EnemiesById[g.Enemy].IsBoss);
        if (stats.BossesDefeated < 0 || stats.BossesDefeated > bossGroups)
        {
            return (null, "implausible boss kills");
        }

        if (result.WavesCleared < 0 || result.WavesCleared > level.Waves.Count || stats.WavesCleared != result.WavesCleared)
        {
            return (null, "implausible wave count");
        }

        if (result.CoresTotal != totalCores || result.CoresRemaining < 0 || result.CoresRemaining > totalCores)
        {
            return (null, "implausible core count");
        }

        if (stats.CoresRecovered < 0 || stats.CoresRecovered > totalCores * Math.Max(1, level.Waves.Count))
        {
            return (null, "implausible core recoveries");
        }

        var victory = result.Outcome == "victory";
        if (victory)
        {
            if (result.WavesCleared != level.Waves.Count || result.CoresRemaining < 1)
            {
                return (null, "victory without clearing every wave");
            }

            var minTicks = level.Waves.Max(w => w.SpawnDuration) * rules.TickRate;
            if (result.Ticks < minTicks)
            {
                return (null, "victory before the last enemy could spawn");
            }
        }
        else if (result.CoresRemaining != 0)
        {
            return (null, "defeat with cores remaining");
        }

        return (new ValidatedRun(victory, totalCores - result.CoresRemaining, totalCores, ceiling), null);
    }

    /// <summary>
    /// Upper bound on all gold a run can earn: every bounty (at the maximum possible bonus), clear bonuses, interest at
    /// its cap, gear forges at full output, and every early-call bonus.
    /// </summary>
    public static long IncomeCeiling(SessionConfig config, ContentSnapshot content, RunEconomy econ)
    {
        const double MaxBountyBonus = 2.5;
        var level = config.Level;
        var rules = content.Rules;
        var m = config.Modifiers;
        double total = 0;

        double Bounty(string enemyId, double hpMul, bool elite, int depth)
        {
            var e = content.EnemiesById[enemyId];
            var amount = Math.Ceiling(e.Bounty * Math.Sqrt(hpMul) * (elite ? rules.EliteBountyMul : 1) * m.Economy * econ["bountyMul"] * MaxBountyBonus);
            if (depth < 3)
            {
                foreach (var split in e.Abilities.Where(a => a.Kind == "splitOnDeath" && a.Spawns is not null))
                {
                    amount += split.Params["count"] * Bounty(split.Spawns!, hpMul, false, depth + 1);
                }
            }

            return amount;
        }

        foreach (var wave in level.Waves)
        {
            foreach (var g in wave.Groups)
            {
                total += g.Count * Bounty(g.Enemy, g.HpMul, g.Elite, 0);
            }

            total += Math.Ceiling(wave.ClearBonus * econ["clearBonusMul"] * m.Economy);
        }

        var waves = level.Waves.Count;
        total += (rules.InterestCap + econ["interestCap"]) * waves;
        total += 3 * 250 * m.Economy * waves;
        total += rules.EarlyCallBonusPerSecond * rules.WaveGap * waves;
        return (long)Math.Ceiling(total);
    }

    /// <summary>Maximum kills per enemy type: wave groups, split children, and spawner output over the run's length.</summary>
    public static Dictionary<string, long> KillAllowance(Campaign.LevelDefinition level, ContentSnapshot content, double runSeconds)
    {
        var allowed = new Dictionary<string, long>();
        void Add(string id, long n) => allowed[id] = allowed.GetValueOrDefault(id) + n;

        void AddWithChildren(string id, long count, int depth)
        {
            Add(id, count);
            if (depth >= 3)
            {
                return;
            }

            var e = content.EnemiesById[id];
            foreach (var a in e.Abilities.Concat(e.Phases.SelectMany(p => p.Abilities)).Where(a => a.Spawns is not null))
            {
                var perParent = a.Kind == "spawner"
                    ? (long)Math.Ceiling(runSeconds / Math.Max(1, a.Params["interval"])) * (long)a.Params["count"]
                    : (long)a.Params.GetValueOrDefault("count", 1);
                AddWithChildren(a.Spawns!, count * perParent, depth + 1);
            }
        }

        foreach (var g in level.Waves.SelectMany(w => w.Groups))
        {
            AddWithChildren(g.Enemy, g.Count, 0);
        }

        return allowed;
    }
}
