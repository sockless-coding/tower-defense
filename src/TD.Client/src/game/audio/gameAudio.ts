import type { Simulation } from '../sim/simulation'
import type { SimEvent } from '../sim/types'
import { Ambience } from './ambience'
import { MusicDirector } from './music'
import { play } from './synth'

const TOWER_SOUNDS: Record<string, [sound: string, volume: number]> = {
  'rivet-cannon': ['cannon', 0.7],
  'gatling-nest': ['gatling', 0.45],
  'railgun-turret': ['rail', 0.8],
  'mortar-tower': ['mortar', 0.7],
  'flak-battery': ['flak', 0.6],
  'harpoon-launcher': ['harpoon', 0.7],
  'tesla-coil': ['zap', 0.55],
  'arc-tower': ['zap', 0.3],
  'storm-generator': ['zap', 0.6],
  'galvanic-mine-layer': ['click', 0.6],
  incinerator: ['flame', 0.6],
  'furnace-tower': ['flame', 0.8],
  'napalm-projector': ['glob', 0.6],
  'boiler-bomb': ['mortar', 0.8],
  'acid-sprayer': ['hiss', 0.5],
  'corrosion-pump': ['glob', 0.5],
  'toxic-diffuser': ['hiss', 0.6],
  'alchemical-still': ['glob', 0.6],
  'clockwork-snare': ['harpoon', 0.45],
  'steam-hammer': ['hammer', 0.8],
  'sawblade-launcher': ['saw', 0.6],
  'time-distortion-tower': ['temporal', 0.5],
  'gravity-manipulator': ['gravity', 0.4],
  'singularium-engine': ['gravity', 0.8],
  'aether-prism': ['temporal', 0.3],
  'phase-lance': ['rail', 0.7],
}

/** Translates simulation events into positioned sound effects and steers the music's intensity. */
export class GameAudio {
  private readonly music = MusicDirector.get()
  private readonly ambience = new Ambience()
  private readonly sim: Simulation
  private intensityTimer = 0
  private beamTimer = 0

  constructor(sim: Simulation) {
    this.sim = sim
    this.ambience.start(sim.config.map)
    this.music.setMode('battle')
    this.music.setIntensity(0.1)
  }

  private pan(x: number): number {
    return ((x / this.sim.grid.width) * 2 - 1) * 0.75
  }

