using System.Text.Json;
using System.Text.Json.Serialization;
using TD.Application.Features.Achievements;
using TD.Application.Features.Campaign;
using TD.Application.Features.Difficulty;
using TD.Application.Features.Enemies;
using TD.Application.Features.Maps;
using TD.Application.Features.Progression;
using TD.Application.Features.Research;
using TD.Application.Features.Towers;
using TD.Application.Features.Waves;

namespace TD.Application.Features.Content;

public static class ContentJson
{
    /// <summary>Serializer settings for content documents: camelCase properties and enums.</summary>
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        WriteIndented = false,
    };
}

/// <summary>An immutable, validated view of all authoritative game content.</summary>
public sealed class ContentSnapshot
{
    public ContentSnapshot(
        string version,
        GameRules rules,
        IReadOnlyList<TowerDefinition> towers,
        IReadOnlyList<EnemyDefinition> enemies,
        IReadOnlyList<MapDefinition> maps,
        DifficultyCatalog difficulty,
        IReadOnlyList<ResearchNode> research,
        IReadOnlyList<AchievementDefinition> achievements,
        CommanderRules commander,
        IReadOnlyList<LevelDefinition> campaign,
        IReadOnlyList<LevelDefinition> challenges)
    {
        Version = version;
        Rules = rules;
        Towers = towers;
        Enemies = enemies;
        Maps = maps;
        Difficulty = difficulty;
        Research = research;
        Achievements = achievements;
        Commander = commander;
        Campaign = campaign;
        Challenges = challenges;

        TowersById = towers.ToDictionary(t => t.Id);
        EnemiesById = enemies.ToDictionary(e => e.Id);
        MapsById = maps.ToDictionary(m => m.Id);
        ResearchById = research.ToDictionary(r => r.Id);
        LevelsById = campaign.Concat(challenges).ToDictionary(l => l.Id);
        PresetsById = difficulty.Presets.ToDictionary(p => p.Id);
    }

    public string Version { get; }
    public GameRules Rules { get; }
    public IReadOnlyList<TowerDefinition> Towers { get; }
    public IReadOnlyList<EnemyDefinition> Enemies { get; }
    public IReadOnlyList<MapDefinition> Maps { get; }
    public DifficultyCatalog Difficulty { get; }
    public IReadOnlyList<ResearchNode> Research { get; }
    public IReadOnlyList<AchievementDefinition> Achievements { get; }
    public CommanderRules Commander { get; }
    public IReadOnlyList<LevelDefinition> Campaign { get; }
    public IReadOnlyList<LevelDefinition> Challenges { get; }

    public IReadOnlyDictionary<string, TowerDefinition> TowersById { get; }
    public IReadOnlyDictionary<string, EnemyDefinition> EnemiesById { get; }
    public IReadOnlyDictionary<string, MapDefinition> MapsById { get; }
    public IReadOnlyDictionary<string, ResearchNode> ResearchById { get; }
    public IReadOnlyDictionary<string, LevelDefinition> LevelsById { get; }
    public IReadOnlyDictionary<string, DifficultyPreset> PresetsById { get; }
}

public sealed record LevelSummary(
    string Id,
    GameMode Mode,
    int Number,
    string MapId,
    string Name,
    string Briefing,
    int Variant,
    int WaveCount,
    string? BossId,
    IReadOnlyList<string> UnlocksTowers,
    IReadOnlyList<string>? AllowedTowers,
    IReadOnlyList<string> Rules)
{
    public static LevelSummary From(LevelDefinition l) =>
        new(l.Id, l.Mode, l.Number, l.MapId, l.Name, l.Briefing, l.Variant, l.Waves.Count, l.BossId, l.UnlocksTowers, l.AllowedTowers, l.Rules);
}

/// <summary>Everything the client needs to render menus and run the simulation, minus per-level wave lists.</summary>
public sealed record ContentBundle(
    string Version,
    GameRules Rules,
    IReadOnlyList<TowerDefinition> Towers,
    IReadOnlyList<EnemyDefinition> Enemies,
    IReadOnlyList<MapDefinition> Maps,
    DifficultyCatalog Difficulty,
    IReadOnlyList<ResearchNode> Research,
    IReadOnlyList<AchievementDefinition> Achievements,
    CommanderRules Commander,
    IReadOnlyList<LevelSummary> Campaign,
    IReadOnlyList<LevelSummary> Challenges);
