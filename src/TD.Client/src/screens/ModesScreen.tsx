import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLoadedContent } from '../api/content'
import { startSession, useEvents, useProgression, type LiveEvent } from '../api/sessions'
import type { GameMode } from '../api/types'
import { formatRule } from '../lib/labels'
import { useActiveSession } from '../state/game'
import { Button, GearBackdrop, GearSpinner, Panel, ScreenHeader } from '../ui/components'
import { Icon } from '../ui/Icon'
import { MapThumbnail } from '../ui/MapThumbnail'
import './screens.css'

function useCountdown(until: string | undefined): string {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  if (!until) return ''
  const ms = Math.max(0, Date.parse(until) - now)
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const d = Math.floor(h / 24)
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h ${m}m`
}

export function ModesScreen() {
  const content = useLoadedContent()
  const progression = useProgression()
  const events = useEvents()
  const navigate = useNavigate()
  const setActive = useActiveSession((s) => s.set)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mapMode, setMapMode] = useState<'survival' | 'endless' | null>(null)
  const p = progression.data

  const launch = async (key: string, mode: GameMode, mapId?: string) => {
    setBusy(key)
    setError(null)
    try {
      const session = await startSession({ mode, mapId })
      setActive(session)
      navigate(`/play/${session.sessionId}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  if (!p) {
    return (
      <div className="screen center">
        <GearBackdrop />
        <GearSpinner label="Posting the dispatches…" />
      </div>
    )
  }

  const has = (f: string) => p.features.includes(f)
  const levelFor = (f: string) => content.bundle.commander.rewards.find((r) => r.id === f)?.level ?? 1

  return (
    <div className="screen">
      <GearBackdrop />
      <ScreenHeader title="Operations" />
      {error && <p className="error-text" style={{ zIndex: 1 }}>{error}</p>}
      <div className="screen-scroll">
        <div className="modes-grid">
          {events.data ? (
            <>
              <EventCard event={events.data.daily} title="Daily Challenge" icon="calendar" locked={!has('feature.daily')} unlockAt={levelFor('feature.daily')} busy={busy === 'daily'} onPlay={() => void launch('daily', 'daily')} />
              <EventCard event={events.data.weekly} title="Weekly Event" icon="trophy" locked={!has('feature.weekly')} unlockAt={levelFor('feature.weekly')} busy={busy === 'weekly'} onPlay={() => void launch('weekly', 'weekly')} />
            </>
          ) : (
            <GearSpinner />
          )}

          <Panel title="Survival" className="mode-card">
            <p className="muted">Hold a map against sixty ever-stronger waves. Scored on waves survived.</p>
            {has('feature.survival') ? (
              <Button icon="shield" onClick={() => setMapMode('survival')}>
                Choose a map
              </Button>
            ) : (
              <p className="muted small">
                <Icon name="lock" size={12} /> Commander level {levelFor('feature.survival')}
              </p>
            )}
          </Panel>

          <Panel title="Endless Nightmare" className="mode-card nightmare">
            <p className="muted">Nightmare difficulty. No end. A boss every ten waves. How deep can you go?</p>
            {has('feature.endless') ? (
              <Button variant="danger" icon="infinity" onClick={() => setMapMode('endless')}>
                Choose a map
              </Button>
            ) : (
              <p className="muted small">
                <Icon name="lock" size={12} /> Commander level {levelFor('feature.endless')}
              </p>
            )}
          </Panel>

          <Panel title="Challenges" className="mode-card wide">
            {!has('feature.challenge') && (
              <p className="muted small">
                <Icon name="lock" size={12} /> Challenges unlock at Commander level {levelFor('feature.challenge')}; each also needs its map beaten in the campaign.
              </p>
            )}
            <div className="challenge-list">
              {content.bundle.challenges.map((c) => {
                const open = has('feature.challenge') && p.completedMaps.includes(c.mapId)
                const stars = p.levels[c.id]?.stars ?? 0
                return (
                  <button key={c.id} type="button" className={`challenge ${open ? '' : 'locked'}`} disabled={!open} onClick={() => navigate(`/level/${c.id}`)}>
                    <span>{c.name}</span>
                    <span className="muted small">{c.briefing.replace(/^Challenge — [^.]+\. /, '')}</span>
                    {stars > 0 && <span className="challenge-stars">{'★'.repeat(stars)}</span>}
                  </button>
                )
              })}
            </div>
          </Panel>
        </div>
      </div>

      {mapMode && (
        <div className="modal-scrim" onClick={() => setMapMode(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <Panel title={mapMode === 'survival' ? 'Survival · choose a map' : 'Endless Nightmare · choose a map'}>
              <div className="map-pick">
                {content.bundle.maps.map((m) => {
                  const open = p.completedMaps.includes(m.id)
                  const best = p.statistics[`${mapMode}.bestWave`]
                  return (
                    <button key={m.id} type="button" disabled={!open || busy !== null} className={`map-pick-card ${open ? '' : 'locked'}`} onClick={() => void launch(m.id, mapMode, m.id)}>
                      <MapThumbnail map={m} width={160} />
                      <span>{m.name}</span>
                      {!open && <Icon name="lock" size={14} />}
                      {open && best !== undefined && <span className="muted small">Best wave overall: {best}</span>}
                    </button>
                  )
                })}
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}

function EventCard({ event, title, icon, locked, unlockAt, busy, onPlay }: { event: LiveEvent; title: string; icon: 'calendar' | 'trophy'; locked: boolean; unlockAt: number; busy: boolean; onPlay: () => void }) {
  const content = useLoadedContent()
  const map = content.maps.get(event.level.mapId)!
  const remaining = useCountdown(event.endsAt)
  const navigate = useNavigate()
  return (
    <Panel title={title} className="mode-card event">
      <MapThumbnail map={map} width={280} />
      <h3>
        <Icon name={icon} size={16} /> {event.level.name}
      </h3>
      <p className="muted small">
        {event.level.waveCount} waves · {content.bundle.difficulty.presets.find((p) => p.id === event.presetId)?.name}
        {event.level.rules.length > 0 && ` · ${event.level.rules.map(formatRule).join(', ')}`}
        {event.level.allowedTowers && ` · ${event.level.allowedTowers.length}-tower arsenal`}
      </p>
      <p className="event-meta">
        <span>
          <Icon name="clock" size={13} /> Ends in {remaining}
        </span>
        {event.myBest !== null && (
          <span>
            <Icon name="star" size={13} /> Best {event.myBest.toLocaleString()}
          </span>
        )}
      </p>
      <div className="event-actions">
        {locked ? (
          <span className="muted small">
            <Icon name="lock" size={12} /> Commander level {unlockAt}
          </span>
        ) : (
          <Button icon="play" disabled={busy} onClick={onPlay}>
            {busy ? 'Deploying…' : 'Play'}
          </Button>
        )}
        <Button variant="iron" size="sm" icon="trophy" onClick={() => navigate(`/leaderboards?board=${encodeURIComponent(event.boardKey)}`)}>
          Rankings
        </Button>
      </div>
    </Panel>
  )
}
