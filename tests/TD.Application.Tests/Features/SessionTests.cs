using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using TD.Application.Features.Campaign;
using TD.Application.Features.Content;
using TD.Application.Features.Progression;
using TD.Application.Features.SaveGames;
using TD.Application.Features.Sessions;
using TD.Application.Tests.Infrastructure;

namespace TD.Application.Tests.Features;

/// <summary>The client simulation writes tests/fixtures/client-run.json; the server must accept it unchanged.</summary>
public sealed class ClientContractTests : IClassFixture<TestApp>
{
    private readonly TestApp _app;

    public ClientContractTests(TestApp app) => _app = app;

    private sealed record Fixture(SessionConfig Config, List<ActionDto> Actions, RunResultDto Result);

    private static Fixture Load()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "TD.slnx")))
        {
            dir = dir.Parent;
        }

        var path = Path.Combine(dir!.FullName, "tests", "fixtures", "client-run.json");
        return JsonSerializer.Deserialize<Fixture>(File.ReadAllText(path), ContentJson.Options)!;
    }

    private ContentSnapshot Content => _app.Services.GetRequiredService<ContentCatalog>().Current;

    private (ValidatedRun? Run, string? Failure) Validate(Fixture f, TimeSpan? wallClock = null) =>
        RunValidator.Validate(f.Config, Content, new CompleteSessionRequest(f.Actions, f.Result), wallClock ?? TimeSpan.FromHours(1));

    [Fact]
    public void Server_accepts_a_genuine_client_run()
    {
        var (run, failure) = Validate(Load());
        Assert.Null(failure);
        Assert.True(run!.Victory);
    }

    [Fact]
    public void Tampered_spend_is_rejected()
    {
        var f = Load();
        var (_, failure) = Validate(f with { Result = f.Result with { Stats = f.Result.Stats with { GoldSpent = f.Result.Stats.GoldSpent - 50 } } });
        Assert.Equal("reported spend does not match actions", failure);
    }

    [Fact]
    public void Inflated_income_is_rejected()
    {
        var f = Load();
        var (_, failure) = Validate(f with { Result = f.Result with { Stats = f.Result.Stats with { GoldEarned = 10_000_000 } } });
        Assert.Equal("reported income exceeds the level's ceiling", failure);
    }

    [Fact]
    public void Locked_tower_in_log_is_rejected()
    {
        var f = Load();
        var config = f.Config with { UnlockedTowers = ["rivet-cannon"] };
        var (_, failure) = Validate(f with { Config = config });
        Assert.Equal("built a locked tower", failure);
    }

    [Fact]
    public void Impossible_kill_counts_are_rejected()
    {
        var f = Load();
        var kills = new Dictionary<string, int>(f.Result.Stats.Kills) { ["automaton-scout"] = 9999 };
        var (_, failure) = Validate(f with { Result = f.Result with { Stats = f.Result.Stats with { Kills = kills } } });
        Assert.StartsWith("implausible kills", failure);
    }

    [Fact]
    public void Run_faster_than_max_game_speed_is_rejected()
    {
        var f = Load();
        var (_, failure) = Validate(f, TimeSpan.FromSeconds(1));
        Assert.Equal("run finished faster than the maximum game speed allows", failure);
    }

    [Fact]
    public void Interaction_spam_is_rejected()
    {
        var f = Load();
        var first = f.Actions.First(a => a.Type == "interact");
        var actions = f.Actions.ToList();
        actions.Insert(actions.IndexOf(first) + 1, first with { T = first.T + 1 });
        var stats = f.Result.Stats with { InteractionsUsed = f.Result.Stats.InteractionsUsed + 1 };
        var (_, failure) = Validate(f with { Actions = actions, Result = f.Result with { Stats = stats } });
        Assert.Equal("interaction used during cooldown", failure);
    }
}

public sealed class SessionFlowTests : IClassFixture<TestApp>
{
    private readonly TestApp _app;

    public SessionFlowTests(TestApp app) => _app = app;

