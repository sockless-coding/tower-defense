using Microsoft.EntityFrameworkCore;
using TD.Application.Features.Achievements;
using TD.Application.Features.Campaign;
using TD.Application.Features.Content;
using TD.Application.Features.Profiles;
using TD.Application.Features.Research;
using TD.Application.Features.Statistics;
using TD.Application.Features.Towers;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;

namespace TD.Application.Features.Progression;

/// <summary>Everything the server knows about one player's progression, loaded as tracked entities for mutation.</summary>
public sealed class PlayerProgress
{
    public required PlayerProfile Profile { get; init; }
    public required Dictionary<string, LevelProgress> Levels { get; init; }
    public required HashSet<string> Research { get; init; }
    public required Dictionary<string, TowerPrestigeRank> Prestige { get; init; }
    public required HashSet<string> Cosmetics { get; init; }
    public required HashSet<string> Achievements { get; init; }
    public required Dictionary<string, PlayerStatistic> Statistics { get; init; }

    public long Stat(string key) => Statistics.TryGetValue(key, out var s) ? s.Value : 0;
}

public sealed record GrantedReward(string Kind, string Id, string Name, int Amount);

/// <summary>
/// Derives unlocks and bonuses from stored progress and applies rewards. Every progression change in the game flows
/// through here so rules live in one place.
/// </summary>
public sealed class ProgressionService(AppDbContext db, ContentCatalog catalog, TimeProvider clock) : ISliceService
{
    public const string DefaultBanner = "banner.brass";
    public const string DefaultTitle = "title.recruit";

    public async Task<PlayerProgress?> LoadAsync(Guid accountId, CancellationToken ct)
    {
        var profile = await db.Profiles.SingleOrDefaultAsync(p => p.AccountId == accountId, ct);
        if (profile is null)
        {
            return null;
        }

        return new PlayerProgress
        {
            Profile = profile,
            Levels = await db.LevelProgress.Where(l => l.AccountId == accountId).ToDictionaryAsync(l => l.LevelId, ct),
            Research = (await db.ResearchUnlocks.Where(r => r.AccountId == accountId).Select(r => r.NodeId).ToListAsync(ct)).ToHashSet(),
            Prestige = await db.TowerPrestige.Where(r => r.AccountId == accountId).ToDictionaryAsync(r => r.TowerId, ct),
            Cosmetics = (await db.CosmeticUnlocks.Where(c => c.AccountId == accountId).Select(c => c.CosmeticId).ToListAsync(ct)).ToHashSet(),
            Achievements = (await db.AchievementUnlocks.Where(a => a.AccountId == accountId).Select(a => a.AchievementId).ToListAsync(ct)).ToHashSet(),
            Statistics = await db.Statistics.Where(s => s.AccountId == accountId).ToDictionaryAsync(s => s.Key, ct),
        };
    }

    // ------------------------------------------------------------------------------------------------ Derived state

    /// <summary>Campaign levels unlock in order: the highest level n such that 1..n are all completed.</summary>
    public int HighestCampaignCompleted(PlayerProgress p)
    {
        var highest = 0;
        foreach (var level in catalog.Current.Campaign)
        {
            if (!p.Levels.ContainsKey(level.Id))
            {
                break;
            }

            highest = level.Number;
        }

        return highest;
    }

    public bool IsLevelUnlocked(PlayerProgress p, LevelDefinition level) => level.Mode switch
    {
        GameMode.Campaign => level.Number <= HighestCampaignCompleted(p) + 1,
        GameMode.Challenge => HasFeature(p, "feature.challenge") && MapCompleted(p, level.MapId),
        _ => false,
    };

    /// <summary>A map counts as explored once its first campaign variant has been beaten.</summary>
    public bool MapCompleted(PlayerProgress p, string mapId) =>
        catalog.Current.Campaign.Any(l => l.MapId == mapId && l.Variant == 0 && p.Levels.ContainsKey(l.Id));

    public IReadOnlySet<string> Features(int commanderLevel) =>
        catalog.Current.Commander.Rewards
            .Where(r => r.Kind == CommanderRewardKind.Feature && r.Level <= commanderLevel)
            .Select(r => r.Id)
            .ToHashSet();

    public bool HasFeature(PlayerProgress p, string featureId) => Features(p.Profile.CommanderLevel).Contains(featureId);

    public int FeatureLevel(string featureId) =>
        catalog.Current.Commander.Rewards.FirstOrDefault(r => r.Kind == CommanderRewardKind.Feature && r.Id == featureId)?.Level ?? 1;

