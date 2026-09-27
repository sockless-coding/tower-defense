import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProfile } from '../api/account'
import { useLoadedContent } from '../api/content'
import { api } from '../api/http'
import { formatRule } from '../lib/labels'
import { startSession, useProgression } from '../api/sessions'
import { useActiveSession } from '../state/game'
import type { LevelDefinition } from '../api/types'
import { Button, GearBackdrop, GearSpinner, Panel, ScreenHeader } from '../ui/components'
import { Icon, categoryIcon } from '../ui/Icon'
import { MapThumbnail } from '../ui/MapThumbnail'
import { EnemyPortrait } from '../ui/Portraits'
import { DifficultyPicker, useDifficultyChoice } from './DifficultyPicker'
import './screens.css'

export function useLevel(id: string | undefined) {
  return useQuery({
    queryKey: ['level', id],
    queryFn: () => api<LevelDefinition>(`/api/levels/${id}`, { auth: false }),
    enabled: !!id,
    staleTime: Infinity,
  })
}

export function BriefingScreen() {
  const { id } = useParams()
  const content = useLoadedContent()
  const profile = useProfile()
  const level = useLevel(id)
  const progression = useProgression()
  const navigate = useNavigate()
  const choice = useDifficultyChoice()
  const setActive = useActiveSession((s) => s.set)
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)

  if (!level.data) {
    return (
      <div className="screen center">
        <GearBackdrop />
        {level.error ? <p className="error-text">{(level.error as Error).message}</p> : <GearSpinner label="Unrolling the blueprints…" />}
      </div>
    )
  }

  const l = level.data
  const map = content.maps.get(l.mapId)!
  const composition = new Map<string, number>()
  for (const wave of l.waves) {
    for (const group of wave.groups) {
      composition.set(group.enemy, (composition.get(group.enemy) ?? 0) + group.count)
    }
  }
  const back = l.mode === 'campaign' ? '/campaign' : '/modes'
  const p = progression.data
  const unlocked =
    !p ||
    (l.mode === 'campaign'
      ? l.number <= p.highestCampaignLevel + 1
      : l.mode === 'challenge'
        ? p.features.includes('feature.challenge') && p.completedMaps.includes(l.mapId)
        : true)
  const best = p?.levels[l.id]

  const deploy = async () => {
    setDeploying(true)
    setDeployError(null)
    try {
      const session = await startSession({ mode: l.mode, levelId: l.id, presetId: choice.presetId, custom: choice.custom })
      setActive(session)
      navigate('/play/' + session.sessionId)
    } catch (e) {
      setDeployError((e as Error).message)
      setDeploying(false)
    }
  }

  return (
    <div className="screen">
      <GearBackdrop />
      <ScreenHeader title={l.name} back={back} />
      <div className="screen-scroll">
        <div className="briefing">
          <Panel title={`Level ${l.number} · ${map.name}`} className="briefing-map">
            <MapThumbnail map={map} width={520} activeSpawns={l.activeSpawns.length} />
            <p>{l.briefing}</p>
            <div className="briefing-mechanics">
              <div>
                <h4>
                  <Icon name="gear" size={14} /> {map.mechanic.name}
                </h4>
                <p className="muted">{map.mechanic.description}</p>
              </div>
              <div>
                <h4>
                  <Icon name="hammer" size={14} /> {map.interaction.name}
                </h4>
                <p className="muted">{map.interaction.description}</p>
              </div>
            </div>
          </Panel>

          <div className="briefing-side">
            <Panel title="Intelligence">
              <div className="briefing-facts">
                <span>
                  <Icon name="wave" size={16} /> {l.waves.length} waves
                </span>
                <span>
                  <Icon name="core" size={16} /> {l.cores} cores
                </span>
                <span>
                  <Icon name="coin" size={16} /> {l.startingGold} gold
                </span>
              </div>
              <ul className="enemy-list">
                {[...composition.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([enemyId, count]) => {
                    const enemy = content.enemies.get(enemyId)!
                    return (
                      <li key={enemyId} className={enemy.isBoss ? 'boss' : ''}>
                        <EnemyPortrait enemy={enemy} size={28} />
                        <span>{enemy.name}</span>
                        <b>×{count}</b>
                      </li>
                    )
                  })}
              </ul>
              {l.rules.length > 0 && <p className="muted">{l.rules.map(formatRule).join(' · ')}</p>}
              {l.unlocksTowers.map((t) => {
                const tower = content.towers.get(t)!
                return (
                  <p key={t} className="unlock-note">
                    <Icon name={categoryIcon[tower.category]} size={14} /> Victory unlocks the <b>{tower.name}</b>.
                  </p>
                )
              })}
            </Panel>

            <Panel title="Difficulty">
              <DifficultyPicker content={content} commanderLevel={profile.data?.commanderLevel ?? 1} />
            </Panel>

            <div className="deploy">
              {best && (
                <span className="best">
                  {[1, 2, 3].map((i) => (
                    <Icon key={i} name="star" size={18} style={{ color: i <= best.stars ? '#ffd25a' : 'rgba(0,0,0,0.5)' }} />
                  ))}
                  <em>Best {best.bestScore.toLocaleString()}</em>
                </span>
              )}
              <Button size="lg" icon={unlocked ? 'play' : 'lock'} disabled={!unlocked || deploying} onClick={() => void deploy()}>
                {unlocked ? (deploying ? 'Deploying…' : 'Deploy') : 'Locked'}
              </Button>
              {deployError && <p className="error-text">{deployError}</p>}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
