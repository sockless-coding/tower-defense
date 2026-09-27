import { describe, expect, it } from 'vitest'
import { Grid } from './grid'
import { hashString, Rng } from './rng'
import { replay, Simulation } from './simulation'
import { canPurchase, computeTower } from './stats'
import { content, makeConfig, wave } from './testing'

function runToEnd(sim: Simulation, maxTicks = 30 * 60 * 20): Simulation {
  while (sim.outcome === 'playing' && sim.tickCount < maxTicks) sim.tick()
  return sim
}

/** Places towers on the first buildable platform tiles nearest the vault. */
function fortify(sim: Simulation, towerId: string, count: number): number[] {
  const g = sim.grid
  const core = g.center(g.core)
  const cells: number[] = []
  for (let i = 0; i < g.width * g.height; i++) if (g.charAt(i) === 'B') cells.push(i)
  cells.sort((a, b) => Math.hypot(g.center(a).x - core.x, g.center(a).y - core.y) - Math.hypot(g.center(b).x - core.x, g.center(b).y - core.y) || a - b)
  const ids: number[] = []
  for (const c of cells.slice(0, count)) {
    const r = sim.perform({ type: 'build', tower: towerId, x: c % g.width, y: Math.floor(c / g.width) })
    if (r.ok) ids.push(sim.towers[sim.towers.length - 1].id)
  }
  return ids
}

describe('rng', () => {
  it('matches the server reference sequence', () => {
    const rng = new Rng(12345)
    expect([0, 0, 0, 0, 0].map(() => rng.nextUint())).toEqual([4207900869, 1317490944, 2079646450, 3513001552, 2187978186])
    expect(hashString('campaign-001')).toBe(2835741409)
  })
})

describe('grid', () => {
  it('rejects placements that would seal every route', () => {
    const map = content.maps.get('underground-tunnels')!
    const grid = new Grid(map)
    const core = grid.core
    const x = core % grid.width
    const y = Math.floor(core / grid.width)
    // Wall off the vault's open neighbours one at a time; the last one must be refused.
    const neighbours = [grid.index(x - 1, y), grid.index(x, y - 1), grid.index(x, y + 1)].filter((i) => grid.isWalkable(i))
    for (const n of neighbours.slice(0, -1)) {
      expect(grid.routesIntact(n)).toBe(true)
      grid.tower[n] = 99
    }
    expect(grid.routesIntact(neighbours[neighbours.length - 1])).toBe(false)
  })

  it('reroutes enemies when a floor tile is built on', () => {
    const sim = new Simulation(makeConfig({ mapId: 'industrial-city' }))
    const spawn = sim.grid.spawns[0]
    const before = sim.grid.toCore.dist[spawn]
    // Walk the current optimal path and build on the first floor tile along it that keeps routes intact.
    let cell = spawn
    let built = false
    for (let guard = 0; guard < 60 && !built; guard++) {
      cell = sim.grid.toCore.next[cell]
      if (cell < 0 || cell === sim.grid.core) break
      if (sim.grid.charAt(cell) === '.' && sim.perform({ type: 'build', tower: 'rivet-cannon', x: cell % sim.grid.width, y: Math.floor(cell / sim.grid.width) }).ok) built = true
    }
    expect(built).toBe(true)
    expect(sim.grid.toCore.dist[spawn]).toBeGreaterThanOrEqual(before)
  })
})

describe('stats', () => {
  it('enforces the tier purchase rule', () => {
    const tesla = content.towers.get('tesla-coil')!
    expect(canPurchase(tesla, [], 'tesla-coil.2b')).toBe(true)
    expect(canPurchase(tesla, [], 'tesla-coil.u')).toBe(false)
    expect(canPurchase(tesla, ['tesla-coil.2b', 'tesla-coil.3a'], 'tesla-coil.u')).toBe(true)
  })

  it('stacks upgrades, research and prestige in order', () => {
    const cannon = content.towers.get('rivet-cannon')!
    const { stats, abilities } = computeTower(cannon, ['rivet-cannon.2b', 'rivet-cannon.3a', 'rivet-cannon.u'], [{ target: 'category:ballistic', stat: 'damage', op: 'mul', value: 1.1 }], 2, [])
    // 20 × 1.7 × 1.2 × 1.5 × 1.1 × 1.04²
    expect(stats.damage).toBeCloseTo(20 * 1.7 * 1.2 * 1.5 * 1.1 * 1.04 * 1.04, 6)
    expect(abilities.map((a) => a.kind).sort()).toEqual(['everyNth', 'splitShot'])
  })
})

