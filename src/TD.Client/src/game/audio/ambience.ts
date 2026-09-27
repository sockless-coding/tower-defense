import type { MapDefinition } from '../../api/types'
import { AudioEngine } from './engine'
import { play } from './synth'

interface Bed {
  stop: () => void
}

/**
 * Continuous per-map soundscape: a low industrial hum everywhere, plus weather and theme beds (wind, rain, water,
 * fire crackle, electrical buzz, steam) built from filtered noise and slow LFOs.
 */
export class Ambience {
  private beds: Bed[] = []
  private timers: number[] = []
  private generation = 0

  start(map: MapDefinition): void {
    this.stop()
    const engine = AudioEngine.get()
    const ctx = engine.ensure()
    if (!ctx) {
      const generation = this.generation
      engine.onReady(() => {
        if (generation === this.generation) this.start(map)
      })
      return
    }
    const out = engine.bus('ambience')

    this.beds.push(this.hum(ctx, out))
    const w = map.weather
    if (['wind', 'snow', 'fog', 'aurora'].includes(w)) this.beds.push(this.noiseBed(ctx, out, 'bandpass', 420, 0.8, 0.07, 0.08, true))
    if (w === 'rain' || w === 'storm') this.beds.push(this.noiseBed(ctx, out, 'highpass', 1200, 0.5, 0.06, 0.3, false))
    if (['flooded', 'canal', 'tidal'].includes(map.theme)) this.beds.push(this.noiseBed(ctx, out, 'lowpass', 500, 0.7, 0.08, 0.12, true))
    if (w === 'embers' || map.theme === 'foundry' || map.theme === 'volcanic') {
      this.beds.push(this.noiseBed(ctx, out, 'lowpass', 300, 0.7, 0.07, 0.1, true))
      this.every(0.25, 0.6, () => play('coin', { bus: 'ambience', volume: 0.15, pan: Math.random() * 2 - 1, cooldown: 0 }))
    }
    if (['lightningfarm', 'laboratory', 'observatory', 'refinery'].includes(map.theme)) this.beds.push(this.buzz(ctx, out))
    if (w === 'steam' || map.theme === 'graveyard' || map.theme === 'foundry') {
      this.every(4, 9, () => play('hiss', { bus: 'ambience', volume: 0.5, pan: Math.random() * 2 - 1, cooldown: 0 }))
    }
    if (w === 'storm') this.every(6, 14, () => play('thunder', { bus: 'ambience', volume: 0.35, pan: Math.random() * 2 - 1, cooldown: 0 }))
    if (map.theme === 'railyard' || map.theme === 'city') this.every(10, 20, () => play('horn', { bus: 'ambience', volume: 0.15, pan: -0.8, cooldown: 0 }))
  }

  stop(): void {
    this.generation++
    for (const b of this.beds) b.stop()
    for (const t of this.timers) window.clearTimeout(t)
    this.beds = []
    this.timers = []
  }

  private every(min: number, max: number, fn: () => void): void {
    const schedule = () => {
      const id = window.setTimeout(() => {
        fn()
        schedule()
      }, (min + Math.random() * (max - min)) * 1000)
      this.timers.push(id)
    }
    schedule()
  }

  private hum(ctx: AudioContext, out: AudioNode): Bed {
    const g = ctx.createGain()
    g.gain.value = 0
    g.gain.setTargetAtTime(0.05, ctx.currentTime, 1.5)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 160
    const a = ctx.createOscillator()
    a.type = 'sawtooth'
    a.frequency.value = 49
    const b = ctx.createOscillator()
    b.frequency.value = 98.5
    a.connect(f)
    b.connect(f)
    f.connect(g).connect(out)
    a.start()
    b.start()
    return {
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.4)
        a.stop(ctx.currentTime + 1.5)
        b.stop(ctx.currentTime + 1.5)
      },
    }
  }

  private buzz(ctx: AudioContext, out: AudioNode): Bed {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = 60
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1800
    f.Q.value = 3
    const g = ctx.createGain()
    g.gain.value = 0
    g.gain.setTargetAtTime(0.012, ctx.currentTime, 1)
    o.connect(f).connect(g).connect(out)
    o.start()
    return {
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.3)
        o.stop(ctx.currentTime + 1.2)
      },
    }
  }

  /** Looping filtered noise with a slow LFO on its level for movement. */
  private noiseBed(ctx: AudioContext, out: AudioNode, type: BiquadFilterType, freq: number, q: number, level: number, lfoRate: number, pink: boolean): Bed {
    const engine = AudioEngine.get()
    const src = ctx.createBufferSource()
    src.buffer = pink ? engine.pinkNoise() : engine.whiteNoise()
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.value = 0
    g.gain.setTargetAtTime(level, ctx.currentTime, 2)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = lfoRate
    const depth = ctx.createGain()
    depth.gain.value = level * 0.5
    lfo.connect(depth).connect(g.gain)
    src.connect(f).connect(g).connect(out)
    src.start()
    lfo.start()
    return {
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.4)
        src.stop(ctx.currentTime + 1.5)
        lfo.stop(ctx.currentTime + 1.5)
      },
    }
  }
}
