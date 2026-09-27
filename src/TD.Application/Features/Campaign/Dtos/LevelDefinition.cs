using TD.Application.Features.Waves;

namespace TD.Application.Features.Campaign;

public enum GameMode
{
    Campaign,
    Survival,
    Challenge,
    Daily,
    Weekly,
    Endless,
}

/// <summary>A fully specified playable level. Campaign levels are generated deterministically at seed time.</summary>
public sealed record LevelDefinition(
    string Id,
    GameMode Mode,
    int Number,
    string MapId,
    string Name,
    string Briefing,
    int Variant,
    IReadOnlyList<int> ActiveSpawns,
    int StartingGold,
    int Cores,
    double MechanicIntensity,
    IReadOnlyList<WaveDefinition> Waves,
    string? BossId,
    IReadOnlyList<string> UnlocksTowers,
    IReadOnlyList<string>? AllowedTowers,
    IReadOnlyList<string> Rules);
