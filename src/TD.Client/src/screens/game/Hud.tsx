import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import type { Content } from '../../api/content'
import type { TowerCategory } from '../../api/types'
import type { GameController } from '../../game/GameController'
import type { TargetMode } from '../../game/sim/types'
import { formatStat, statLabel, titleCase } from '../../lib/labels'
import { useHud } from '../../state/game'
import { Button, Gauge } from '../../ui/components'
import { categoryIcon } from '../../ui/categoryIcon'
import { Icon } from '../../ui/Icon'
import { EnemyPortrait, TowerPortrait } from '../../ui/Portraits'

const CATEGORIES: TowerCategory[] = ['ballistic', 'electrical', 'flame', 'chemical', 'support', 'mechanical', 'experimental']
const TARGET_MODES: { id: TargetMode; label: string }[] = [
  { id: 'first', label: 'First' },
  { id: 'last', label: 'Last' },
  { id: 'strong', label: 'Strong' },
  { id: 'weak', label: 'Weak' },
  { id: 'close', label: 'Close' },
]

/**
 * The whole in-battle HUD. The top strip and bottom dock are solid bands; their measured heights are handed to the
 * renderer so the map is framed between them, and exposed as CSS variables for the floating overlays.
 */
export function GameHud({ game, content, onMenu }: { game: GameController; content: Content; onMenu: () => void }) {
  const buildSelection = useHud((s) => s.buildSelection)
  const topRef = useRef<HTMLElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const top = topRef.current
    const bottom = bottomRef.current
    const screen = top?.closest<HTMLElement>('.game-screen')
    if (!top || !bottom || !screen) return
    const sync = () => {
      const frame = screen.getBoundingClientRect()
      const topH = Math.round(top.getBoundingClientRect().bottom - frame.top)
      const bottomH = Math.round(frame.bottom - bottom.getBoundingClientRect().top)
      screen.style.setProperty('--hud-top-h', `${topH}px`)
      screen.style.setProperty('--hud-bottom-h', `${bottomH}px`)
      game.renderer.setHudInsets(topH, bottomH)
    }
    const observer = new ResizeObserver(sync)
    observer.observe(top)
    observer.observe(bottom)
    observer.observe(screen)
    sync()
    return () => observer.disconnect()
  }, [game])

  return (
    <>
      <TopBar game={game} content={content} onMenu={onMenu} ref={topRef} />
      <BossBar />
      <Toasts />
      <TowerPanel game={game} content={content} />
      {buildSelection && (
        <div className="build-hint">
          Tap a tile to build · <button type="button" onClick={() => game.selectBuild(null)}>Cancel</button>
        </div>
      )}
      <div className="hud-bottom" ref={bottomRef}>
        <BuildBar game={game} content={content} />
        <InteractionButton game={game} />
      </div>
    </>
  )
}

function TopBar({ game, content, onMenu, ref }: { game: GameController; content: Content; onMenu: () => void; ref: Ref<HTMLElement> }) {
  const hud = useHud()
  return (
    <header className="hud-top" ref={ref}>
      <div className="hud-cluster">
        <div className="hud-stat gold" title="Gold">
          <Icon name="coin" size={18} />
          <b>{Math.floor(hud.gold).toLocaleString()}</b>
        </div>
        <div className="hud-cores" title={`${hud.vaultCores} in the vault, ${hud.cores} of ${hud.coresTotal} not yet lost`}>
          <Gauge value={hud.cores} max={hud.coresTotal} size={44} color={hud.cores / Math.max(1, hud.coresTotal) < 0.3 ? '#e0503a' : '#7fd4ff'} />
          <span>
            <Icon name="core" size={12} /> {hud.cores}/{hud.coresTotal}
          </span>
        </div>
        <div className="hud-stat" title="Wave">
          <Icon name="wave" size={16} />
          <b>
            {hud.wave}/{hud.waveCount}
          </b>
        </div>
      </div>

      <WaveConsole game={game} content={content} />

      <div className="hud-cluster right">
        {[1, 2, 3].filter((s) => s <= hud.maxSpeed).map((s) => (
          <button key={s} type="button" className={`speed-btn ${hud.speed === s ? 'active' : ''}`} onClick={() => game.setSpeed(s)}>
            {s}×
          </button>
        ))}
        <Button size="sm" variant="iron" icon={hud.paused ? 'play' : 'pause'} onClick={onMenu} aria-label="Pause" />
      </div>
    </header>
  )
}

const MAX_CHIPS = 6

