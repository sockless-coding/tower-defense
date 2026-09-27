using TD.Application.Features.Campaign;
using TD.Application.Features.Content;
using TD.Application.Features.Difficulty;
using TD.Application.Features.Waves;

namespace TD.Application.Features.Sessions;

/// <summary>Applies difficulty-dependent randomness (elite groups, boss frequency) to a level for one session seed.</summary>
public static class SessionLevelResolver
{
    public static LevelDefinition Resolve(LevelDefinition level, DifficultyModifiers modifiers, uint seed, ContentSnapshot content)
    {
        var rng = new SeededRandom(seed ^ 0x9E3779B9u);
        var bosses = level.Waves.SelectMany(w => w.Groups).Select(g => g.Enemy).Where(id => content.EnemiesById[id].IsBoss).Distinct().ToList();
        var extraEvery = modifiers.BossFrequency > 1 ? Math.Max(4, (int)Math.Round(12 / modifiers.BossFrequency)) : 0;
        var bossHpScale = modifiers.BossFrequency < 1 ? Math.Max(0.5, modifiers.BossFrequency) : 1;

        var waves = level.Waves.Select(w =>
        {
            var groups = w.Groups.Select(g =>
            {
                var isBoss = content.EnemiesById[g.Enemy].IsBoss;
                if (isBoss)
                {
                    return g with { HpMul = Math.Round(g.HpMul * bossHpScale, 3) };
                }

                return g with { Elite = rng.NextDouble() < modifiers.EliteChance };
            }).ToList();

            // Higher boss frequency adds escort bosses at weaker strength on regular intervals.
            if (extraEvery > 0 && level.Number >= 10 && w.Number % extraEvery == 0 && w.Number < level.Waves.Count)
            {
                var boss = bosses.Count > 0 ? bosses[0] : CampaignGenerator.BossFor(Math.Max(10, level.Number));
                groups.Add(new WaveGroup(boss, 1, 1, rng.Next(level.ActiveSpawns.Count), 5, false, Math.Round(0.35 * (1 + 0.015 * level.Number), 3)));
            }

            return w with { Groups = groups };
        }).ToList();

        return level with { Waves = waves };
    }
}
