import { Container, Sprite, TilingSprite } from 'pixi.js'
import type { TextureForge } from './forge'
import type { Lighting } from './lighting'
import { ParticleLayer } from './particles'

interface WeatherProfile {
  ambient: [number, number, number]
  fog: number
  fogTint: number
  rain?: number
  snow?: number
  ash?: number
  embers?: number
  storm?: boolean
  sunbeams?: boolean
  aurora?: boolean
  confetti?: boolean
  wind?: number
}

const PROFILES: Record<string, WeatherProfile> = {
  clear: { ambient: [0.88, 0.84, 0.8], fog: 0.05, fogTint: 0xd8c8b0 },
  ashfall: { ambient: [0.7, 0.63, 0.58], fog: 0.25, fogTint: 0x8a7a6a, ash: 1 },
  steam: { ambient: [0.7, 0.58, 0.5], fog: 0.35, fogTint: 0xe0d0c0 },
  wind: { ambient: [0.86, 0.88, 0.94], fog: 0.1, fogTint: 0xe0e8f0, wind: 1 },
  darkness: { ambient: [0.3, 0.28, 0.32], fog: 0.3, fogTint: 0x201a18 },
  rain: { ambient: [0.58, 0.63, 0.7], fog: 0.2, fogTint: 0x8090a0, rain: 1 },
  snow: { ambient: [0.82, 0.86, 0.94], fog: 0.3, fogTint: 0xf0f6ff, snow: 1 },
  aurora: { ambient: [0.48, 0.53, 0.68], fog: 0.15, fogTint: 0x70a0ff, aurora: true },
  dust: { ambient: [0.53, 0.48, 0.44], fog: 0.3, fogTint: 0x6a5a48, ash: 0.5 },
  fog: { ambient: [0.63, 0.66, 0.68], fog: 0.55, fogTint: 0xb8c0c4 },
  smoke: { ambient: [0.63, 0.58, 0.54], fog: 0.35, fogTint: 0x6a605a },
  sparks: { ambient: [0.58, 0.53, 0.68], fog: 0.15, fogTint: 0x9080c0, embers: 0.4 },
  embers: { ambient: [0.63, 0.46, 0.4], fog: 0.3, fogTint: 0x7a2a1a, embers: 1, ash: 0.4 },
  smog: { ambient: [0.58, 0.6, 0.44], fog: 0.55, fogTint: 0x8a8a40 },
  storm: { ambient: [0.44, 0.46, 0.56], fog: 0.25, fogTint: 0x505a70, rain: 1.3, storm: true },
  sunbeams: { ambient: [0.93, 0.9, 0.82], fog: 0.1, fogTint: 0xfff0d0, sunbeams: true },
  lanterns: { ambient: [0.5, 0.42, 0.38], fog: 0.15, fogTint: 0x6a4a30 },
  confetti: { ambient: [0.9, 0.86, 0.88], fog: 0.05, fogTint: 0xf0e0f0, confetti: true },
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** Screen-filling atmosphere over the battlefield, in world space so it pans and zooms with the map. */
export class Weather {
  readonly container = new Container()
  private readonly profile: WeatherProfile
  private readonly fogA: TilingSprite
  private readonly fogB: TilingSprite
  private readonly particles: ParticleLayer
  private readonly glowParticles: ParticleLayer
  private readonly beams: Sprite[] = []
  private readonly width: number
  private readonly height: number
  private readonly lighting: Lighting
  private stormTimer = 3
  intensity = 1

  constructor(forge: TextureForge, lighting: Lighting, weather: string, width: number, height: number, extraFog: number) {
    this.profile = PROFILES[weather] ?? PROFILES.clear
    this.width = width
    this.height = height
    this.lighting = lighting
    lighting.ambient = this.profile.ambient

    const fogAlpha = Math.min(0.85, this.profile.fog + extraFog * 0.5)
    this.fogA = new TilingSprite({ texture: forge.fog, width, height })
    this.fogB = new TilingSprite({ texture: forge.fog, width, height })
    for (const f of [this.fogA, this.fogB]) {
      f.tint = this.profile.fogTint
      f.alpha = fogAlpha * 0.42
    }
    this.fogB.tileScale.set(1.7)
    this.fogB.alpha = fogAlpha * 0.3

    const texture = this.profile.snow ? forge.snowflake : this.profile.confetti ? forge.shard : this.profile.rain ? forge.raindrop : forge.softDot
    this.particles = new ParticleLayer(texture, 700, 'normal')
    this.glowParticles = new ParticleLayer(forge.ember, 200, 'add')

    if (this.profile.sunbeams || this.profile.aurora) {
      for (let i = 0; i < 4; i++) {
        const beam = new Sprite(forge.beam)
        beam.anchor.set(0.5)
        beam.blendMode = 'add'
        beam.height = width * 0.3
        beam.width = height * 2.2
        beam.rotation = this.profile.aurora ? 0.1 : -0.6
        beam.position.set(width * (0.15 + i * 0.25), height * 0.5)
        beam.tint = this.profile.aurora ? [0x60ffb0, 0x60a0ff, 0xb070ff, 0x60ffe0][i] : 0xfff0c0
        beam.alpha = this.profile.aurora ? 0.12 : 0.1
        this.beams.push(beam)
      }
    }

    this.container.addChild(this.particles.container, this.glowParticles.container, ...this.beams, this.fogB, this.fogA)
  }

  update(dt: number, time: number): void {
    const p = this.profile
    const w = this.width
    const h = this.height
    const k = this.intensity
    this.fogA.tilePosition.x += dt * 14
    this.fogA.tilePosition.y += dt * 4
    this.fogB.tilePosition.x -= dt * 7
    this.fogB.tilePosition.y += dt * 2

    const spawn = (rate: number) => Math.floor(rate * dt * k + Math.random())
    if (p.rain) {
      for (let i = 0; i < spawn(260 * p.rain); i++) {
        this.particles.emit({ x: rand(-100, w), y: rand(-60, h), vx: 180, vy: 900, life: 0.35, scale: 0.9, alpha: 0.35, alphaEnd: 0.2, tint: 0xb8c8d8, stretch: 0.0012 })
      }
    }
    if (p.snow) {
      for (let i = 0; i < spawn(90); i++) {
        this.particles.emit({ x: rand(-50, w), y: rand(-40, h * 0.8), vx: rand(10, 40), vy: rand(30, 60), life: rand(3, 6), scale: rand(0.4, 1), alpha: 0.9, alphaEnd: 0.2, spin: rand(-1, 1) })
      }
    }
    if (p.ash) {
      for (let i = 0; i < spawn(35 * p.ash); i++) {
        this.particles.emit({ x: rand(0, w), y: rand(-20, h), vx: rand(5, 25), vy: rand(10, 30), life: rand(3, 6), scale: rand(0.15, 0.35), alpha: 0.6, alphaEnd: 0, tint: 0x8a8078 })
      }
    }
    if (p.embers) {
      for (let i = 0; i < spawn(25 * p.embers); i++) {
        this.glowParticles.emit({ x: rand(0, w), y: rand(h * 0.3, h + 20), vx: rand(-10, 25), vy: rand(-50, -20), drag: 0.2, life: rand(2, 4), scale: rand(0.2, 0.45), scaleEnd: 0.05, alpha: 1, tint: 0xff9a40 })
      }
    }
    if (p.confetti) {
      for (let i = 0; i < spawn(20); i++) {
        this.particles.emit({ x: rand(0, w), y: -10, vx: rand(-30, 30), vy: rand(50, 90), life: rand(4, 7), scale: rand(0.35, 0.6), alpha: 1, alphaEnd: 0.8, spin: rand(-6, 6), tint: [0xffd070, 0xff7090, 0x70c0ff, 0x90ff90][Math.floor(Math.random() * 4)] })
      }
    }
    if (p.wind) {
      for (let i = 0; i < spawn(20); i++) {
        this.particles.emit({ x: -20, y: rand(0, h), vx: rand(400, 600), vy: rand(-10, 10), life: 2.5, scale: rand(0.2, 0.4), alpha: 0.25, alphaEnd: 0, tint: 0xe0e0e0, stretch: 0.004 })
      }
    }
    if (p.storm) {
      this.stormTimer -= dt
      if (this.stormTimer <= 0) {
        this.stormTimer = rand(4, 11)
        this.lighting.lightningFlash(rand(0.4, 0.8))
      }
    }
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i]
      b.alpha = (p.aurora ? 0.1 : 0.08) + Math.sin(time * 0.4 + i * 1.7) * 0.04
      if (p.aurora) b.position.x = w * (0.15 + i * 0.25) + Math.sin(time * 0.2 + i) * 60
    }
    this.particles.update(dt)
    this.glowParticles.update(dt)
  }
}