  handle(events: SimEvent[]): void {
    const sim = this.sim
    for (const ev of events) {
      switch (ev.type) {
        case 'fire': {
          const t = sim.towers.find((x) => x.id === ev.tower)
          if (!t) break
          const [sound, volume] = TOWER_SOUNDS[t.def.id] ?? ['cannon', 0.5]
          const nth = ev.kind.endsWith('nth')
          play(nth ? 'bigExplosion' : sound, { volume: nth ? 0.5 : volume, pan: this.pan(t.pos.x), cooldown: sound === 'gatling' ? 0.05 : 0.04, maxConcurrent: 5 })
          break
        }
        case 'lightning':
          play(ev.strong ? 'thunder' : 'zap', { volume: ev.strong ? 0.5 : 0.35, pan: this.pan(ev.points[ev.points.length - 1].x), cooldown: 0.05 })
          break
        case 'impact':
          if (['lob', 'shell', 'mine', 'big', 'boiler', 'burst', 'ember', 'collapse'].includes(ev.kind)) {
            play(ev.radius >= 1.4 || ev.kind === 'big' ? 'bigExplosion' : 'explosion', { volume: 0.55, pan: this.pan(ev.pos.x), cooldown: 0.06, maxConcurrent: 4 })
          }
          break
        case 'hit':
          play('hit', { volume: 0.35, cooldown: 0.07, maxConcurrent: 3 })
          break
        case 'kill': {
          const big = ev.boss
          play(big ? 'bigExplosion' : 'deathSmall', { volume: big ? 1 : 0.45, pan: this.pan(ev.pos.x), cooldown: 0.05, maxConcurrent: 4 })
          break
        }
        case 'gold':
          if (ev.pos) play('coin', { volume: 0.5, pan: this.pan(ev.pos.x), cooldown: 0.09, maxConcurrent: 2 })
          break
        case 'coreTaken':
        case 'escape':
          if (ev.type === 'coreTaken' || ev.cores > 0) play('alarm', { bus: 'ui', volume: 0.9, cooldown: 0.8 })
          break
        case 'coreReturned':
          play('upgrade', { bus: 'ui', volume: 0.5 })
          break
        case 'waveStart':
          play('horn', { volume: 0.9, cooldown: 0.5 })
          if (ev.boss) play('gong', { volume: 0.9, delay: 0.4 })
          break
        case 'bossPhase':
          play('gong', { volume: 1, cooldown: 0.5 })
          break
        case 'built':
          play('build', { bus: 'ui', volume: 0.8 })
          break
        case 'upgraded':
          play('upgrade', { bus: 'ui', volume: 0.8 })
          break
        case 'sold':
          play('sell', { bus: 'ui', volume: 0.8 })
          break
        case 'interaction':
          play('whoosh', { volume: 0.8 })
          play('bigExplosion', { volume: 0.7, delay: 0.25, pan: this.pan(ev.pos.x) })
          break
        case 'ability':
          if (ev.kind === 'mapStrike') play('thunder', { volume: 0.45, pan: this.pan(ev.pos.x), cooldown: 0.08 })
          else if (ev.kind === 'orbital') play('rail', { volume: 1 })
          else if (ev.kind === 'singularity') play('gravity', { volume: 0.9 })
          else if (ev.kind === 'stasisField' || ev.kind === 'rewind') play('temporal', { volume: 0.7 })
          else if (ev.kind === 'periodicPulse') play('whoosh', { volume: 0.4, pan: this.pan(ev.pos.x) })
          else if (ev.kind === 'sabotage') play('alarm', { volume: 0.3, cooldown: 1 })
          else if (ev.kind === 'deflect') play('hit', { volume: 0.4, cooldown: 0.1 })
          break
        case 'mechanic':
          if (ev.kind === 'trainCrossing' && ev.active) play('thunder', { bus: 'ambience', volume: 0.6 })
          else if (ev.kind === 'gates') play('hammer', { bus: 'ambience', volume: 0.5 })
          else if (ev.kind === 'steamVents' && ev.active) play('hiss', { bus: 'ambience', volume: 1 })
          break
      }
    }
  }

  /** Called every frame: steers music intensity and voices continuous beams. */
  update(dt: number): void {
    const sim = this.sim
    this.intensityTimer -= dt
    if (this.intensityTimer <= 0) {
      this.intensityTimer = 0.5
      const boss = sim.enemies.some((e) => e.alive && e.def.isBoss)
      this.music.setMode(sim.outcome !== 'playing' ? 'off' : boss ? 'boss' : 'battle')
      const pressure = sim.waveIndex < 0 ? 0.1 : 0.35 + Math.min(0.45, sim.enemies.length / 70) + (sim.coresRemaining < sim.totalCores * 0.5 ? 0.15 : 0)
      this.music.setIntensity(pressure)
    }
    this.beamTimer -= dt
    if (this.beamTimer <= 0) {
      this.beamTimer = 0.45
      const beam = sim.towers.find((t) => t.def.attack === 'beam' && t.beamTargets.length > 0)
      if (beam) play('zap', { volume: 0.18, pan: this.pan(beam.pos.x), cooldown: 0.3 })
    }
  }

  finish(outcome: 'victory' | 'defeat'): void {
    this.music.setMode('off')
    play(outcome, { bus: 'ui', volume: 1 })
  }

  destroy(): void {
    this.ambience.stop()
    this.music.setMode('off')
  }
}
