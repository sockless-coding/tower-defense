import { Container, Graphics, Sprite } from 'pixi.js'
import type { EnemyState, TowerState } from '../sim/types'
import { enemyTextures } from './enemyArt'
import type { TextureForge } from './forge'
import { toNumber } from './paint'
import { TILE } from './terrain'
import { CATEGORY_EMISSIVE, TOWER_HEADS, towerTextures } from './towerArt'

/** A tower on the map: plinth, tracking head, emissive glow and idle machinery. */
export class TowerView {
  readonly root = new Container()
  private readonly base = new Sprite()
  private readonly head = new Sprite()
  private readonly glow: Sprite
  private readonly gear: Sprite
  private readonly pips = new Graphics()
  private tier = 0
  private aim = -Math.PI / 2
  private recoil = 0
  private pulse = 0
  readonly emissive: number
  private readonly rotates: boolean
  private readonly headKind: string
  private readonly scale: number
  private headSize = TILE
  readonly tower: TowerState

  constructor(tower: TowerState, forge: TextureForge, scale: number) {
    this.tower = tower
    this.scale = scale
    this.emissive = toNumber(CATEGORY_EMISSIVE[tower.def.category])
    this.rotates = TOWER_HEADS[tower.def.id]?.rotates ?? true
    this.headKind = TOWER_HEADS[tower.def.id]?.head ?? 'cannon'
    this.glow = new Sprite(forge.glow)
    this.gear = new Sprite(forge.ring)
    for (const s of [this.base, this.head, this.glow, this.gear]) s.anchor.set(0.5)
    this.glow.blendMode = 'add'
    this.glow.tint = this.emissive
    this.gear.visible = false
    this.root.addChild(this.base, this.glow, this.head, this.pips)
    this.root.position.set(tower.pos.x * TILE, tower.pos.y * TILE)
    this.refreshArt()
  }

  refreshArt(): void {
    if (this.tier === this.tower.level) return
    this.tier = this.tower.level
    const tex = towerTextures(this.tower.def, this.tier, this.scale)
    const size = tex.size * TILE * 1.12
    this.base.texture = tex.base
    this.head.texture = tex.head
    this.base.width = this.base.height = size
    this.head.width = this.head.height = size
    this.headSize = size
    this.glow.width = this.glow.height = TILE * (this.tier >= 4 ? 1.6 : 1.1)
    this.pips.clear()
    for (let i = 0; i < this.tier; i++) {
      const x = -TILE * 0.3 + i * TILE * 0.2
      this.pips.circle(x, TILE * 0.42, TILE * 0.05).fill({ color: i === 3 ? this.emissive : 0xf6d98a }).stroke({ width: 1.5, color: 0x2a1808 })
    }
  }

  kick(): void {
    this.recoil = 1
    this.pulse = 1
  }

  update(dt: number, time: number, stunned: boolean, overcharged: boolean): void {
    this.refreshArt()
    const target = this.tower.aim
    if (this.rotates) {
      let diff = target - this.aim
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      this.aim += diff * Math.min(1, dt * 14)
      this.head.rotation = this.aim
      this.head.position.set(-Math.cos(this.aim) * this.recoil * 6, -Math.sin(this.aim) * this.recoil * 6)
    } else {
      // Non-tracking machines animate in place.
      switch (this.headKind) {
        case 'clock':
        case 'orb':
        case 'forge':
        case 'mast':
          this.head.rotation += dt * (this.headKind === 'forge' ? 0.8 : 0.4)
          break
        case 'dome':
          this.head.rotation += dt * 0.25
          break
        case 'hammer':
          this.head.width = this.head.height = this.headSize * (1 + this.recoil * 0.12)
          break
        default:
          this.head.rotation = Math.sin(time * 0.5) * 0.05
      }
    }
    if (this.headKind === 'saw' || this.headKind === 'gatling') this.head.rotation = this.aim
    this.recoil = Math.max(0, this.recoil - dt * 8)
    this.pulse = Math.max(0, this.pulse - dt * 4)
    const idle = 0.35 + Math.sin(time * 3 + this.tower.id) * 0.1
    this.glow.alpha = stunned ? 0.05 : Math.min(1, idle + this.pulse * 0.6 + (overcharged ? 0.4 : 0) + (this.tier >= 4 ? 0.25 : 0))
    this.root.alpha = stunned ? 0.75 : 1
    this.base.tint = stunned ? 0x8a8aa0 : 0xffffff
  }

  destroy(): void {
    this.root.destroy({ children: true })
  }
}

/** An enemy: body facing its heading, spinning parts, status visuals, shield and carried cores. */
export class EnemyView {
  readonly root = new Container()
  private readonly body: Sprite
  private readonly spinner: Sprite | null
  private readonly aura: Sprite
  private readonly shield: Sprite
  private readonly core: Sprite
  private readonly bar = new Graphics()
  private heading = 0
  private flash = 0
  readonly size: number
  readonly enemy: EnemyState