describe('combat', () => {
  it('applies armour, resistances and the minimum damage floor', () => {
    const sim = new Simulation(makeConfig())
    const golem = sim.spawnEnemy(content.enemies.get('steam-golem')!, { x: 3, y: 3 }, 0, 1, false, false)!
    const hp = golem.hp
    sim.damage(golem, 10, 'ballistic', null)
    // Armour 6 leaves 4, then 10% ballistic resistance.
    expect(hp - golem.hp).toBeCloseTo(4 * 0.9, 6)
    const before = golem.hp
    sim.damage(golem, 2, 'fire', null)
    // 2 - 6 < 15% floor → 0.3, then 60% fire resistance.
    expect(before - golem.hp).toBeCloseTo(0.3 * 0.4, 6)
  })

  it('tesla wraiths ignore electricity entirely', () => {
    const sim = new Simulation(makeConfig())
    const wraith = sim.spawnEnemy(content.enemies.get('tesla-wraith')!, { x: 3, y: 3 }, 0, 1, false, false)!
    expect(sim.damage(wraith, 500, 'electric', null)).toBe(0)
  })
})

describe('simulation', () => {
  it('loses every core when undefended', () => {
    const sim = new Simulation(makeConfig({ cores: 3, waves: [wave(1, [{ count: 10 }])] }))
    sim.perform({ type: 'callWave' })
    runToEnd(sim)
    expect(sim.outcome).toBe('defeat')
    expect(sim.coresRemaining).toBe(0)
  })

  it('wins a defended level and pays bounties and clear bonuses', () => {
    const sim = new Simulation(makeConfig({ startingGold: 2000 }))
    expect(fortify(sim, 'gatling-nest', 6).length).toBe(6)
    const goldAfterBuild = sim.gold
    sim.perform({ type: 'callWave' })
    runToEnd(sim)
    expect(sim.outcome).toBe('victory')
    expect(sim.stats.kills['automaton-scout']).toBe(14)
    expect(sim.stats.wavesCleared).toBe(2)
    expect(sim.gold).toBeGreaterThan(goldAfterBuild)
  })

  it('is deterministic: replaying the action log reproduces the run exactly', () => {
    const config = makeConfig({
      startingGold: 3000,
      waves: [wave(1, [{ count: 12 }, { enemy: 'steam-golem', count: 3, delay: 2 }]), wave(2, [{ enemy: 'clockwork-swarm', count: 30, interval: 0.3 }])],
    })
    const live = new Simulation(config)
    const ids = fortify(live, 'tesla-coil', 3)
    fortify(live, 'mortar-tower', 2)
    for (let i = 0; i < 90; i++) live.tick()
    live.perform({ type: 'callWave' })
    for (let i = 0; i < 300; i++) live.tick()
    live.perform({ type: 'upgrade', id: ids[0], upgrade: 'tesla-coil.2a' })
    live.perform({ type: 'target', id: ids[1], mode: 'strong' })
    runToEnd(live)

    const replayed = replay(config, live.log)
    expect(replayed.outcome).toBe(live.outcome)
    expect(replayed.tickCount).toBe(live.tickCount)
    expect(replayed.gold).toBe(live.gold)
    expect(replayed.stats).toEqual(live.stats)
  })

  it('enforces challenge rules', () => {
    const sim = new Simulation(makeConfig({ rules: ['noSell', 'maxTowers:1', 'maxTier:2'] }))
    const [id] = fortify(sim, 'rivet-cannon', 2)
    expect(sim.towers.length).toBe(1)
    expect(sim.perform({ type: 'sell', id }).ok).toBe(false)
    expect(sim.perform({ type: 'upgrade', id, upgrade: 'rivet-cannon.2a' }).ok).toBe(true)
    expect(sim.perform({ type: 'upgrade', id, upgrade: 'rivet-cannon.3a' }).ok).toBe(false)
  })

  it('cloaked enemies cannot be targeted until revealed', () => {
    const config = makeConfig({ startingGold: 5000, waves: [wave(1, [{ enemy: 'smog-phantom', count: 3 }])] })
    const blind = new Simulation(config)
    fortify(blind, 'gatling-nest', 6)
    blind.perform({ type: 'callWave' })
    runToEnd(blind)
    expect(blind.stats.kills['smog-phantom'] ?? 0).toBe(0)

    const lit = new Simulation(config)
    fortify(lit, 'spotter-tower', 2)
    fortify(lit, 'gatling-nest', 6)
    lit.perform({ type: 'callWave' })
    runToEnd(lit)
    expect(lit.stats.kills['smog-phantom']).toBeGreaterThan(0)
  })

  it('refuses unaffordable or locked towers', () => {
    const sim = new Simulation(makeConfig({ startingGold: 50 }, { unlockedTowers: ['rivet-cannon'] }))
    const g = sim.grid
    const b = g.cellsOf('B')[0]
    expect(sim.perform({ type: 'build', tower: 'rivet-cannon', x: b % g.width, y: Math.floor(b / g.width) }).ok).toBe(false)
    expect(sim.perform({ type: 'build', tower: 'tesla-coil', x: b % g.width, y: Math.floor(b / g.width) }).ok).toBe(false)
  })
})
