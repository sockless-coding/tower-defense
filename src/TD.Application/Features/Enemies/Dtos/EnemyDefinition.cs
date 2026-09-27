namespace TD.Application.Features.Enemies;

public enum Movement
{
    Ground,
    Air,
}

/// <summary>
/// Enemy ability kinds implemented by the simulation: cloak, shieldAura, healAura, splitOnDeath, spawner,
/// deflect, burrow, explodeOnDeath, sabotage, drain, smokeScreen, phase, enrage, regenerate, charge, armorShed.
/// </summary>
public sealed record EnemyAbility(string Kind, IReadOnlyDictionary<string, double> Params, string? Spawns = null);

public sealed record BossPhase(double HpBelow, string Name, double SpeedMul, double ArmorAdd, IReadOnlyList<EnemyAbility> Abilities);

/// <summary>
/// Authoritative enemy archetype. Armour is flat damage reduction per hit (minimum 15% of the hit always lands);
/// resistances are fractional per damage type, keyed by camel-case <c>DamageType</c> name (negative values are weaknesses).
/// </summary>
public sealed record EnemyDefinition(
    string Id,
    string Name,
    string Description,
    Movement Movement,
    double Hp,
    double Armor,
    double Speed,
    int Bounty,
    int CoreCarry,
    double Size,
    int Threat,
    int IntroducedAtLevel,
    bool IsBoss,
    IReadOnlyDictionary<string, double> Resist,
    IReadOnlyList<string> Immune,
    IReadOnlyList<EnemyAbility> Abilities,
    IReadOnlyList<BossPhase> Phases);