  constructor(enemy: EnemyState, forge: TextureForge, scale: number) {
    this.enemy = enemy
    const tex = enemyTextures(enemy.def, scale)
    const px = tex.size * TILE
    this.size = enemy.def.size
    this.body = new Sprite(tex.body)
    this.body.anchor.set(0.5)
    this.body.width = this.body.height = px
    this.spinner = tex.spinner ? new Sprite(tex.spinner) : null
    if (this.spinner) {
      this.spinner.anchor.set(0.5)
      this.spinner.width = this.spinner.height = px
    }
    this.aura = new Sprite(forge.glow)
    this.aura.anchor.set(0.5)
    this.aura.blendMode = 'add'
    this.aura.width = this.aura.height = enemy.def.size * TILE * 3.2
    this.aura.tint = enemy.elite ? 0xffc040 : enemy.def.isBoss ? 0xff4020 : 0xffffff
    this.aura.visible = enemy.elite || enemy.def.isBoss
    this.shield = new Sprite(forge.ring)
    this.shield.anchor.set(0.5)
    this.shield.tint = 0x6ab0ff
    this.shield.blendMode = 'add'
    this.shield.width = this.shield.height = enemy.def.size * TILE * 2.8
    this.shield.visible = false
    this.core = new Sprite(forge.core)
    this.core.anchor.set(0.5)
    this.core.width = this.core.height = TILE * 0.34
    this.core.visible = false
    this.root.addChild(this.aura, this.body)
    if (this.spinner) this.root.addChild(this.spinner)
    this.root.addChild(this.shield, this.core, this.bar)
    this.heading = enemy.heading
  }

  hit(): void {
    this.flash = 1
  }

  update(dt: number, time: number, alpha: number, now: number): void {
    const e = this.enemy
    const x = (e.prev.x + (e.pos.x - e.prev.x) * alpha) * TILE
    const y = (e.prev.y + (e.pos.y - e.prev.y) * alpha) * TILE
    const bob = e.air ? Math.sin(time * 2 + e.id) * 3 : Math.abs(Math.sin(time * 9 * e.speed + e.id)) * 1.5
    this.root.position.set(x, y - (e.air ? 10 + bob : bob))

    let diff = e.heading - this.heading
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    this.heading += diff * Math.min(1, dt * 10)
    this.body.rotation = this.heading
    if (this.spinner) {
      this.spinner.rotation += dt * (e.def.id === 'grand-orrery' ? 0.6 : e.def.id === 'magnet-drone' ? 2 : 30)
      if (e.def.id !== 'grand-orrery') this.spinner.rotation = e.def.id === 'magnet-drone' ? this.heading : this.spinner.rotation
    }

    const s = e.status
    const stunned = s.stunUntil > now
    const frozen = s.stasisUntil > now
    const burning = s.burnUntil > now
    const poisoned = s.poisonUntil > now
    const slowed = s.slowUntil > now
    let tint = 0xffffff
    if (frozen) tint = 0xb8a0ff
    else if (slowed) tint = 0xa8d8ff
    if (burning) tint = mix(tint, 0xffa060, 0.5 + Math.sin(time * 20) * 0.2)
    if (poisoned) tint = mix(tint, 0xb0ff80, 0.4)
    if (s.corrode > 0) tint = mix(tint, 0xc08050, Math.min(0.4, s.corrode * 0.03))
    if (this.flash > 0) tint = mix(tint, 0xffffff, this.flash)
    this.body.tint = tint
    this.flash = Math.max(0, this.flash - dt * 8)

    const cloaked = e.cloaked && e.revealedUntil <= now
    const burrowed = e.burrowedUntil > now
    const phased = e.phasedUntil > now
    this.root.alpha = burrowed ? 0.25 : cloaked ? 0.18 : phased ? 0.35 + Math.sin(time * 30) * 0.15 : 1
    this.body.scale.y = Math.abs(this.body.scale.y) * (stunned ? 0.94 : 1) * Math.sign(this.body.scale.y || 1)

    this.shield.visible = e.shield > 0
    this.shield.alpha = 0.35 + Math.sin(time * 6) * 0.1
    this.aura.alpha = 0.5 + Math.sin(time * 4) * 0.15
    this.core.visible = e.carrying > 0
    this.core.position.set(0, -e.def.size * TILE * 1.1)
    this.core.alpha = 0.8 + Math.sin(time * 8) * 0.2

    this.bar.clear()
    if (e.hp < e.maxHp && !e.def.isBoss && !cloaked) {
      const w = Math.max(22, e.def.size * TILE * 1.6)
      const top = -e.def.size * TILE * 1.25 - 6
      const k = Math.max(0, e.hp / e.maxHp)
      this.bar.rect(-w / 2 - 1, top - 1, w + 2, 6).fill({ color: 0x120a06, alpha: 0.85 })
      this.bar.rect(-w / 2, top, w * k, 4).fill({ color: k > 0.5 ? 0x8ad060 : k > 0.25 ? 0xe0b040 : 0xe0503a })
      if (e.shield > 0) this.bar.rect(-w / 2, top - 3, Math.min(w, (e.shield / e.maxHp) * w * 4), 2).fill({ color: 0x6ab0ff })
    }
  }

  destroy(): void {
    this.root.destroy({ children: true })
  }
}

function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t))
  const r = ((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k
  const g = ((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k
  const bl = (a & 255) * (1 - k) + (b & 255) * k
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl)
}