    private static async Task<SessionStartResponse> Start(HttpClient client, string levelId, string preset = "engineer")
    {
        var response = await client.PostAsJsonAsync("/api/sessions", new StartSessionRequest(GameMode.Campaign, levelId, null, preset, null), TestApp.Json);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SessionStartResponse>(TestApp.Json))!;
    }

    /// <summary>A structurally valid victory claim: three towers on build platforms, all waves called, nothing lost.</summary>
    private CompleteSessionRequest Victory(SessionStartResponse session, int extraSpend = 0)
    {
        var content = _app.Services.GetRequiredService<ContentCatalog>().Current;
        var level = session.Config.Level;
        var map = content.MapsById[level.MapId];
        var platforms = map.Cells('B').Take(3).ToList();
        var econ = new RunEconomy(session.Config.Bonuses);
        var gatling = content.TowersById["gatling-nest"];
        var actions = platforms.Select((c, i) => new ActionDto(i, "build", "gatling-nest", c.X, c.Y, null, null, null)).ToList();
        actions.Add(new ActionDto(10, "callWave", null, null, null, null, null, null));
        var spent = econ.TowerCost(gatling, session.Config.Modifiers) * platforms.Count + extraSpend;

        var kills = level.Waves.SelectMany(w => w.Groups).GroupBy(g => g.Enemy).ToDictionary(g => g.Key, g => g.Sum(x => x.Count));
        // Every wave called at once: the shortest legal victory, so no wall-clock wait is needed in tests.
        var ticks = (int)(level.Waves.Max(w => w.SpawnDuration) * 30) + 30;
        var stats = new RunStatsDto(kills, 0, platforms.Count, new() { ["gatling-nest"] = platforms.Count }, 0, 0, 400, spent, 0, 0, level.Waves.Count, 5000);
        return new CompleteSessionRequest(actions, new RunResultDto("victory", ticks, 20, 20, level.Waves.Count, stats));
    }

    private static async Task<HttpResponseMessage> Complete(HttpClient client, SessionStartResponse session, CompleteSessionRequest request, string? token = null)
    {
        var message = new HttpRequestMessage(HttpMethod.Post, $"/api/sessions/{session.SessionId}/complete")
        {
            Content = JsonContent.Create(request, options: TestApp.Json),
        };
        message.Headers.Add(SessionEndpoints.TokenHeader, token ?? session.Token);
        return await client.SendAsync(message);
    }

    [Fact]
    public async Task Campaign_victory_unlocks_the_next_level_and_pays_rewards()
    {
        var (client, _) = await _app.CreateGuestClientAsync();

        var locked = await client.PostAsJsonAsync("/api/sessions", new StartSessionRequest(GameMode.Campaign, "campaign-002", null, "engineer", null), TestApp.Json);
        Assert.Equal(HttpStatusCode.Forbidden, locked.StatusCode);

        var session = await Start(client, "campaign-001");
        Assert.Equal(["gatling-nest", "rivet-cannon"], session.Config.UnlockedTowers.Order());

        var response = await Complete(client, session, Victory(session));
        response.EnsureSuccessStatusCode();
        var result = (await response.Content.ReadFromJsonAsync<CompletionResponse>(TestApp.Json))!;
        Assert.Equal(3, result.Stars);
        Assert.True(result.XpGained > 0);
        Assert.True(result.GearsGained > 0);
        Assert.Equal(5, result.ResearchPointsGained); // first clear (2) + three new stars
        Assert.Contains("first-steps", result.NewAchievements);
        Assert.Equal("level:campaign-001", result.LeaderboardKey);
        Assert.Equal(1, result.LeaderboardRank);

        var progression = (await client.GetFromJsonAsync<ProgressionOverview>("/api/progression", TestApp.Json))!;
        Assert.Equal(1, progression.HighestCampaignLevel);
        Assert.Equal(3, progression.Levels["campaign-001"].Stars);
        Assert.DoesNotContain("tesla-coil", progression.UnlockedTowers); // unlocked by beating level 2, per its briefing

        // The next level opens; completing the same session twice does not.
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/sessions", new StartSessionRequest(GameMode.Campaign, "campaign-002", null, "engineer", null), TestApp.Json)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Complete(client, session, Victory(session))).StatusCode);
    }

    [Fact]
    public async Task Forged_token_and_tampered_logs_are_rejected_without_rewards()
    {
        var (client, _) = await _app.CreateGuestClientAsync();

        var forged = await Start(client, "campaign-001");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Complete(client, forged, Victory(forged), token: "forged")).StatusCode);

        var tampered = await Start(client, "campaign-001");
        var response = await Complete(client, tampered, Victory(tampered, extraSpend: -100));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("session.rejected", body);
        Assert.DoesNotContain("spend", body); // the reason is never revealed to the client

        var progression = (await client.GetFromJsonAsync<ProgressionOverview>("/api/progression", TestApp.Json))!;
        Assert.Equal(0, progression.HighestCampaignLevel);
        Assert.Equal(0, progression.Gears);
    }

    [Fact]
    public async Task Locked_difficulty_and_modes_are_refused()
    {
        var (client, _) = await _app.CreateGuestClientAsync();
        var nightmare = await client.PostAsJsonAsync("/api/sessions", new StartSessionRequest(GameMode.Campaign, "campaign-001", null, "nightmare", null), TestApp.Json);
        Assert.Equal(HttpStatusCode.Forbidden, nightmare.StatusCode);

        var survival = await client.PostAsJsonAsync("/api/sessions", new StartSessionRequest(GameMode.Survival, null, "industrial-city", null, null), TestApp.Json);
        Assert.Equal(HttpStatusCode.Forbidden, survival.StatusCode);
    }

    [Fact]
    public async Task Research_requires_points_and_prerequisites()
    {
        var (client, _) = await _app.CreateGuestClientAsync();
        var broke = await client.PostAsync("/api/research/ms-drill/purchase", null);
        Assert.Equal(HttpStatusCode.BadRequest, broke.StatusCode);

        var session = await Start(client, "campaign-001");
        (await Complete(client, session, Victory(session))).EnsureSuccessStatusCode();

        var skip = await client.PostAsync("/api/research/ms-target-priority/purchase", null);
        Assert.Equal(HttpStatusCode.BadRequest, skip.StatusCode);

        var ok = await client.PostAsync("/api/research/ms-drill/purchase", null);
        ok.EnsureSuccessStatusCode();
        var progression = (await ok.Content.ReadFromJsonAsync<ProgressionOverview>(TestApp.Json))!;
        Assert.Contains("ms-drill", progression.Research);
        Assert.Equal(4, progression.ResearchPoints);

        // Owned research now flows into the next session's bonuses.
        var next = await Start(client, "campaign-002");
        Assert.Contains(next.Config.Bonuses, b => b.Target == "all" && b.Stat == "damage");
    }

    [Fact]
    public async Task Saves_round_trip_and_detect_conflicts()
    {
        var (client, _) = await _app.CreateGuestClientAsync();
        var session = await Start(client, "campaign-001");
        var actions = new List<ActionDto> { new(5, "build", "rivet-cannon", 3, 2, null, null, null) };

        var put = await client.PutAsJsonAsync("/api/saves/1", new PutSaveGameRequest(session.SessionId, 120, actions, "Industrial City I · wave 1", null), TestApp.Json);
        put.EnsureSuccessStatusCode();
        var saved = (await put.Content.ReadFromJsonAsync<SaveGameSummary>(TestApp.Json))!;

        var list = (await client.GetFromJsonAsync<List<SaveGameSummary>>("/api/saves", TestApp.Json))!;
        Assert.Single(list);

        var details = (await client.GetFromJsonAsync<SaveGameDetails>("/api/saves/1", TestApp.Json))!;
        Assert.Equal(120, details.Tick);
        Assert.Single(details.Actions);

        var resumed = await client.GetFromJsonAsync<SessionStartResponse>($"/api/sessions/{session.SessionId}", TestApp.Json);
        Assert.Equal(session.Config.Seed, resumed!.Config.Seed);

        var update = await client.PutAsJsonAsync("/api/saves/1", new PutSaveGameRequest(session.SessionId, 200, actions, "later", saved.Version), TestApp.Json);
        update.EnsureSuccessStatusCode();
        var stale = await client.PutAsJsonAsync("/api/saves/1", new PutSaveGameRequest(session.SessionId, 300, actions, "stale", saved.Version), TestApp.Json);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        var badSlot = await client.PutAsJsonAsync("/api/saves/9", new PutSaveGameRequest(session.SessionId, 1, [], "x", null), TestApp.Json);
        Assert.Equal(HttpStatusCode.BadRequest, badSlot.StatusCode);
    }
}