    public IReadOnlyList<string> UnlockedTowers(PlayerProgress p)
    {
        var highest = HighestCampaignCompleted(p);
        return catalog.Current.Towers
            .Where(t => t.Unlock.CampaignLevel <= highest + 1 && (t.Unlock.Research is null || p.Research.Contains(t.Unlock.Research)))
            .Select(t => t.Id)
            .ToList();
    }

    /// <summary>Research effects plus commander perks, flattened for the simulation.</summary>
    public IReadOnlyList<BonusEffect> Bonuses(PlayerProgress p)
    {
        var c = catalog.Current;
        var research = c.Research.Where(n => p.Research.Contains(n.Id)).SelectMany(n => n.Effects).Where(e => e.Target != "unlock");
        var perks = c.Commander.Rewards.Where(r => r.Kind == CommanderRewardKind.Perk && r.Level <= p.Profile.CommanderLevel).SelectMany(r => r.Effects);
        return research.Concat(perks).ToList();
    }

    public IReadOnlyDictionary<string, int> PrestigeRanks(PlayerProgress p) =>
        HasFeature(p, "feature.prestige")
            ? p.Prestige.Values.Where(r => r.Rank > 0).ToDictionary(r => r.TowerId, r => r.Rank)
            : new Dictionary<string, int>();

    // ------------------------------------------------------------------------------------------------ Rewards

    public async Task GrantCosmeticAsync(PlayerProgress p, string cosmeticId, string source, CancellationToken ct)
    {
        if (!p.Cosmetics.Add(cosmeticId))
        {
            return;
        }

        db.CosmeticUnlocks.Add(new CosmeticUnlock { AccountId = p.Profile.AccountId, CosmeticId = cosmeticId, Source = source, UnlockedAt = Now });
        await Task.CompletedTask;
    }

    /// <summary>Adds commander XP, levelling up and applying each level's rewards.</summary>
    public async Task<List<GrantedReward>> AwardXpAsync(PlayerProgress p, long xp, CancellationToken ct)
    {
        var rules = catalog.Current.Commander;
        var granted = new List<GrantedReward>();
        var before = p.Profile.CommanderLevel;
        p.Profile.CommanderXp += Math.Max(0, xp);
        var (level, _) = rules.LevelFor(p.Profile.CommanderXp);

        for (var l = before + 1; l <= level; l++)
        {
            foreach (var reward in rules.Rewards.Where(r => r.Level == l))
            {
                switch (reward.Kind)
                {
                    case CommanderRewardKind.Gears:
                        p.Profile.Gears += reward.Amount;
                        break;
                    case CommanderRewardKind.ResearchPoints:
                        p.Profile.ResearchPoints += reward.Amount;
                        break;
                    case CommanderRewardKind.Cosmetic:
                        await GrantCosmeticAsync(p, reward.Id, $"commander:{l}", ct);
                        break;
                }

                granted.Add(new GrantedReward(reward.Kind.ToString(), reward.Id, reward.Name, reward.Amount));
            }
        }

        p.Profile.CommanderLevel = level;
        SetMax(p, "commander.level", level);
        return granted;
    }

    public void Increment(PlayerProgress p, string key, long amount)
    {
        if (amount == 0)
        {
            return;
        }

        Stat(p, key).Value += amount;
    }

    public void SetMax(PlayerProgress p, string key, long value)
    {
        var stat = Stat(p, key);
        if (value > stat.Value)
        {
            stat.Value = value;
        }
    }

    private PlayerStatistic Stat(PlayerProgress p, string key)
    {
        if (!p.Statistics.TryGetValue(key, out var stat))
        {
            stat = new PlayerStatistic { AccountId = p.Profile.AccountId, Key = key };
            p.Statistics[key] = stat;
            db.Statistics.Add(stat);
        }

        stat.UpdatedAt = Now;
        return stat;
    }

    /// <summary>Unlocks every achievement whose statistic has reached its threshold, paying its rewards.</summary>
    public async Task<List<AchievementDefinition>> EvaluateAchievementsAsync(PlayerProgress p, CancellationToken ct)
    {
        var unlocked = new List<AchievementDefinition>();
        foreach (var a in catalog.Current.Achievements)
        {
            if (p.Achievements.Contains(a.Id) || p.Stat(a.Stat) < a.Threshold)
            {
                continue;
            }

            p.Achievements.Add(a.Id);
            db.AchievementUnlocks.Add(new AchievementUnlock { AccountId = p.Profile.AccountId, AchievementId = a.Id, UnlockedAt = Now });
            p.Profile.Gears += a.RewardGears;
            if (a.RewardCosmetic is not null)
            {
                await GrantCosmeticAsync(p, a.RewardCosmetic, $"achievement:{a.Id}", ct);
            }

            unlocked.Add(a);
        }

        return unlocked;
    }

    private DateTime Now => clock.GetUtcNow().UtcDateTime;
}
