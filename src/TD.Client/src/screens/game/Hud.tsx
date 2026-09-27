import { useMemo, useState } from 'react'
import type { Content } from '../../api/content'
import type { TowerCategory } from '../../api/types'
import type { GameController } from '../../game/GameController'
import type { TargetMode } from '../../game/sim/types'
import { formatStat, statLabel, titleCase } from '../../lib/labels'
import { useHud } from '../../state/game'
import { Button, Gauge } from '../../ui/components'
import { Icon, categoryIcon } from '../../ui/Icon'
import { TowerPortrait } from '../../ui/Portraits'

const CATEGORIES: TowerCategory[] = ['ballistic', 'electrical', 'flame', 'chemical', 'support', 'mechanical', 'experimental']
const TARGET_MODES: { id: TargetMode; label: string }[] = [
  { id: 'first', label: 'First' },
  { id: 'last', label: 'Last' },
  { id: 'strong', label: 'Strong' },
  { id: 'weak', label: 'Weak' },
  { id: 'close', label: 'Close' },
]

export function TopBar({ game, onMenu }: { game: GameController; onMenu: () => void }) {
  const hud = useHud()
  return (
    <div className="hud-top">
      <div className="hud-cluster">
        <div className="hud-stat gold" title="Gold">
          <Icon name="coin" size={20} />
          <b>{Math.floor(hud.gold).toLocaleString()}</b>
        </div>
        <div className="hud-cores" title={`${hud.vaultCores} in the vault, ${hud.cores} of ${hud.coresTotal} not yet lost`}>
          <Gauge value={hud.cores} max={hud.coresTotal} size={64} color={hud.cores / Math.max(1, hud.coresTotal) < 0.3 ? '#e0503a' : '#7fd4ff'} />
          <span>
            <Icon name="core" size={14} /> {hud.cores}/{hud.coresTotal}
          </span>
        </div>
        <div className="hud-stat" title="Wave">
          <Icon name="wave" size={18} />
          <b>
            {hud.wave}/{hud.waveCount}
          </b>
        </div>
      </div>

      <div className="hud-cluster center">
        {hud.canCallWave && (
          <Button size="sm" variant={hud.waitingForFirstWave ? 'brass' : 'copper'} icon="flag" onClick={() => game.callWave()} className={hud.waitingForFirstWave ? 'pulse' : ''}>
            {hud.waitingForFirstWave
              ? 'Begin assault'
              : hud.nextWaveIn !== null
                ? `Next wave ${Math.ceil(hud.nextWaveIn)}s${hud.earlyBonus > 0 ? ` · +${hud.earlyBonus}` : ''}`
                : 'Call next wave'}
          </Button>
        )}
      </div>

      <div className="hud-cluster right">
        {[1, 2, 3].filter((s) => s <= hud.maxSpeed).map((s) => (
          <button key={s} type="button" className={`speed-btn ${hud.speed === s ? 'active' : ''}`} onClick={() => game.setSpeed(s)}>
            {s}×
          </button>
        ))}
        <Button size="sm" variant="iron" icon={hud.paused ? 'play' : 'pause'} onClick={onMenu} aria-label="Pause" />
      </div>
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
          Damage <b>{Math.round(selected.damage).toLocaleString()}</b>
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
