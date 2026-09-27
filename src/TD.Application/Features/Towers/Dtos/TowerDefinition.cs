namespace TD.Application.Features.Towers;

public enum TowerCategory
{
    Ballistic,
    Electrical,
    Flame,
    Chemical,
    Support,
    Mechanical,
    Experimental,
}

public enum DamageType
{
    Ballistic,
    Electric,
    Fire,
    Chemical,
    Force,
    Temporal,
}

/// <summary>How a tower delivers its attack. The client simulation implements one behaviour per kind.</summary>
public enum AttackKind
{
    Projectile,
    Hitscan,
    Lob,
    Chain,
    Beam,
    Cone,
    Pulse,
    Mine,
    Field,
    Support,
    Economy,
}

public enum TargetLayer
{
    Ground,
    Air,
    Both,
}

public enum ModOp
{
    Add,
    Mul,
    Set,
}

/// <summary>A change to a named numeric stat, e.g. <c>damage × 1.4</c> or <c>chains + 2</c>.</summary>
public sealed record StatMod(string Stat, ModOp Op, double Value);

/// <summary>
/// A generic, parameterised special ability. The simulation implements each <see cref="Kind"/> once;
/// towers give them flavour names. Known kinds: everyNth, periodicPulse, mapStrike, execute, onKillExplode,
/// lingeringGround, pull, splitShot, ramp, overcharge, orbital, singularity, rewind, prismSplit.
/// </summary>
public sealed record AbilitySpec(string Kind, string Name, string Description, IReadOnlyDictionary<string, double> Params);

public sealed record TowerUpgrade(
    string Id,
    int Tier,
    string Branch,
    string Name,
    string Description,
    int Cost,
    IReadOnlyList<StatMod> Mods,
    IReadOnlyList<AbilitySpec> Abilities);

public sealed record TowerPrestige(int MaxRank, IReadOnlyList<int> GearCost, IReadOnlyList<StatMod> ModsPerRank, string SkinAtMaxRank);

public sealed record TowerSynergy(string Partner, double Radius, string Name, string Description, IReadOnlyList<StatMod> Mods);

public sealed record TowerUnlock(int CampaignLevel, string? Research);

/// <summary>
/// Authoritative tower definition. <see cref="Stats"/> is a flat dictionary (damage, rate, range, splash, pierce,
/// chains, burnDps, slowPct, buffDamage, income, ...) so upgrades, research, prestige and synergies can all be
/// expressed as <see cref="StatMod"/>s against the same keys.
/// </summary>
public sealed record TowerDefinition(
    string Id,
    string Name,
    TowerCategory Category,
    string Description,
    string Flavor,
    int Cost,
    AttackKind Attack,
    DamageType DamageType,
    TargetLayer Targets,
    IReadOnlyDictionary<string, double> Stats,
    IReadOnlyList<AbilitySpec> Abilities,
    IReadOnlyList<TowerUpgrade> Upgrades,
    TowerPrestige Prestige,
    IReadOnlyList<TowerSynergy> Synergies,
    TowerUnlock Unlock,
    int? MaxPerLevel);

public static class TowerTiers
{
    public const int Base = 1;
    public const int Ultimate = 4;

    /// <summary>Upgrade path rule: exactly one of tier 2 (A/B), then one of tier 3 (A/B), then the ultimate.</summary>
    public static bool CanPurchase(TowerDefinition tower, IReadOnlyCollection<string> owned, string upgradeId)
    {
        var upgrade = tower.Upgrades.FirstOrDefault(u => u.Id == upgradeId);
        if (upgrade is null || owned.Contains(upgradeId))
        {
            return false;
        }

        var ownedTiers = tower.Upgrades.Where(u => owned.Contains(u.Id)).Select(u => u.Tier).ToHashSet();
        return !ownedTiers.Contains(upgrade.Tier) && (upgrade.Tier == 2 || ownedTiers.Contains(upgrade.Tier - 1));
    }
}
