import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BonusEffect } from '../../api/types'
import { Simulation } from './simulation'
import { engineer, makeConfig, wave } from './testing'

/**
 * Writes a real run (config + action log + result) to tests/fixtures so the server's RunValidator can check it.
 * If the client and server ever disagree about costs, refunds, placement or rules, the C# contract test fails.
 */
describe('server contract fixture', () => {
  it('produces a run the server must accept', () => {
    const bonuses: BonusEffect[] = [
      { target: 'economy', stat: 'towerCostMul', op: 'mul', value: 0.97 },
      { target: 'economy', stat: 'upgradeCostMul', op: 'mul', value: 0.95 },
      { target: 'economy', stat: 'startingGold', op: 'add', value: 40 },
      { target: 'economy', stat: 'sellRefund', op: 'add', value: 0.05 },
      { target: 'category:electrical', stat: 'damage', op: 'mul', value: 1.05 },
    ]
    const config = makeConfig(
      {
        id: 'contract-level',
        mapId: 'industrial-city',
        startingGold: 900,
        cores: 20,
        waves: [
          wave(1, [{ count: 10 }, { enemy: 'clockwork-swarm', count: 20, interval: 0.3, delay: 2 }]),
          wave(2, [{ enemy: 'steam-golem', count: 3 }, { count: 8, delay: 1 }]),
          wave(3, [{ enemy: 'gyrocopter', count: 5 }, { enemy: 'rivet-rat', count: 6, delay: 2 }]),
        ],
      },
      { bonuses, modifiers: { ...engineer, towerCost: 1.15, economy: 1.1 }, seed: 424242 },
    )
    const sim = new Simulation(config)
    const g = sim.grid
    const core = g.center(g.core)
    const pads = g
      .cellsOf('B')
      .sort((a, b) => Math.hypot(g.center(a).x - core.x, g.center(a).y - core.y) - Math.hypot(g.center(b).x - core.x, g.center(b).y - core.y) || a - b)
    const at = (i: number) => ({ x: pads[i] % g.width, y: Math.floor(pads[i] / g.width) })

    expect(sim.perform({ type: 'build', tower: 'gatling-nest', ...at(0) }).ok).toBe(true)
    expect(sim.perform({ type: 'build', tower: 'tesla-coil', ...at(1) }).ok).toBe(true)
    expect(sim.perform({ type: 'build', tower: 'rivet-cannon', ...at(2) }).ok).toBe(true)
    for (let i = 0; i < 60; i++) sim.tick()
    expect(sim.perform({ type: 'callWave' }).ok).toBe(true)
    for (let i = 0; i < 240; i++) sim.tick()
    expect(sim.perform({ type: 'upgrade', id: 2, upgrade: 'tesla-coil.2a' }).ok).toBe(true)
    expect(sim.perform({ type: 'sell', id: 3 }).ok).toBe(true)
    expect(sim.perform({ type: 'build', tower: 'mortar-tower', ...at(3) }).ok).toBe(true)
    expect(sim.perform({ type: 'target', id: 1, mode: 'strong' }).ok).toBe(true)
    let interacted = 0
    while (sim.outcome === 'playing' && sim.tickCount < 30 * 60 * 10) {
      sim.tick()
      const e = sim.enemies[0]
      if (e && interacted < 2 && sim.time >= sim.interactionReadyAt && sim.tickCount % 97 === 0) {
        if (sim.perform({ type: 'interact', x: e.pos.x, y: e.pos.y }).ok) interacted++
      }
      if (sim.tickCount === 900) sim.perform({ type: 'upgrade', id: 1, upgrade: 'gatling-nest.2b' })
    }
    expect(sim.outcome).not.toBe('playing')

    const fixture = {
      config: {
        level: config.level,
        modifiers: config.modifiers,
        presetId: null,
        rewardMultiplier: 1,
        seed: config.seed,
        bonuses: config.bonuses,
        prestige: config.prestige,
        unlockedTowers: config.unlockedTowers,
      },
      actions: sim.log,
      result: sim.result(),
    }
    const dir = join(__dirname, '../../../../../tests/fixtures')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'client-run.json'), JSON.stringify(fixture, null, 1) + '\n')
  })
})
