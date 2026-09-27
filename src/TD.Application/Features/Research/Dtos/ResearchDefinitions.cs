using TD.Application.Features.Towers;

namespace TD.Application.Features.Research;

public enum ResearchCategory
{
    SteamPower,
    Engineering,
    Electricity,
    Chemistry,
    MilitaryScience,
}

/// <summary>
/// A permanent bonus. <see cref="Target"/> selects what it applies to:
/// <c>all</c>, <c>category:&lt;TowerCategory&gt;</c>, <c>tower:&lt;id&gt;</c>, <c>economy</c> (startingGold, bountyMul,
/// interestRate, interestCap, sellRefund, clearBonusMul), <c>cores</c> (cores), <c>interaction</c> (cooldownMul),
/// or <c>unlock</c> where <see cref="StatMod.Stat"/> names the unlocked thing (e.g. <c>tower:singularium-engine</c>).
/// </summary>
public sealed record BonusEffect(string Target, string Stat, ModOp Op, double Value);

public sealed record ResearchNode(
    string Id,
    string Name,
    ResearchCategory Category,
    int Tier,
    int Cost,
    IReadOnlyList<string> Requires,
    string Description,
    IReadOnlyList<BonusEffect> Effects,
    int X,
    int Y);
