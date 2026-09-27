namespace TD.Application.Features.Waves;

/// <summary>A run of identical enemies released from one spawn.</summary>
/// <param name="Spawn">Index into the level's active spawns.</param>
/// <param name="Delay">Seconds after the wave starts before the first enemy of this group appears.</param>
/// <param name="Interval">Seconds between consecutive enemies of the group.</param>
/// <param name="HpMul">Level scaling applied to health. Bounties scale by its square root.</param>
public sealed record WaveGroup(string Enemy, int Count, double Interval, int Spawn, double Delay, bool Elite, double HpMul);

public sealed record WaveDefinition(int Number, IReadOnlyList<WaveGroup> Groups, int ClearBonus)
{
    /// <summary>Seconds from wave start until its last enemy has spawned.</summary>
    public double SpawnDuration => Groups.Count == 0 ? 0 : Groups.Max(g => g.Delay + Math.Max(0, g.Count - 1) * g.Interval);
}

/// <summary>Global simulation and economy constants shared verbatim with the client.</summary>
public sealed record GameRules(
    int TickRate,
    double MaxGameSpeed,
    double SellRefund,
    double InterestRate,
    int InterestCap,
    double MinArmorDamageFraction,
    double EliteHpMul,
    double EliteArmorAdd,
    double EliteSpeedMul,
    double EliteBountyMul,
    double WaveGap,
    double EarlyCallBonusPerSecond,
    double CoreReturnSpeed,
    double CoreDropPickupRadius,
    int MinSecondsPerWave);
