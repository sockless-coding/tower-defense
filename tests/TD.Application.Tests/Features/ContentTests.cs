using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using TD.Application.Features.Campaign;
using TD.Application.Features.Content;
using TD.Application.Features.Difficulty;
using TD.Application.Features.Maps;
using TD.Application.Features.Towers;
using TD.Application.Tests.Infrastructure;

namespace TD.Application.Tests.Features;

public sealed class ContentTests : IClassFixture<TestApp>
{
    private readonly TestApp _app;

    public ContentTests(TestApp app) => _app = app;

    private ContentSnapshot Snapshot => _app.Services.GetRequiredService<ContentCatalog>().Current;

    [Fact]
    public void Content_meets_the_design_minimums()
    {
        var c = Snapshot;
        Assert.True(c.Towers.Count >= 30, $"Expected 30+ towers, found {c.Towers.Count}");
        Assert.True(c.Enemies.Count(e => e.Threat > 0 || e.IsBoss) >= 20, "Expected 20+ enemy archetypes");
        Assert.True(c.Maps.Count >= 25, "Expected 25+ maps");
        Assert.Equal(100, c.Campaign.Count);
        Assert.Equal(8, c.Difficulty.Presets.Count);
        Assert.Equal(75, c.Research.Count);
        Assert.All(Enum.GetValues<TowerCategory>(), cat => Assert.Contains(c.Towers, t => t.Category == cat));
        Assert.Contains(c.Enemies, e => e.Movement == TD.Application.Features.Enemies.Movement.Air);
        Assert.Contains(c.Enemies, e => e.Abilities.Any(a => a.Kind == "cloak"));
        Assert.Contains(c.Enemies, e => e.IsBoss && e.Phases.Count > 0);
    }

    [Fact]
    public void Content_passes_validation()
    {
        Assert.Empty(ContentValidator.Validate(Snapshot));
    }

    [Fact]
    public void Every_tenth_campaign_level_is_a_boss_battle()
    {
        foreach (var level in Snapshot.Campaign)
        {
            Assert.Equal(level.Number % 10 == 0, level.BossId is not null);
            if (level.BossId is not null)
            {
                Assert.Contains(level.Waves[^1].Groups, g => g.Enemy == level.BossId);
            }
        }
    }

    [Fact]
    public void Campaign_generation_is_deterministic()
    {
        var c = Snapshot;
        var again = CampaignGenerator.GenerateCampaign(c.Maps, c.Enemies, c.Towers);
        Assert.Equal(
            System.Text.Json.JsonSerializer.Serialize(c.Campaign, ContentJson.Options),
            System.Text.Json.JsonSerializer.Serialize(again, ContentJson.Options));
    }

    [Fact]
    public void Tower_upgrade_paths_follow_tier_rules()
    {
        var tesla = Snapshot.TowersById["tesla-coil"];
        Assert.True(TowerTiers.CanPurchase(tesla, [], "tesla-coil.2a"));
        Assert.False(TowerTiers.CanPurchase(tesla, [], "tesla-coil.3a"));
        Assert.False(TowerTiers.CanPurchase(tesla, ["tesla-coil.2a"], "tesla-coil.2b"));
        Assert.True(TowerTiers.CanPurchase(tesla, ["tesla-coil.2a"], "tesla-coil.3b"));
        Assert.False(TowerTiers.CanPurchase(tesla, ["tesla-coil.2a"], "tesla-coil.u"));
        Assert.True(TowerTiers.CanPurchase(tesla, ["tesla-coil.2a", "tesla-coil.3b"], "tesla-coil.u"));
        Assert.Equal("Thunder God Protocol", tesla.Upgrades.Single(u => u.Branch == "U").Name);
    }

    [Fact]
    public void Blocking_every_route_is_detected()
    {
        var map = Snapshot.MapsById["underground-tunnels"];
        var core = map.Cells(MapLegend.Core).Single();
        var wall = new HashSet<(int, int)> { (core.X - 1, core.Y), (core.X, core.Y - 1), (core.X, core.Y + 1) };
        Assert.False(MapPathing.RoutesIntact(map, wall));
        Assert.True(MapPathing.RoutesIntact(map, new HashSet<(int, int)>()));
    }

    [Fact]
    public async Task Content_bundle_supports_conditional_requests()
    {
        var client = _app.CreateClient();
        var first = await client.GetAsync("/api/content");
        first.EnsureSuccessStatusCode();
        var bundle = (await first.Content.ReadFromJsonAsync<ContentBundle>(TestApp.Json))!;
        Assert.Equal(100, bundle.Campaign.Count);
        Assert.NotNull(first.Headers.ETag);

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/content");
        request.Headers.IfNoneMatch.Add(first.Headers.ETag!);
        var second = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.NotModified, second.StatusCode);
    }

    [Fact]
    public async Task Level_endpoint_returns_full_waves()
    {
        var level = await _app.CreateClient().GetFromJsonAsync<LevelDefinition>("/api/levels/campaign-010", TestApp.Json);
        Assert.Equal("pressure-titan", level!.BossId);
        Assert.NotEmpty(level.Waves);

        var missing = await _app.CreateClient().GetAsync("/api/levels/campaign-999");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Harder_difficulty_pays_more()
    {
        var presets = Snapshot.Difficulty.Presets.OrderBy(p => p.Order).ToList();
        var multipliers = presets.Select(p => DifficultyMath.RewardMultiplier(p.Modifiers, Snapshot.Difficulty.Ranges)).ToList();
        for (var i = 1; i < multipliers.Count; i++)
        {
            Assert.True(multipliers[i] > multipliers[i - 1], $"{presets[i].Id} should pay more than {presets[i - 1].Id}");
        }

        var invalid = presets[1].Modifiers with { EnemySpeed = 50 };
        var response = await _app.CreateClient().PostAsJsonAsync("/api/difficulty/evaluate", invalid, TestApp.Json);
        var evaluation = (await response.Content.ReadFromJsonAsync<DifficultyEvaluation>(TestApp.Json))!;
        Assert.NotEmpty(evaluation.Errors);
    }
}
