import { Container, type Renderer, RenderTexture, Sprite } from 'pixi.js'
import type { TextureForge } from './forge'
import type { LightSpec } from './terrain'

interface Flash {
  sprite: Sprite
  age: number
  life: number
  intensity: number
}

/**
 * Dynamic lighting: every frame the light scene (ambient + light sprites) is rendered into a low-resolution texture
 * that is multiplied over the world. Static lamps flicker, towers and projectiles glow, explosions flash.
 */
export class Lighting {
  readonly output: Sprite
  private readonly scene = new Container()
  private readonly staticLights = new Container()
  private readonly dynamic = new Container()
  private readonly target: RenderTexture
  private readonly flashes: Flash[] = []
  private readonly lamps: { sprite: Sprite; base: number; flicker: number; phase: number }[] = []
  private readonly pool: Sprite[] = []
  private used = 0
  private readonly forge: TextureForge
  ambient: [number, number, number] = [0.55, 0.52, 0.58]
  /** Brief global brightening (lightning storms). */
  private globalFlash = 0
  enabled = true

  constructor(forge: TextureForge, width: number, height: number, resolution: number) {
    this.forge = forge
    this.target = RenderTexture.create({ width, height, resolution })
    this.output = new Sprite(this.target)
    this.output.blendMode = 'multiply'
    this.scene.addChild(this.staticLights, this.dynamic)
    this.staticLights.blendMode = 'add'
    this.dynamic.blendMode = 'add'
  }

  setStatic(lights: LightSpec[]): void {
    this.staticLights.removeChildren()
    this.lamps.length = 0
    for (const l of lights) {
      const s = new Sprite(this.forge.light)
      s.anchor.set(0.5)
      s.position.set(l.x, l.y)
      s.width = s.height = l.radius * 2
      s.tint = l.color
      s.blendMode = 'add'
      this.staticLights.addChild(s)
      this.lamps.push({ sprite: s, base: 0.85, flicker: l.flicker, phase: Math.random() * 10 })
    }
  }

  /** Per-frame light (tower glow, projectile, burning ground). Call between beginFrame and render. */
  light(x: number, y: number, radius: number, color: number, intensity = 1): void {
    let s = this.pool[this.used]
    if (!s) {
      s = new Sprite(this.forge.light)
      s.anchor.set(0.5)
      s.blendMode = 'add'
      this.pool.push(s)
      this.dynamic.addChild(s)
    }
    this.used++
    s.visible = true
    s.position.set(x, y)
    s.width = s.height = radius * 2
    s.tint = color
    s.alpha = Math.min(1, intensity)
  }

  flash(x: number, y: number, radius: number, color: number, life: number, intensity = 1): void {
    const s = new Sprite(this.forge.light)
    s.anchor.set(0.5)
    s.position.set(x, y)
    s.width = s.height = radius * 2
    s.tint = color
    s.blendMode = 'add'
    this.scene.addChild(s)
    this.flashes.push({ sprite: s, age: 0, life, intensity })
  }

  lightningFlash(strength = 0.6): void {
    this.globalFlash = Math.max(this.globalFlash, strength)
  }

  beginFrame(): void {
    this.used = 0
  }

  render(renderer: Renderer, dt: number, time: number): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false
    for (const lamp of this.lamps) {
      lamp.sprite.alpha = lamp.base * (1 - lamp.flicker * 0.5 + lamp.flicker * 0.5 * Math.sin(time * 7 + lamp.phase) * Math.sin(time * 13.3 + lamp.phase * 2))
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]
      f.age += dt
      if (f.age >= f.life) {
        f.sprite.destroy()
        this.flashes.splice(i, 1)
        continue
      }
      f.sprite.alpha = f.intensity * (1 - f.age / f.life)
    }
    this.globalFlash = Math.max(0, this.globalFlash - dt * 2.5)
    const [r, g, b] = this.ambient.map((c) => Math.min(1, c + this.globalFlash)) as [number, number, number]
    if (!this.enabled) {
      this.output.visible = false
      return
    }
    this.output.visible = true
    renderer.render({ container: this.scene, target: this.target, clear: true, clearColor: [r, g, b, 1] })
  }

  destroy(): void {
    this.target.destroy(true)
    this.scene.destroy({ children: true })
  }
}
