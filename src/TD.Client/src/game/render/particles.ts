import { Particle, ParticleContainer, type Texture } from 'pixi.js'

export interface EmitOptions {
  x: number
  y: number
  vx?: number
  vy?: number
  ax?: number
  ay?: number
  drag?: number
  life: number
  scale?: number
  scaleEnd?: number
  alpha?: number
  alphaEnd?: number
  rotation?: number
  spin?: number
  tint?: number
  /** Stretch along velocity (sparks, rain). */
  stretch?: number
}

interface Live {
  p: Particle
  vx: number
  vy: number
  ax: number
  ay: number
  drag: number
  age: number
  life: number
  s0: number
  s1: number
  a0: number
  a1: number
  spin: number
  stretch: number
  active: boolean
}

/**
 * One batched GPU layer of particles sharing a texture and blend mode. Particles are pooled: dead ones are hidden and
 * reused, so steady-state emission allocates nothing.
 */
export class ParticleLayer {
  readonly container: ParticleContainer
  private readonly live: Live[] = []
  private readonly free: Live[] = []
  private readonly texture: Texture
  private capacity: number

  constructor(texture: Texture, capacity: number, blendMode: 'normal' | 'add' = 'normal') {
    this.texture = texture
    this.capacity = capacity
    this.container = new ParticleContainer({
      dynamicProperties: { position: true, rotation: true, color: true, vertex: true },
    })
    this.container.blendMode = blendMode
  }

  setCapacity(capacity: number): void {
    this.capacity = capacity
  }

  get count(): number {
    return this.live.length
  }

  emit(o: EmitOptions): void {
    let rec = this.free.pop()
    if (!rec) {
      if (this.live.length >= this.capacity) {
        // Recycle the oldest particle rather than dropping the effect.
        rec = this.live.shift()!
      } else {
        const p = new Particle({ texture: this.texture, anchorX: 0.5, anchorY: 0.5 })
        this.container.addParticle(p)
        rec = { p, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, age: 0, life: 1, s0: 1, s1: 1, a0: 1, a1: 0, spin: 0, stretch: 0, active: true }
      }
    }
    rec.vx = o.vx ?? 0
    rec.vy = o.vy ?? 0
    rec.ax = o.ax ?? 0
    rec.ay = o.ay ?? 0
    rec.drag = o.drag ?? 0
    rec.age = 0
    rec.life = o.life
    rec.s0 = o.scale ?? 1
    rec.s1 = o.scaleEnd ?? rec.s0
    rec.a0 = o.alpha ?? 1
    rec.a1 = o.alphaEnd ?? 0
    rec.spin = o.spin ?? 0
    rec.stretch = o.stretch ?? 0
    rec.active = true
    const p = rec.p
    p.x = o.x
    p.y = o.y
    p.rotation = o.rotation ?? 0
    p.tint = o.tint ?? 0xffffff
    p.alpha = rec.a0
    p.scaleX = p.scaleY = rec.s0
    this.live.push(rec)
  }

  update(dt: number): void {
    let write = 0
    for (let i = 0; i < this.live.length; i++) {
      const r = this.live[i]
      r.age += dt
      const p = r.p
      if (r.age >= r.life) {
        p.alpha = 0
        r.active = false
        this.free.push(r)
        continue
      }
      const k = r.age / r.life
      const damp = r.drag > 0 ? Math.exp(-r.drag * dt) : 1
      r.vx = (r.vx + r.ax * dt) * damp
      r.vy = (r.vy + r.ay * dt) * damp
      p.x += r.vx * dt
      p.y += r.vy * dt
      p.alpha = r.a0 + (r.a1 - r.a0) * k
      const s = r.s0 + (r.s1 - r.s0) * k
      if (r.stretch > 0) {
        const speed = Math.hypot(r.vx, r.vy)
        p.rotation = Math.atan2(r.vy, r.vx)
        p.scaleX = s * (1 + speed * r.stretch)
        p.scaleY = s
      } else {
        p.rotation += r.spin * dt
        p.scaleX = p.scaleY = s
      }
      this.live[write++] = r
    }
    this.live.length = write
  }

  clear(): void {
    for (const r of this.live) {
      r.p.alpha = 0
      this.free.push(r)
    }
    this.live.length = 0
  }
}
