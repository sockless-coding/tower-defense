import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useLoadedContent } from '../api/content'
import { api } from '../api/http'
import { useProgression, type ProgressionOverview } from '../api/sessions'
import type { ResearchCategory, ResearchNode } from '../api/types'
import { formatMod, titleCase } from '../lib/labels'
import { Button, GearBackdrop, GearSpinner, Panel, ScreenHeader, Stat } from '../ui/components'
import { Icon, type IconName } from '../ui/Icon'
import './screens.css'

const CATEGORIES: { id: ResearchCategory; name: string; icon: IconName; color: string }[] = [
  { id: 'steamPower', name: 'Steam Power', icon: 'flame', color: '#ff9a4a' },
  { id: 'engineering', name: 'Engineering', icon: 'wrench', color: '#d8b070' },
  { id: 'electricity', name: 'Electricity', icon: 'bolt', color: '#7fd4ff' },
  { id: 'chemistry', name: 'Chemistry', icon: 'flask', color: '#a6e05a' },
  { id: 'militaryScience', name: 'Military Science', icon: 'crosshair', color: '#e07a6a' },
]

const CELL_W = 118
const CELL_H = 108

export function ResearchScreen() {
  const content = useLoadedContent()
  const progression = useProgression()
  const client = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const purchase = useMutation({
    mutationFn: (id: string) => api<ProgressionOverview>(`/api/research/${id}/purchase`, { method: 'POST' }),
    onSuccess: (data) => {
      client.setQueryData(['progression'], data)
      void client.invalidateQueries({ queryKey: ['profile'] })
    },
  })

  const nodes = content.bundle.research
  const byId = content.research
  const owned = useMemo(() => new Set(progression.data?.research ?? []), [progression.data])
  const rp = progression.data?.researchPoints ?? 0
  const width = 15 * CELL_W
  const height = 5 * CELL_H

  if (!progression.data) {
    return (
      <div className="screen center">
        <GearBackdrop />
        <GearSpinner label="Opening the laboratory…" />
      </div>
    )
  }

  const state = (n: ResearchNode) => (owned.has(n.id) ? 'owned' : n.requires.every((r) => owned.has(r)) ? 'available' : 'locked')
  const node = selected ? byId.get(selected) : null

  return (
    <div className="screen">
      <GearBackdrop />
      <ScreenHeader title="Research" right={<Stat icon="flask" value={rp} label="Research points" color="var(--aether)" />} />
      <div className="research-layout">
        <div className="research-scroll">
          <div className="research-canvas" style={{ width, height: height + 44 }}>
            {CATEGORIES.map((c, i) => (
              <div key={c.id} className="research-cat" style={{ left: i * 3 * CELL_W, width: 3 * CELL_W, color: c.color }}>
                <Icon name={c.icon} size={16} /> {c.name}
              </div>
            ))}
            <svg className="research-links" width={width} height={height + 44}>
              {nodes.flatMap((n) =>
                n.requires.map((r) => {
                  const from = byId.get(r)!
                  const lit = owned.has(r) && owned.has(n.id)
                  const x1 = from.x * CELL_W + CELL_W / 2
                  const y1 = from.y * CELL_H + CELL_H / 2 + 44
                  const x2 = n.x * CELL_W + CELL_W / 2
                  const y2 = n.y * CELL_H + CELL_H / 2 + 44
                  const cross = CATEGORIES.findIndex((c) => c.id === from.category) !== CATEGORIES.findIndex((c) => c.id === n.category)
                  return (
                    <path
                      key={`${r}-${n.id}`}
                      d={`M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`}
                      className={`research-link ${lit ? 'lit' : ''} ${cross ? 'cross' : ''}`}
                    />
                  )
                }),
              )}
            </svg>
            {nodes.map((n) => {
              const s = state(n)
              const cat = CATEGORIES.find((c) => c.id === n.category)!
              const unlock = n.effects.find((e) => e.target === 'unlock')
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`research-node ${s} ${selected === n.id ? 'selected' : ''} ${unlock ? 'unlock' : ''}`}
                  style={{ left: n.x * CELL_W + 9, top: n.y * CELL_H + 44 + 10, ['--cat' as string]: cat.color }}
                  onClick={() => setSelected(n.id)}
                >
                  <span className="rn-icon">
                    <Icon name={s === 'owned' ? 'check' : s === 'locked' ? 'lock' : unlock ? 'star' : cat.icon} size={16} />
                  </span>
                  <span className="rn-name">{n.name}</span>
                  <span className="rn-cost">
                    <Icon name="flask" size={11} /> {n.cost}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <Panel title={node ? titleCase(node.category) : 'Laboratory'} className="research-detail">
          {node ? (
            <>
              <h2 className="engraved">{node.name}</h2>
              <p>{node.description}</p>
              <ul className="effect-list">
                {node.effects.map((e, i) => (
                  <li key={i}>
                    {e.target === 'unlock'
                      ? `Unlocks the ${content.towers.get(e.stat.replace('tower:', ''))?.name}`
                      : `${e.target === 'all' ? 'All towers' : e.target.startsWith('category:') ? `${titleCase(e.target.slice(9))} towers` : e.target.startsWith('tower:') ? content.towers.get(e.target.slice(6))?.name : titleCase(e.target)}: ${formatMod(e)}`}
                  </li>
                ))}
              </ul>
              {node.requires.length > 0 && (
                <p className="muted small">Requires: {node.requires.map((r) => byId.get(r)?.name).join(', ')}</p>
              )}
              {state(node) === 'owned' ? (
                <p className="owned-line">
                  <Icon name="check" size={16} /> Researched
                </p>
              ) : (
                <Button
                  icon="flask"
                  disabled={state(node) !== 'available' || rp < node.cost || purchase.isPending}
                  onClick={() => purchase.mutate(node.id)}
                >
                  Research · {node.cost}
                </Button>
              )}
              {purchase.error && <p className="error-text">{(purchase.error as Error).message}</p>}
            </>
          ) : (
            <p className="muted">
              Spend research points earned from victories, new stars and commander promotions. Some projects require breakthroughs in other disciplines; experimental towers are unlocked here.
            </p>
          )}
        </Panel>
      </div>
    </div>
  )
}
