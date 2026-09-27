using TD.Application.Features.Research;

namespace TD.Application.Features.Progression;

public enum CommanderRewardKind
{
    Gears,
    ResearchPoints,
    Cosmetic,
    Perk,
    Feature,
}

public sealed record CommanderReward(int Level, CommanderRewardKind Kind, string Id, string Name, string Description, int Amount, IReadOnlyList<BonusEffect> Effects);

public sealed record CosmeticDefinition(string Id, string Kind, string Name, string Description);

/// <summary>XP required to go from level L to L+1 is <c>round(BaseXp × L^Exponent)</c>.</summary>
public sealed record CommanderRules(int MaxLevel, double BaseXp, double Exponent, IReadOnlyList<CommanderReward> Rewards, IReadOnlyList<CosmeticDefinition> Cosmetics)
{
    public long XpToNext(int level) => level >= MaxLevel ? 0 : (long)Math.Round(BaseXp * Math.Pow(level, Exponent));

    public (int Level, long XpIntoLevel) LevelFor(long totalXp)
    {
        var level = 1;
        var remaining = totalXp;
        while (level < MaxLevel && remaining >= XpToNext(level))
        {
            remaining -= XpToNext(level);
            level++;
        }

        return (level, remaining);
    }
}
