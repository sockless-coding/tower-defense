import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useProfile } from '../api/account'
import { useLoadedContent } from '../api/content'
import { api } from '../api/http'
import { useProgression, type ProgressionOverview } from '../api/sessions'
import { formatMod } from '../lib/labels'
import { Button, GearBackdrop, GearSpinner, Gauge, Panel, ProgressBar, ScreenHeader, Stat, Tabs } from '../ui/components'
import { Icon } from '../ui/Icon'
import { TowerPortrait } from '../ui/Portraits'
import './screens.css'

type Section = 'track' | 'cosmetics' | 'prestige'

export function CommanderScreen() {
  const content = useLoadedContent()
  const progression = useProgression()
  const profile = useProfile()
  const client = useQueryClient()
  const [section, setSection] = useState<Section>('track')
  const update = (data: ProgressionOverview) => {
    client.setQueryData(['progression'], data)
    void client.invalidateQueries({ queryKey: ['profile'] })
  }
  const cosmetics = useMutation({
    mutationFn: (body: { banner: string; title: string }) => api<ProgressionOverview>('/api/progression/cosmetics', { method: 'PUT', body }),
    onSuccess: update,
  })
  const prestige = useMutation({
    mutationFn: (towerId: string) => api<ProgressionOverview>(`/api/towers/${towerId}/prestige`, { method: 'POST' }),
    onSuccess: update,
  })

  const p = progression.data
  if (!p) {
    return (
      <div className="screen center">
        <GearBackdrop />
        <GearSpinner label="Consulting the service record…" />
      </div>
    )
  }

  const rewards = content.bundle.commander.rewards.filter((r) => r.kind !== 'gears' && r.kind !== 'researchPoints')
  const levels = [...new Set(rewards.map((r) => r.level))].sort((a, b) => a - b)
  const owned = new Set(p.cosmetics)
  const cosmeticDefs = content.bundle.commander.cosmetics
  const prestigeUnlocked = p.features.includes('feature.prestige')
  const prestigeLevel = content.bundle.commander.rewards.find((r) => r.id === 'feature.prestige')?.level ?? 14

  return (
    <div className="screen">
      <GearBackdrop />
      <ScreenHeader
        title="Commander"
        right={
          <>
            <Stat icon="gear" value={p.gears.toLocaleString()} label="Gears" />
            <Stat icon="flask" value={p.researchPoints} label="Research points" color="var(--aether)" />
          </>
        }
      />
      <div className="commander-head">
        <Gauge value={p.commander.xpIntoLevel} max={Math.max(1, p.commander.xpToNext)} size={120} label={`Level ${p.commander.level}`} />
        <div>
          <h2 className="engraved commander-name">{profile.data?.displayName}</h2>
          <p className="muted">{cosmeticDefs.find((c) => c.id === p.selectedTitle)?.name}</p>
          <ProgressBar
            value={p.commander.xpIntoLevel}
            max={Math.max(1, p.commander.xpToNext)}
            label={p.commander.level >= p.commander.maxLevel ? 'Maximum rank' : `${p.commander.xpIntoLevel.toLocaleString()} / ${p.commander.xpToNext.toLocaleString()} XP`}
            color="linear-gradient(90deg,#6a4418,#f6d98a)"
          />
        </div>
      </div>
      <Tabs
        tabs={[
          { id: 'track', label: 'Promotion track', icon: 'trophy' },
          { id: 'cosmetics', label: 'Regalia', icon: 'flag' },
          { id: 'prestige', label: 'Tower prestige', icon: 'star' },
        ]}
        value={section}
        onChange={setSection}
      />
      <div className="screen-scroll" style={{ position: 'relative', zIndex: 1 }}>
        {section === 'track' && (
          <div className="reward-track">
            {levels.map((level) => (
              <div key={level} className={`reward-level ${level <= p.commander.level ? 'earned' : ''} ${level === p.commander.level + 1 ? 'next' : ''}`}>
                <span className="reward-num">{level}</span>
                <div>
                  {rewards
                    .filter((r) => r.level === level)
                    .map((r) => (
                      <p key={r.id}>
                        <Icon name={r.kind === 'perk' ? 'shield' : r.kind === 'feature' ? 'play' : 'flag'} size={13} /> <b>{r.name}</b> — {r.description}
                        {r.effects.length > 0 && <span className="muted"> ({r.effects.map((e) => formatMod(e)).join(', ')})</span>}
                      </p>
                    ))}
                </div>
              </div>
            ))}
            <p className="muted small">Every level also grants gears, and every fifth level three research points.</p>
          </div>
        )}

        {section === 'cosmetics' && (
          <div className="cosmetics">
            {(['banner', 'title'] as const).map((kind) => (
              <Panel key={kind} title={kind === 'banner' ? 'Banners' : 'Titles'}>
                <div className="cosmetic-grid">
                  {cosmeticDefs
                    .filter((c) => c.kind === kind)
                    .map((c) => {
                      const has = owned.has(c.id)
                      const selectedId = kind === 'banner' ? p.selectedBanner : p.selectedTitle
                      return (
                        <button
                          key={c.id}
                          type="button"
                          disabled={!has || cosmetics.isPending}
                          className={`cosmetic ${has ? '' : 'locked'} ${selectedId === c.id ? 'selected' : ''}`}
                          onClick={() =>
                            cosmetics.mutate({ banner: kind === 'banner' ? c.id : p.selectedBanner, title: kind === 'title' ? c.id : p.selectedTitle })
                          }
                          title={c.description}
                        >
                          {!has && <Icon name="lock" size={12} />} {c.name}
                        </button>
                      )
                    })}
                </div>
              </Panel>
            ))}
          </div>
        )}

        {section === 'prestige' && (
          <>
            {!prestigeUnlocked && (
              <p className="muted">
                <Icon name="lock" size={14} /> Tower prestige unlocks at Commander level {prestigeLevel}.
              </p>
            )}
            <div className="prestige-grid">
              {content.bundle.towers
                .filter((t) => p.unlockedTowers.includes(t.id))
                .map((t) => {
                  const rank = p.prestige[t.id] ?? 0
                  const cost = t.prestige.gearCost[rank]
                  return (
                    <div key={t.id} className="prestige-card">
                      <TowerPortrait tower={t} size={56} tier={rank >= t.prestige.maxRank ? 4 : 1} />
                      <div>
                        <b>{t.name}</b>
                        <div className="prestige-pips">
                          {Array.from({ length: t.prestige.maxRank }, (_, i) => (
                            <span key={i} className={i < rank ? 'on' : ''} />
                          ))}
                        </div>
                        <span className="muted small">{t.prestige.modsPerRank.map(formatMod).join(', ')} per rank</span>
                      </div>
                      {rank < t.prestige.maxRank ? (
                        <Button size="sm" disabled={!prestigeUnlocked || p.gears < cost || prestige.isPending} onClick={() => prestige.mutate(t.id)}>
                          <Icon name="gear" size={12} /> {cost}
                        </Button>
                      ) : (
                        <span className="chip" style={{ color: '#ffd25a' }}>
                          Gilded
                        </span>
                      )}
                    </div>
                  )
                })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
