using TD.Application.Features.Difficulty;
using TD.Application.Features.Research;
using TD.Application.Features.Towers;

namespace TD.Application.Features.Sessions;

/// <summary>
/// Server mirror of the client's economy formulas (src/TD.Client/src/game/sim/stats.ts). Any change here must be made
/// there too, or honest runs will be rejected.
/// </summary>
public sealed class RunEconomy
{
    private readonly Dictionary<string, double> _values = new()
    {
        ["startingGold"] = 0,
        ["bountyMul"] = 1,
        ["interestRate"] = 0,
        ["interestCap"] = 0,
        ["sellRefund"] = 0,
        ["clearBonusMul"] = 1,
        ["towerCostMul"] = 1,
        ["upgradeCostMul"] = 1,
        ["cores"] = 0,
        ["cooldownMul"] = 1,
    };

    public RunEconomy(IEnumerable<BonusEffect> bonuses)
    {
        foreach (var b in bonuses.Where(b => b.Target is "economy" or "cores" or "interaction"))
        {
            var current = _values.GetValueOrDefault(b.Stat);
            _values[b.Stat] = b.Op switch
            {
                ModOp.Add => current + b.Value,
                ModOp.Mul => current * b.Value,
                _ => b.Value,
            };
        }
    }

    public double this[string key] => _values.GetValueOrDefault(key);

    /// <summary>JavaScript's Math.round for positive values: halves round up.</summary>
    public static long JsRound(double value) => (long)Math.Floor(value + 0.5);

    public long TowerCost(TowerDefinition def, DifficultyModifiers m) => JsRound(def.Cost * m.TowerCost * this["towerCostMul"]);

    public long UpgradeCost(TowerUpgrade u, DifficultyModifiers m) => JsRound(u.Cost * m.TowerCost * this["upgradeCostMul"]);

    public long SellValue(long invested, double baseRefund) => (long)Math.Floor(invested * Math.Min(1, baseRefund + this["sellRefund"]));
}
