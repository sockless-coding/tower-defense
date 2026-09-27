using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TD.Application.Features.Achievements;
using TD.Application.Features.Campaign;
using TD.Application.Features.Difficulty;
using TD.Application.Features.Enemies;
using TD.Application.Features.Maps;
using TD.Application.Features.Progression;
using TD.Application.Features.Research;
using TD.Application.Features.Towers;
using TD.Application.Features.Waves;
using TD.Application.Infrastructure.Data;

namespace TD.Application.Features.Content;

/// <summary>Holds the current validated content snapshot. Replaced atomically on reload.</summary>
public sealed class ContentCatalog
{
    private ContentSnapshot? _current;

    public ContentSnapshot Current => _current ?? throw new InvalidOperationException("Content has not been loaded.");

    public void Set(ContentSnapshot snapshot) => Interlocked.Exchange(ref _current, snapshot);
}

/// <summary>
/// Seeds content documents from <c>Content/*.json</c>, generates campaign and challenge levels, persists them, and
/// publishes the validated snapshot to <see cref="ContentCatalog"/>. Rows marked as overrides are never replaced.
/// </summary>
public sealed class ContentSeeder(AppDbContext db, ContentCatalog catalog, TimeProvider clock, ILogger<ContentSeeder> logger)
{
    public const string LevelKind = "level";

    public static readonly string[] BaseKinds = ["rules", "towers", "enemies", "maps", "difficulty", "research", "achievements", "commander"];

    public static string ContentDirectory => Path.Combine(AppContext.BaseDirectory, "Content");

    public async Task<ContentSnapshot> SeedAndLoadAsync(CancellationToken ct = default)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var existing = await db.ContentDocuments.ToDictionaryAsync(d => (d.Kind, d.Key), ct);

        foreach (var kind in BaseKinds)
        {
            var json = await File.ReadAllTextAsync(Path.Combine(ContentDirectory, $"{kind}.json"), ct);
            Upsert(existing, kind, string.Empty, json, now);
        }

        string Doc(string kind) => existing[(kind, string.Empty)].Json;
        T Read<T>(string kind) => JsonSerializer.Deserialize<T>(Doc(kind), ContentJson.Options)
            ?? throw new InvalidOperationException($"Content document '{kind}' is empty.");

        var rules = Read<GameRules>("rules");
        var towers = Read<List<TowerDefinition>>("towers");
        var enemies = Read<List<EnemyDefinition>>("enemies");
        var maps = Read<List<MapDefinition>>("maps");
        var difficulty = Read<DifficultyCatalog>("difficulty");
        var research = Read<List<ResearchNode>>("research");
        var achievements = Read<List<AchievementDefinition>>("achievements");
        var commander = Read<CommanderRules>("commander");

        var generated = CampaignGenerator.GenerateCampaign(maps, enemies, towers)
            .Concat(CampaignGenerator.GenerateChallenges(maps, enemies, towers))
            .ToList();

        var levels = new List<LevelDefinition>(generated.Count);
        foreach (var level in generated)
        {
            var doc = Upsert(existing, LevelKind, level.Id, JsonSerializer.Serialize(level, ContentJson.Options), now);
            levels.Add(doc.IsOverride ? JsonSerializer.Deserialize<LevelDefinition>(doc.Json, ContentJson.Options)! : level);
        }

        var generatedIds = generated.Select(l => l.Id).ToHashSet();
        foreach (var stale in existing.Values.Where(d => d.Kind == LevelKind && !d.IsOverride && !generatedIds.Contains(d.Key)))
        {
            db.ContentDocuments.Remove(stale);
        }

        await db.SaveChangesAsync(ct);

        var version = ComputeVersion(existing.Values.Where(d => d.Kind != LevelKind || generatedIds.Contains(d.Key)));
        var snapshot = new ContentSnapshot(
            version,
            rules,
            towers,
            enemies,
            maps,
            difficulty,
            research,
            achievements,
            commander,
            levels.Where(l => l.Mode == GameMode.Campaign).OrderBy(l => l.Number).ToList(),
            levels.Where(l => l.Mode == GameMode.Challenge).OrderBy(l => l.Number).ToList());

        var errors = ContentValidator.Validate(snapshot);
        if (errors.Count > 0)
        {
            throw new InvalidOperationException("Content validation failed:" + Environment.NewLine + string.Join(Environment.NewLine, errors));
        }

        catalog.Set(snapshot);
        logger.LogInformation(
            "Content {Version} loaded: {Towers} towers, {Enemies} enemies, {Maps} maps, {Levels} campaign levels",
            version, towers.Count, enemies.Count, maps.Count, snapshot.Campaign.Count);
        return snapshot;
    }

    private ContentDocument Upsert(Dictionary<(string, string), ContentDocument> existing, string kind, string key, string json, DateTime now)
    {
        var hash = Sha256(json);
        if (!existing.TryGetValue((kind, key), out var doc))
        {
            doc = new ContentDocument { Kind = kind, Key = key, Json = json, Hash = hash, UpdatedAt = now };
            db.ContentDocuments.Add(doc);
            existing[(kind, key)] = doc;
        }
        else if (!doc.IsOverride && doc.Hash != hash)
        {
            doc.Json = json;
            doc.Hash = hash;
            doc.UpdatedAt = now;
        }

        return doc;
    }

    private static string ComputeVersion(IEnumerable<ContentDocument> docs) =>
        Sha256(string.Join('|', docs.OrderBy(d => d.Kind).ThenBy(d => d.Key).Select(d => $"{d.Kind}:{d.Key}:{d.Hash}")))[..16].ToLowerInvariant();

    private static string Sha256(string text) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
}

public static class ContentStartupExtensions
{
    public static IServiceCollection AddContent(this IServiceCollection services)
    {
        services.AddSingleton<ContentCatalog>();
        services.AddScoped<ContentSeeder>();
        return services;
    }

    public static async Task SeedContentAsync(this IServiceProvider services, CancellationToken ct = default)
    {
        using var scope = services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<ContentSeeder>().SeedAndLoadAsync(ct);
    }
}
