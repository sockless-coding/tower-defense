import { Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js'
import type { DamageType } from '../../api/types'
import type { TextureForge } from './forge'
import type { Lighting } from './lighting'
import { ParticleLayer } from './particles'
import { TILE } from './terrain'

export const DAMAGE_COLORS: Record<DamageType, number> = {
  ballistic: 0xffc070,
  electric: 0x8fdcff,
  fire: 0xff8a3a,
  chemical: 0xa6e05a,
  force: 0xe8d8c0,
  temporal: 0xc0a0ff,
}

interface Bolt {
  points: { x: number; y: number }[]
  life: number
  age: number
  color: number
  width: number
}

interface Ring {
  sprite: Sprite
  age: number
  life: number
  from: number
  to: number
}

interface Floater {
  text: Text
  age: number
  vy: number
  active: boolean
}

export interface EffectBudget {
  particles: number
  damageNumbers: boolean
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/**
 * All transient visual effects. Purely cosmetic randomness (Math.random) is fine here: nothing feeds back into the
 * deterministic simulation.
 */
export class Effects {
  readonly under = new Container()
  readonly over = new Container()
  readonly smoke: ParticleLayer
  readonly glow: ParticleLayer
  readonly sparks: ParticleLayer
  readonly embers: ParticleLayer
  readonly shards: ParticleLayer
  readonly bubbles: ParticleLayer
  private readonly bolts: Bolt[] = []
  private readonly boltGfx = new Graphics()
  readonly beamGfx = new Graphics()
  private readonly rings: Ring[] = []
  private readonly floaters: Floater[] = []
  private readonly floaterStyle: TextStyle
  private readonly forge: TextureForge
  private readonly lighting: Lighting
  budget: EffectBudget

  constructor(forge: TextureForge, lighting: Lighting, budget: EffectBudget) {
    this.forge = forge
    this.lighting = lighting
    this.budget = budget
    const n = budget.particles
    this.smoke = new ParticleLayer(forge.smoke, Math.round(n * 0.35), 'normal')
    this.shards = new ParticleLayer(forge.shard, Math.round(n * 0.1), 'normal')
    this.bubbles = new ParticleLayer(forge.bubble, Math.round(n * 0.08), 'normal')
    this.glow = new ParticleLayer(forge.glow, Math.round(n * 0.25), 'add')
    this.sparks = new ParticleLayer(forge.spark, Math.round(n * 0.3), 'add')
    this.embers = new ParticleLayer(forge.ember, Math.round(n * 0.2), 'add')
    this.under.addChild(this.smoke.container)
    this.over.addChild(this.shards.container, this.bubbles.container, this.glow.container, this.sparks.container, this.embers.container)
    this.boltGfx.blendMode = 'add'
    this.beamGfx.blendMode = 'add'
    this.over.addChild(this.beamGfx, this.boltGfx)
    this.floaterStyle = new TextStyle({
      fontFamily: 'Cinzel, Georgia, serif',
      fontWeight: '700',
      fontSize: 22,
      fill: '#ffffff',
      stroke: { color: '#1a0e06', width: 4 },
    })
  }

  setBudget(budget: EffectBudget): void {
    this.budget = budget
    const n = budget.particles
    this.smoke.setCapacity(Math.round(n * 0.35))
    this.glow.setCapacity(Math.round(n * 0.25))
    this.sparks.setCapacity(Math.round(n * 0.3))
    this.embers.setCapacity(Math.round(n * 0.2))
  }

  // ------------------------------------------------------------------------------------------------ Emitters

  muzzle(x: number, y: number, angle: number, color: number, size = 1): void {
    const mx = x + Math.cos(angle) * TILE * 0.45
    const my = y + Math.sin(angle) * TILE * 0.45
    this.glow.emit({ x: mx, y: my, life: 0.09, scale: 0.55 * size, scaleEnd: 0.25 * size, alpha: 1, tint: color })
    for (let i = 0; i < 4; i++) {
      const a = angle + rand(-0.35, 0.35)
      const s = rand(180, 420)
      this.sparks.emit({ x: mx, y: my, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 6, life: rand(0.08, 0.18), scale: 0.35 * size, alpha: 1, tint: color, stretch: 0.004 })
    }
    this.smoke.emit({ x: mx, y: my, vx: Math.cos(angle) * 30, vy: Math.sin(angle) * 30 - 10, drag: 2, life: 0.6, scale: 0.15 * size, scaleEnd: 0.45 * size, alpha: 0.35, tint: 0x9a9088, spin: rand(-1, 1) })
    this.lighting.flash(mx, my, TILE * 1.6 * size, color, 0.08)
  }

  impact(x: number, y: number, radius: number, type: DamageType, kind: string): void {
    const color = DAMAGE_COLORS[type]
    const r = Math.max(0.35, radius) * TILE
    const big = kind === 'big' || kind === 'boiler' || kind === 'pulse-nth' || radius >= 1.2
    if (kind === 'pulse' || kind === 'pulse-nth') {
      this.ring(x, y, r * 0.3, r, color, 0.35)
      this.glow.emit({ x, y, life: 0.2, scale: r / 64, scaleEnd: r / 40, alpha: 0.5, tint: color })
      this.lighting.flash(x, y, r * 1.4, color, 0.15)
      return
    }
    if (kind === 'mine' || kind === 'lob' || kind === 'big' || kind === 'boiler' || kind === 'shell' || kind === 'burst' || kind === 'ember' || kind === 'collapse') {
      this.explosion(x, y, r, color, big)
      return
    }
    // Small hit puffs.
    this.glow.emit({ x, y, life: 0.12, scale: 0.35, scaleEnd: 0.15, alpha: 0.9, tint: color })
    for (let i = 0; i < 3; i++) {
      const a = rand(0, Math.PI * 2)
      this.sparks.emit({ x, y, vx: Math.cos(a) * rand(80, 200), vy: Math.sin(a) * rand(80, 200), drag: 8, life: 0.15, scale: 0.3, tint: color, stretch: 0.004 })
    }
  }

  explosion(x: number, y: number, r: number, color: number, big: boolean): void {
    const scale = r / TILE
    this.glow.emit({ x, y, life: 0.25, scale: scale * 1.6, scaleEnd: scale * 2.4, alpha: 1, tint: 0xfff0c0 })
    this.glow.emit({ x, y, life: 0.45, scale: scale * 1.2, scaleEnd: scale * 2.8, alpha: 0.7, tint: color })
    const n = big ? 22 : 10
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2)
      const s = rand(120, 420) * Math.sqrt(scale)
      this.sparks.emit({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, ay: 120, drag: 3, life: rand(0.25, 0.6), scale: rand(0.3, 0.55), tint: i % 3 === 0 ? 0xffffff : color, stretch: 0.003 })
    }
    for (let i = 0; i < (big ? 10 : 5); i++) {
      const a = rand(0, Math.PI * 2)
      this.smoke.emit({
        x: x + Math.cos(a) * r * 0.3,
        y: y + Math.sin(a) * r * 0.3,
        vx: Math.cos(a) * rand(20, 60),
        vy: Math.sin(a) * rand(20, 60) - 20,
        drag: 1.5,
        life: rand(0.9, 1.8),
        scale: scale * 0.5,
        scaleEnd: scale * rand(1.1, 1.6),
        alpha: 0.55,
        tint: 0x4a403a,
        spin: rand(-0.8, 0.8),
      })
    }
    if (big) {
      for (let i = 0; i < 8; i++) {
        const a = rand(0, Math.PI * 2)
        this.shards.emit({ x, y, vx: Math.cos(a) * rand(150, 320), vy: Math.sin(a) * rand(150, 320), ay: 380, drag: 1, life: rand(0.4, 0.8), scale: rand(0.35, 0.6), spin: rand(-12, 12), tint: 0x6a5a48, alpha: 1, alphaEnd: 0.6 })
      }
    }
    this.ring(x, y, r * 0.2, r * (big ? 1.6 : 1.1), 0xffe0b0, big ? 0.45 : 0.3)
    this.lighting.flash(x, y, r * 3, color, big ? 0.35 : 0.2)
  }

  ring(x: number, y: number, from: number, to: number, color: number, life: number): void {
    const sprite = new Sprite(this.forge.ring)
    sprite.anchor.set(0.5)
    sprite.position.set(x, y)
    sprite.tint = color
    sprite.blendMode = 'add'
    this.over.addChild(sprite)
    this.rings.push({ sprite, age: 0, life, from, to })
  }

  lightning(points: { x: number; y: number }[], color = 0xbfe8ff, strong = false): void {
    if (points.length < 2) return
    const jagged: { x: number; y: number }[] = [points[0]]
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]
      const b = points[i]
      const segments = Math.max(3, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 14))
      for (let s = 1; s <= segments; s++) {
        const t = s / segments
        const jitter = s === segments ? 0 : rand(-1, 1) * 10
        const nx = -(b.y - a.y)
        const ny = b.x - a.x
        const len = Math.hypot(nx, ny) || 1
        jagged.push({ x: a.x + (b.x - a.x) * t + (nx / len) * jitter, y: a.y + (b.y - a.y) * t + (ny / len) * jitter })
      }
      this.glow.emit({ x: b.x, y: b.y, life: 0.15, scale: strong ? 0.7 : 0.45, scaleEnd: 0.2, tint: color })
    }
    this.bolts.push({ points: jagged, life: strong ? 0.22 : 0.14, age: 0, color, width: strong ? 5 : 3 })
    const last = points[points.length - 1]
    this.lighting.flash(last.x, last.y, TILE * (strong ? 3 : 1.8), color, 0.12)
  }

  rail(from: { x: number; y: number }, to: { x: number; y: number }, color = 0x8fdcff): void {
    this.bolts.push({ points: [from, to], life: 0.25, age: 0, color, width: 6 })
    const steps = 10
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      this.glow.emit({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, life: 0.3, scale: 0.35, scaleEnd: 0.1, alpha: 0.7, tint: color })
    }
    this.lighting.flash(from.x, from.y, TILE * 2.5, color, 0.12)
  }

  /** Flamethrower / acid spray cone. */
  cone(x: number, y: number, angle: number, range: number, spreadDeg: number, type: DamageType): void {
    const color = DAMAGE_COLORS[type]
    const half = (spreadDeg * Math.PI) / 360
    const n = type === 'fire' ? 9 : 6
    for (let i = 0; i < n; i++) {
      const a = angle + rand(-half, half)
      const s = range * TILE * rand(1.6, 2.4)
      const layer = type === 'fire' ? this.embers : this.glow
      layer.emit({ x: x + Math.cos(angle) * 20, y: y + Math.sin(angle) * 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 3.5, life: rand(0.3, 0.45), scale: rand(0.6, 1.1), scaleEnd: rand(1.6, 2.4), alpha: 0.85, tint: type === 'fire' ? (i % 2 ? 0xffc050 : 0xff5a1a) : color })
    }
    if (type === 'fire') {
      this.smoke.emit({ x: x + Math.cos(angle) * range * TILE * 0.8, y: y + Math.sin(angle) * range * TILE * 0.8, vy: -25, drag: 1, life: 1.2, scale: 0.3, scaleEnd: 0.9, alpha: 0.3, tint: 0x3a302a })
    }
    this.lighting.flash(x + Math.cos(angle) * range * TILE * 0.5, y + Math.sin(angle) * range * TILE * 0.5, range * TILE * 1.4, color, 0.1)
  }

  steam(x: number, y: number, amount = 1, tint = 0xd8d4d0): void {
    for (let i = 0; i < Math.ceil(3 * amount); i++) {
      this.smoke.emit({ x: x + rand(-8, 8), y: y + rand(-8, 8), vx: rand(-15, 15), vy: rand(-60, -30), drag: 0.8, life: rand(1, 2), scale: 0.15, scaleEnd: rand(0.5, 0.9), alpha: 0.3, tint, spin: rand(-0.6, 0.6) })
    }
  }

  emberRise(x: number, y: number): void {
    this.embers.emit({ x: x + rand(-10, 10), y, vx: rand(-15, 15), vy: rand(-70, -40), drag: 0.5, life: rand(0.8, 1.6), scale: rand(0.25, 0.45), scaleEnd: 0.05, alpha: 1, tint: 0xffa040 })
  }

  bubble(x: number, y: number, tint: number): void {
    this.bubbles.emit({ x: x + rand(-8, 8), y: y + rand(-8, 8), vy: rand(-25, -10), life: rand(0.6, 1.2), scale: rand(0.3, 0.6), scaleEnd: 0.8, alpha: 0.8, tint })
  }

  spark(x: number, y: number, color: number): void {
    const a = rand(0, Math.PI * 2)
    this.sparks.emit({ x, y, vx: Math.cos(a) * rand(40, 140), vy: Math.sin(a) * rand(40, 140), drag: 5, life: rand(0.1, 0.25), scale: 0.3, tint: color, stretch: 0.004 })
  }

  damageNumber(x: number, y: number, amount: number, color: number, crit: boolean): void {
    if (!this.budget.damageNumbers || amount < 1) return
    let f = this.floaters.find((x) => !x.active)
    if (!f) {
      if (this.floaters.length >= 60) return
      f = { text: new Text({ text: '', style: this.floaterStyle }), age: 0, vy: 0, active: false }
      f.text.anchor.set(0.5)
      this.over.addChild(f.text)
      this.floaters.push(f)
    }
    f.active = true
    f.age = 0
    f.vy = crit ? -70 : -50
    f.text.text = crit ? `${Math.round(amount)}!` : String(Math.round(amount))
    f.text.tint = color
    f.text.scale.set(crit ? 1.1 : 0.72)
    f.text.position.set(x + rand(-10, 10), y - 18)
    f.text.visible = true
    f.text.alpha = 1
  }

  // ------------------------------------------------------------------------------------------------ Update

  update(dt: number): void {
    this.smoke.update(dt)
    this.glow.update(dt)
    this.sparks.update(dt)
    this.embers.update(dt)
    this.shards.update(dt)
    this.bubbles.update(dt)

    this.boltGfx.clear()
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      b.age += dt
      if (b.age >= b.life) {
        this.bolts.splice(i, 1)
        continue
      }
      const alpha = 1 - b.age / b.life
      this.boltGfx.moveTo(b.points[0].x, b.points[0].y)
      for (let k = 1; k < b.points.length; k++) this.boltGfx.lineTo(b.points[k].x, b.points[k].y)
      this.boltGfx.stroke({ width: b.width * 3, color: b.color, alpha: alpha * 0.25, join: 'round', cap: 'round' })
      this.boltGfx.moveTo(b.points[0].x, b.points[0].y)
      for (let k = 1; k < b.points.length; k++) this.boltGfx.lineTo(b.points[k].x, b.points[k].y)
      this.boltGfx.stroke({ width: b.width, color: 0xffffff, alpha, join: 'round', cap: 'round' })
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]
      r.age += dt
      const k = r.age / r.life
      if (k >= 1) {
        r.sprite.destroy()
        this.rings.splice(i, 1)
        continue
      }
      const size = r.from + (r.to - r.from) * (1 - (1 - k) ** 3)
      r.sprite.width = r.sprite.height = size * 2
      r.sprite.alpha = 1 - k
    }

    for (const f of this.floaters) {
      if (!f.active) continue
      f.age += dt
      f.text.y += f.vy * dt
      f.vy *= 0.94
      f.text.alpha = Math.max(0, 1 - f.age / 0.9)
      if (f.age > 0.9) {
        f.active = false
        f.text.visible = false
      }
    }
  }

  /** Continuous beams (arc towers, prisms) are redrawn every frame from tower state. */
  beam(from: { x: number; y: number }, to: { x: number; y: number }, color: number, width: number, t: number): void {
    const wobble = Math.sin(t * 40) * 1.5
    this.beamGfx.moveTo(from.x, from.y).lineTo(to.x + wobble, to.y - wobble)
    this.beamGfx.stroke({ width: width * 3.5, color, alpha: 0.22, cap: 'round' })
    this.beamGfx.moveTo(from.x, from.y).lineTo(to.x, to.y)
    this.beamGfx.stroke({ width: width * 1.4, color, alpha: 0.7, cap: 'round' })
    this.beamGfx.moveTo(from.x, from.y).lineTo(to.x, to.y)
    this.beamGfx.stroke({ width: width * 0.5, color: 0xffffff, alpha: 0.95, cap: 'round' })
  }

  clearAll(): void {
    this.smoke.clear()
    this.glow.clear()
    this.sparks.clear()
    this.embers.clear()
    this.shards.clear()
    this.bubbles.clear()
    this.bolts.length = 0
  }
}