/** The next wave at a glance (enemy chips with counts and entrances) next to the call-wave control. */
function WaveConsole({ game, content }: { game: GameController; content: Content }) {
  const intel = useHud((s) => s.nextWave)
  const canCall = useHud((s) => s.canCallWave)
  const waiting = useHud((s) => s.waitingForFirstWave)
  const nextWaveIn = useHud((s) => s.nextWaveIn)
  const earlyBonus = useHud((s) => s.earlyBonus)
  // Details are open for a specific wave, so they close by themselves once that wave is released.
  const [openFor, setOpenFor] = useState<number | null>(null)
  const open = intel !== null && openFor === intel.number
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenFor(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  if (!intel || !canCall) return <div className="wave-console empty" />
  const shown = intel.entries.slice(0, MAX_CHIPS)
  const extra = intel.entries.length - shown.length
  return (
    <div className={`wave-console ${intel.boss ? 'boss' : ''}`} ref={rootRef}>
      <button type="button" className="wc-intel" onClick={() => setOpenFor(open ? null : intel.number)} aria-expanded={open} title="Show what the next wave holds">
        <span className="wc-label">
          <Icon name={intel.boss ? 'skull' : 'wave'} size={12} />
          {intel.number}
        </span>
        <span className="wc-chips">
          {shown.map((e) => {
            const def = content.enemies.get(e.enemyId)
            return (
              <span key={`${e.enemyId}:${e.elite}`} className={`wc-chip ${e.boss ? 'boss' : e.elite ? 'elite' : ''}`}>
                {def && <EnemyPortrait enemy={def} size={26} />}
                <b>{e.count}</b>
                {e.air && <i className="wc-air" aria-label="flying" />}
                {e.gates.length > 0 && <span className="wc-gate">{e.gates.join('')}</span>}
              </span>
            )
          })}
          {extra > 0 && <span className="wc-more">+{extra}</span>}
        </span>
      </button>
      <Button size="sm" variant={waiting ? 'brass' : 'copper'} icon="flag" onClick={() => game.callWave()} className={`wc-call ${waiting ? 'pulse' : ''}`}>
        {waiting ? 'Begin' : nextWaveIn !== null ? `${Math.ceil(nextWaveIn)}s${earlyBonus > 0 ? ` +${earlyBonus}` : ''}` : 'Call'}
      </Button>
      {open && (
        <div className="wc-details">
          <header>
            Wave {intel.number} · {intel.total} enemies
          </header>
          <ul>
            {intel.entries.map((e) => {
              const def = content.enemies.get(e.enemyId)
              return (
                <li key={`${e.enemyId}:${e.elite}`} className={e.boss ? 'boss' : e.elite ? 'elite' : ''} title={def?.description}>
                  {def && <EnemyPortrait enemy={def} size={24} />}
                  <span className="wc-name">
                    {e.name}
                    {e.elite && <Icon name="star" size={11} />}
                    {e.air && <span className="wc-tag">air</span>}
                  </span>
                  {e.gates.length > 0 && (
                    <span className="wc-gates">
                      {e.gates.map((g) => (
                        <span key={g}>{g}</span>
                      ))}
                    </span>
                  )}
                  <b>×{e.count}</b>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export function BossBar() {
  const boss = useHud((s) => s.boss)
  if (!boss) return null
  const pct = Math.max(0, (boss.hp / boss.maxHp) * 100)
  return (
    <div className="boss-bar">
      <span>
        <Icon name="skull" size={14} /> {boss.name}
      </span>
      <div className="boss-track">
        <div className="boss-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function Toasts() {
  const toasts = useHud((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function BuildBar({ game, content }: { game: GameController; content: Content }) {
  const gold = useHud((s) => s.gold)
  const selection = useHud((s) => s.buildSelection)
  const unlocked = game.sim.config.unlockedTowers
  const [category, setCategory] = useState<TowerCategory | 'all'>('all')
  const towers = useMemo(
    () =>
      content.bundle.towers
        .filter((t) => unlocked.includes(t.id))
        .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.cost - b.cost),
    [content, unlocked],
  )
  const categories = CATEGORIES.filter((c) => towers.some((t) => t.category === c))
  const shown = category === 'all' ? towers : towers.filter((t) => t.category === category)

  return (
    <div className="build-bar">
      {categories.length > 2 && (
        <div className="build-cats">
          <button type="button" className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>
            All
          </button>
          {categories.map((c) => (
            <button key={c} type="button" className={category === c ? 'active' : ''} onClick={() => setCategory(c)} style={{ color: `var(--cat-${c})` }}>
              <Icon name={categoryIcon[c]} size={14} />
            </button>
          ))}
        </div>
      )}
      <div className="build-cards">
        {shown.map((t) => {
          const cost = game.sim.costOf(t)
          const affordable = gold >= cost
          return (
            <button
              key={t.id}
              type="button"
              className={`build-card ${selection === t.id ? 'selected' : ''} ${affordable ? '' : 'poor'}`}
              onClick={() => game.selectBuild(t.id)}
              title={`${t.name} — ${t.description}`}
            >
              <TowerPortrait tower={t} size={48} />
              <span className="build-name">{t.name}</span>
              <span className="build-cost">
                <Icon name="coin" size={11} /> {cost}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TowerPanel({ game, content }: { game: GameController; content: Content }) {
  const selected = useHud((s) => s.selected)
  const gold = useHud((s) => s.gold)
  const [confirmSell, setConfirmSell] = useState(false)
  if (!selected) return null
  const def = content.towers.get(selected.towerId)!
  return (
    <aside className="tower-panel" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <TowerPortrait tower={def} size={52} tier={selected.level} />
        <div>
          <h3>{selected.name}</h3>
          <div className="pips">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={i <= selected.level ? 'on' : ''} />
            ))}
          </div>
        </div>
        <button type="button" className="panel-x" onClick={() => game.deselect()} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </header>
      {selected.stunned && <p className="warn-line">Jammed!</p>}
      <div className="tp-stats">
        {selected.stats.map((s) => (
          <span key={s.key}>
            {statLabel(s.key)} <b>{formatStat(s.key, s.value)}</b>
          </span>
        ))}
        <span>
          Kills <b>{selected.kills}</b>
        </span>
        <span>
          Dealt <b>{Math.round(selected.damage).toLocaleString()}</b>
        </span>
      </div>
      {selected.synergies.length > 0 && <p className="synergy-line">⚙ {selected.synergies.join(' · ')}</p>}
      {def.attack !== 'support' && def.attack !== 'economy' && (
        <div className="tp-target">
          {TARGET_MODES.map((m) => (
            <button key={m.id} type="button" className={selected.targetMode === m.id ? 'active' : ''} onClick={() => game.setTargetMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      )}
      <div className="tp-upgrades">
        {selected.options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`upgrade-btn ${o.branch === 'U' ? 'ultimate' : ''}`}
            disabled={!o.allowed || gold < o.cost}
            onClick={() => game.upgrade(o.id)}
            title={o.reason ?? o.description}
          >
            <span className="ub-head">
              <b>{o.name}</b>
              <span>
                <Icon name="coin" size={11} /> {o.cost}
              </span>
            </span>
            <span className="ub-desc">{o.description}</span>
          </button>
        ))}
        {selected.options.length === 0 && <p className="muted small">Fully upgraded.</p>}
      </div>
      {selected.canSell &&
        (confirmSell ? (
          <div className="tp-sell">
            <Button size="sm" variant="danger" onClick={() => { game.sell(); setConfirmSell(false) }}>
              Sell for {selected.sellValue}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmSell(false)}>
              Keep
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="iron" icon="sell" onClick={() => setConfirmSell(true)}>
            Sell · {selected.sellValue}
          </Button>
        ))}
      <p className="muted small">{titleCase(selected.category)}</p>
    </aside>
  )
}

export function InteractionButton({ game }: { game: GameController }) {
  const i = useHud((s) => s.interaction)
  if (i.disabled) return null
  const progress = i.cooldown > 0 ? 1 - i.cooldownLeft / i.cooldown : 1
  const circumference = 2 * Math.PI * 30
  return (
    <button type="button" className={`interaction-btn ${i.targeting ? 'targeting' : ''} ${i.ready ? 'ready' : ''}`} onClick={() => game.beginInteraction()} disabled={!i.ready} title={i.description}>
      <svg viewBox="0 0 72 72" width={72} height={72}>
        <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="6" />
        <circle
          cx="36"
          cy="36"
          r="30"
          fill="none"
          stroke={i.ready ? '#7fd4ff' : '#c8923e'}
          strokeWidth="6"
          strokeDasharray={`${circumference * progress} ${circumference}`}
          transform="rotate(-90 36 36)"
          strokeLinecap="round"
        />
      </svg>
      <Icon name="hammer" size={24} />
      <span className="interaction-label">{i.targeting ? 'Choose a spot' : i.ready ? i.name : `${Math.ceil(i.cooldownLeft)}s`}</span>
    </button>
  )
}
