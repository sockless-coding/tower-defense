import { describe, expect, it } from 'vitest'
import { Simulation } from './simulation'
import { content, makeConfig, wave } from './testing'

const mixedWaves = [
  wave(1, [
    { enemy: 'automaton-scout', count: 8 },
    { enemy: 'gyrocopter', count: 4, delay: 1 },
    { enemy: 'smog-phantom', count: 3, delay: 2 },
    { enemy: 'shield-bearer', count: 2, delay: 3 },
  ]),
  wave(2, [
    { enemy: 'copper-centipede', count: 2 },
    { enemy: 'boiler-walker', count: 3, delay: 1 },
    { enemy: 'iron-beetle', count: 2, delay: 2 },
    { enemy: 'zeppelin-carrier', count: 1, delay: 3 },
    { enemy: 'sapper', count: 2, delay: 4 },
    { enemy: 'aether-leech', count: 2, delay: 4 },
    { enemy: 'pressure-titan', count: 1, delay: 6, hpMul: 0.2 },
  ]),
]

function platformCells(sim: Simulation): number[] {
  const g = sim.grid
  const core = g.center(g.core)
  return g
    .cellsOf('B')
    .sort((a, b) => Math.hypot(g.center(a).x - core.x, g.center(a).y - core.y) - Math.hypot(g.center(b).x - core.x, g.center(b).y - core.y) || a - b)
}

describe('every tower and upgrade path runs', () => {
  for (const tower of content.towers.values()) {
    for (const path of [['2a', '3a'], ['2b', '3b']]) {
      it(`${tower.id} via ${path.join('/')} + ultimate`, () => {
        const sim = new Simulation(makeConfig({ startingGold: 50000, mapId: 'underground-tunnels', waves: mixedWaves }))
        const cells = platformCells(sim)
        const ids: number[] = []
        for (const c of cells.slice(0, 4)) {
          const r = sim.perform({ type: 'build', tower: tower.id, x: c % sim.grid.width, y: Math.floor(c / sim.grid.width) })
          if (r.ok) ids.push(sim.towers[sim.towers.length - 1].id)
        }
        expect(ids.length).toBeGreaterThan(0)
        for (const id of ids) {
          for (const key of [...path, 'u']) expect(sim.perform({ type: 'upgrade', id, upgrade: `${tower.id}.${key}` }).ok).toBe(true)
        }
        sim.perform({ type: 'callWave' })
        for (let i = 0; i < 30 * 90 && sim.outcome === 'playing'; i++) sim.tick()
        expect(Number.isFinite(sim.gold)).toBe(true)
        expect(sim.enemies.every((e) => Number.isFinite(e.pos.x) && Number.isFinite(e.pos.y))).toBe(true)
      })
    }
  }
})

describe('every map mechanic and interaction runs', () => {
  for (const map of content.maps.values()) {
    it(map.id, () => {
      const sim = new Simulation(makeConfig({ mapId: map.id, startingGold: 5000, waves: mixedWaves, activeSpawns: [0] }))
      for (const c of platformCells(sim).slice(0, 6)) sim.perform({ type: 'build', tower: 'gatling-nest', x: c % sim.grid.width, y: Math.floor(c / sim.grid.width) })
      sim.perform({ type: 'callWave' })
      let interacted = false
      for (let i = 0; i < 30 * 120 && sim.outcome === 'playing'; i++) {
        sim.tick()
        const target = sim.enemies[0]
        if (!interacted && target && i > 200) interacted = sim.perform({ type: 'interact', x: target.pos.x, y: target.pos.y }).ok
      }
      expect(interacted).toBe(true)
      expect(sim.stats.interactionsUsed).toBe(1)
    })
  }
})
