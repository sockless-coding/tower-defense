import { useState } from 'react'
import { useLoadedContent } from '../api/content'
import type { EnemyDefinition, MapDefinition, TowerCategory, TowerDefinition } from '../api/types'
import { damageTypeColor, formatMod, formatStat, statLabel, titleCase } from '../lib/labels'
import { GearBackdrop, Panel, ScreenHeader, Tabs } from '../ui/components'
import { Icon, categoryIcon } from '../ui/Icon'
import { MapThumbnail } from '../ui/MapThumbnail'
import './screens.css'

type Section = 'towers' | 'enemies' | 'maps'

export function CodexScreen() {
  const [section, setSection] = useState<Section>('towers')
  return (
    <div className="screen">
      <GearBackdrop />
      <ScreenHeader title="Engineer's Codex" />
      <Tabs
        tabs={[
          { id: 'towers', label: 'Towers', icon: 'hammer' },
          { id: 'enemies', label: 'Bestiary', icon: 'skull' },
          { id: 'maps', label: 'Atlas', icon: 'map' },
        ]}
        value={section}
        onChange={setSection}
      />
      <div className="screen-scroll codex">
        {section === 'towers' && <TowerCodex />}
        {section === 'enemies' && <EnemyCodex />}
        {section === 'maps' && <MapCodex />}
      </div>
    </div>
  )
}

const CATEGORIES: TowerCategory[] = ['ballistic', 'electrical', 'flame', 'chemical', 'support', 'mechanical', 'experimental']

function TowerCodex() {
  const content = useLoadedContent()
  const [selected, setSelected] = useState<string>(content.bundle.towers[0].id)
  const tower = content.towers.get(selected)!
  return (
    <div className="codex-layout">
      <nav className="codex-list">
        {CATEGORIES.map((cat) => (
          <div key={cat}>
            <h4 className="codex-cat" style={{ color: `var(--cat-${cat})` }}>
              <Icon name={categoryIcon[cat]} size={14} /> {titleCase(cat)}
            </h4>
            {content.bundle.towers
              .filter((t) => t.category === cat)
              .map((t) => (
                <button key={t.id} type="button" className={`codex-item ${t.id === selected ? 'selected' : ''}`} onClick={() => setSelected(t.id)}>
                  {t.name}
                </button>
              ))}
          </div>
        ))}
      </nav>
      <TowerDetail tower={tower} />
    </div>
  )
}

