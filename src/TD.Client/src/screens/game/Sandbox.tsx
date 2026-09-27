import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLoadedContent, type Content } from '../../api/content'
import type { SessionStart } from '../../api/sessions'
import type { LevelDefinition, WaveDefinition } from '../../api/types'
import { GameController } from '../../game/GameController'
import { useHud } from '../../state/game'
import { useSettings } from '../../state/settings'
import { BossBar, BuildBar, InteractionButton, TopBar, Toasts, TowerPanel } from './Hud'
import './game.css'

/**
 * Development-only visual test bench (never routed in production builds): any map, every tower pre-built at a chosen
 * tier, a mixed assault including bosses. Runs fully offline — nothing is submitted.
 */
export function Sandbox() {
  const [params] = useSearchParams()
  const content = useLoadedContent()
  const settings = useSettings((s) => s.settings)
  const host = useRef<HTMLDivElement>(null)
  const [game, setGame] = useState<GameController | null>(null)
  const ready = useHud((s) => s.ready)
  const mapId = params.get('map') ?? 'industrial-city'
  const tier = Number(params.get('tier') ?? '4')
  const towerFilter = params.get('towers')

  useEffect(() => {
    if (!host.current) return
    let controller: GameController | null = null
    let cancelled = false
    ;(async () => {
      const session = sandboxSession(content, mapId)
      controller = await GameController.create({ parent: host.current!, session, content, settings, features: ['feature.speed2x', 'feature.speed3x'], offline: true })
      if (cancelled) return controller.destroy()
      const sim = controller.sim
      const g = sim.grid
      const towers = towerFilter ? towerFilter.split(',') : [...content.towers.keys()]
      const pads = g.cellsOf('B')
      pads.forEach((cell, i) => {
        const id = towers[i % towers.length]
        const def = content.towers.get(id)
        if (!def) return
        if (!sim.perform({ type: 'build', tower: id, x: cell % g.width, y: Math.floor(cell / g.width) }).ok) return
        const built = sim.towers[sim.towers.length - 1]
        const path = i % 2 === 0 ? ['2a', '3a', 'u'] : ['2b', '3b', 'u']
        for (const key of path.slice(0, Math.max(0, tier - 1))) sim.perform({ type: 'upgrade', id: built.id, upgrade: `${id}.${key}` })
      })
      sim.perform({ type: 'callWave' })
      setGame(controller)
    })()
    return () => {
      cancelled = true
      controller?.destroy()
    }
  }, [mapId, tier, towerFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="game-screen">
      <div className="game-host" ref={host} />
      {game && ready && (
        <>
          <TopBar game={game} onMenu={() => game.togglePause()} />
          <BossBar />
          <Toasts />
          <BuildBar game={game} content={content} />
          <TowerPanel game={game} content={content} />
          <InteractionButton game={game} />
        </>
      )}
    </div>
  )
}

function sandboxSession(content: Content, mapId: string): SessionStart {
  const enemies = ['automaton-scout', 'clockwork-swarm', 'steam-golem', 'gyrocopter', 'smog-phantom', 'shield-bearer', 'tesla-wraith', 'zeppelin-carrier', 'brass-juggernaut', 'vapor-djinn', 'copper-centipede', 'aether-leech']
  const waves: WaveDefinition[] = [
    { number: 1, clearBonus: 20, groups: enemies.map((enemy, i) => ({ enemy, count: 4, interval: 0.9, spawn: i % 2, delay: i * 1.2, elite: i % 5 === 0, hpMul: 3 })) },
    { number: 2, clearBonus: 20, groups: [{ enemy: 'pressure-titan', count: 1, interval: 1, spawn: 0, delay: 0, elite: false, hpMul: 1 }, { enemy: 'grand-orrery', count: 1, interval: 1, spawn: 1, delay: 3, elite: false, hpMul: 0.3 }] },
  ]
  const map = content.maps.get(mapId)!
  const spawns = map.grid.join('').split('').filter((c) => c === 'S').length
  const level: LevelDefinition = {
    id: `sandbox-${mapId}`,
    mode: 'challenge',
    number: 50,
    mapId,
    name: `Sandbox · ${map.name}`,
    briefing: '',
    variant: 3,
    activeSpawns: Array.from({ length: spawns }, (_, i) => i),
    startingGold: 999999,
    cores: 50,
    mechanicIntensity: 1.25,
    waves,
    bossId: null,
    unlocksTowers: [],
    allowedTowers: null,
    rules: [],
  }
  return {
    sessionId: 'sandbox',
    token: '',
    contentVersion: content.bundle.version,
    config: {
      level,
      modifiers: content.bundle.difficulty.presets[1].modifiers,
      presetId: 'engineer',
      rewardMultiplier: 1,
      seed: 7,
      bonuses: [],
      prestige: {},
      unlockedTowers: [...content.towers.keys()],
    },
  }
}