function TowerDetail({ tower }: { tower: TowerDefinition }) {
  const content = useLoadedContent()
  const tier = (t: number, branch: string) => tower.upgrades.find((u) => u.tier === t && u.branch === branch)!
  const research = tower.unlock.research ? content.research.get(tower.unlock.research) : null

  return (
    <Panel title={`${titleCase(tower.category)} · ${titleCase(tower.attack)}`} className="codex-detail">
      <h2 className="engraved codex-name">{tower.name}</h2>
      <p>{tower.description}</p>
      <p className="muted flavor">“{tower.flavor}”</p>
      <div className="codex-tags">
        <span className="chip" style={{ color: damageTypeColor[tower.damageType] }}>
          {titleCase(tower.damageType)}
        </span>
        <span className="chip">Targets {tower.targets === 'both' ? 'ground & air' : tower.targets}</span>
        <span className="chip">
          <Icon name="coin" size={12} /> {tower.cost}
        </span>
        <span className="chip">Unlocks at level {tower.unlock.campaignLevel}</span>
        {research && <span className="chip" style={{ color: 'var(--aether)' }}>Research: {research.name}</span>}
        {tower.maxPerLevel && <span className="chip">Max {tower.maxPerLevel} per level</span>}
      </div>

      <table className="stat-table">
        <tbody>
          {Object.entries(tower.stats).map(([key, value]) => (
            <tr key={key}>
              <th>{statLabel(key)}</th>
              <td>{formatStat(key, value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tower.abilities.map((a) => (
        <p key={a.name} className="ability">
          <b>{a.name}.</b> {a.description}
        </p>
      ))}

      <h3 className="codex-sub">Upgrade tree</h3>
      <div className="upgrade-tree">
        <div className="upgrade-col">
          <div className="upgrade-node base">
            <span className="upgrade-tier">Tier I</span>
            <b>{tower.name}</b>
          </div>
        </div>
        {[2, 3].map((t) => (
          <div key={t} className="upgrade-col">
            {['A', 'B'].map((b) => {
              const u = tier(t, b)
              return (
                <div key={u.id} className="upgrade-node">
                  <span className="upgrade-tier">
                    Tier {t === 2 ? 'II' : 'III'} · {b}
                    <span className="upgrade-cost">
                      <Icon name="coin" size={11} /> {u.cost}
                    </span>
                  </span>
                  <b>{u.name}</b>
                  <p>{u.description}</p>
                  {u.mods.map((m) => (
                    <span key={m.stat + m.op} className="mod">
                      {formatMod(m)}
                    </span>
                  ))}
                  {u.abilities.map((a) => (
                    <span key={a.name} className="mod ability-mod">
                      {a.name}: {a.description}
                    </span>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
        <div className="upgrade-col">
          {(() => {
            const u = tier(4, 'U')
            return (
              <div className="upgrade-node ultimate">
                <span className="upgrade-tier">
                  Ultimate
                  <span className="upgrade-cost">
                    <Icon name="coin" size={11} /> {u.cost}
                  </span>
                </span>
                <b>{u.name}</b>
                <p>{u.description}</p>
                {u.mods.map((m) => (
                  <span key={m.stat + m.op} className="mod">
                    {formatMod(m)}
                  </span>
                ))}
                {u.abilities.map((a) => (
                  <span key={a.name} className="mod ability-mod">
                    {a.name}: {a.description}
                  </span>
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {tower.synergies.length > 0 && (
        <>
          <h3 className="codex-sub">Synergies</h3>
          {tower.synergies.map((s) => (
            <p key={s.name} className="ability">
              <b>{s.name}</b> — {s.description}{' '}
              <span className="muted">
                (with {s.partner.startsWith('category:') ? `any ${titleCase(s.partner.slice(9))} tower` : content.towers.get(s.partner)?.name} within {s.radius} tiles)
              </span>
            </p>
          ))}
        </>
      )}

      <h3 className="codex-sub">Prestige</h3>
      <p className="muted">
        {tower.prestige.maxRank} ranks, each granting {tower.prestige.modsPerRank.map(formatMod).join(', ')}. Rank {tower.prestige.maxRank} awards the
        Gilded skin. Costs {tower.prestige.gearCost.join(' / ')} gears.
      </p>
    </Panel>
  )
}

function EnemyCodex() {
  const content = useLoadedContent()
  const enemies = content.bundle.enemies.filter((e) => e.threat > 0 || e.isBoss)
  const [selected, setSelected] = useState(enemies[0].id)
  const enemy = content.enemies.get(selected)!
  return (
    <div className="codex-layout">
      <nav className="codex-list">
        {[false, true].map((boss) => (
          <div key={String(boss)}>
            <h4 className="codex-cat">{boss ? 'Bosses' : 'Machines'}</h4>
            {enemies
              .filter((e) => e.isBoss === boss)
              .map((e) => (
                <button key={e.id} type="button" className={`codex-item ${e.id === selected ? 'selected' : ''}`} onClick={() => setSelected(e.id)}>
                  {e.name}
                </button>
              ))}
          </div>
        ))}
      </nav>
      <EnemyDetail enemy={enemy} />
    </div>
  )
}

function EnemyDetail({ enemy }: { enemy: EnemyDefinition }) {
  const content = useLoadedContent()
  const types = ['ballistic', 'electric', 'fire', 'chemical', 'force', 'temporal'] as const
  return (
    <Panel title={enemy.isBoss ? 'Boss' : enemy.movement === 'air' ? 'Airborne' : 'Ground'} className="codex-detail">
      <h2 className="engraved codex-name">{enemy.name}</h2>
      <p>{enemy.description}</p>
      <table className="stat-table">
        <tbody>
          <tr><th>Health</th><td>{enemy.hp.toLocaleString()}</td></tr>
          <tr><th>Armour</th><td>{enemy.armor}</td></tr>
          <tr><th>Speed</th><td>{enemy.speed} tiles/s</td></tr>
          <tr><th>Bounty</th><td>{enemy.bounty} gold</td></tr>
          <tr><th>Cores carried</th><td>{enemy.coreCarry}</td></tr>
          <tr><th>First seen</th><td>Level {enemy.introducedAtLevel}</td></tr>
        </tbody>
      </table>
      <h3 className="codex-sub">Resistances</h3>
      <div className="resist-bars">
        {types.map((t) => {
          const r = enemy.resist[t] ?? 0
          return (
            <div key={t} className="resist-row">
              <span style={{ color: damageTypeColor[t] }}>{titleCase(t)}</span>
              <div className="resist-track">
                <div
                  className={`resist-fill ${r < 0 ? 'weak' : ''}`}
                  style={{ width: `${Math.min(100, Math.abs(r) * 100)}%`, background: r < 0 ? 'var(--ok)' : damageTypeColor[t] }}
                />
              </div>
              <b>{r > 0 ? `${Math.round(r * 100)}%` : r < 0 ? `Weak ${Math.round(-r * 100)}%` : '—'}</b>
            </div>
          )
        })}
      </div>
      {enemy.immune.length > 0 && <p className="muted">Immune to: {enemy.immune.map(titleCase).join(', ')}</p>}
      {enemy.abilities.length > 0 && (
        <>
          <h3 className="codex-sub">Abilities</h3>
          {enemy.abilities.map((a, i) => (
            <p key={i} className="ability">
              <b>{titleCase(a.kind)}</b>
              {a.spawns && <> — releases {content.enemies.get(a.spawns)?.name}</>}
            </p>
          ))}
        </>
      )}
      {enemy.phases.length > 0 && (
        <>
          <h3 className="codex-sub">Phases</h3>
          {enemy.phases.map((p) => (
            <p key={p.name} className="ability">
              <b>{p.name}</b> <span className="muted">(below {Math.round(p.hpBelow * 100)}% health)</span> —{' '}
              {p.abilities.map((a) => titleCase(a.kind)).join(', ')}
              {p.speedMul !== 1 && `, speed ×${p.speedMul}`}
            </p>
          ))}
        </>
      )}
    </Panel>
  )
}

function MapCodex() {
  const content = useLoadedContent()
  return (
    <div className="atlas">
      {content.bundle.maps.map((map: MapDefinition) => (
        <Panel key={map.id} title={titleCase(map.theme)}>
          <MapThumbnail map={map} width={300} />
          <h3 className="atlas-name">{map.name}</h3>
          <p className="muted">{map.description}</p>
          <p className="ability">
            <b>{map.mechanic.name}.</b> {map.mechanic.description}
          </p>
          <p className="ability">
            <b>{map.interaction.name}.</b> {map.interaction.description}
          </p>
        </Panel>
      ))}
    </div>
  )
}
