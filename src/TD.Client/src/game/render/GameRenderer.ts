import 'pixi.js/unsafe-eval'
import { AdvancedBloomFilter } from 'pixi-filters'
import { Application, Container, Graphics, Sprite, Text, TextStyle, Texture, TilingSprite } from 'pixi.js'
import type { TowerDefinition } from '../../api/types'
import type { Simulation } from '../sim/simulation'
import { gateLetter } from '../../lib/labels'
import type { FlowField } from '../sim/grid'
import type { SimEvent, Vec } from '../sim/types'
import { DAMAGE_COLORS, Effects } from './effects'
import { TextureForge } from './forge'
import { Lighting } from './lighting'
import { makeCanvas, toNumber } from './paint'
import { type QualityProfile } from './quality'
import { bakeTerrain, TILE } from './terrain'
import { CATEGORY_EMISSIVE } from './towerArt'
import { EnemyView, TowerView } from './views'
import { Weather } from './weather'

export interface GhostState {
  tower: TowerDefinition
  cell: { x: number; y: number }
  valid: boolean
  range: number
}

const INCOMING_GROUND = 0xff6a3a
const INCOMING_AIR = 0xffc060

const PROJECTILE_TINT: Record<string, number> = {
  bullet: 0xffd080,
  shell: 0xffc070,
  lob: 0xffb060,
  blade: 0xe0e8f0,
  glob: 0xa6e05a,
  orb: 0xc0a0ff,
}

/**
 * Renders a running Simulation with PixiJS 8. Reads sim state every frame (interpolated between ticks) and turns sim
 * events into effects; it never mutates the simulation.
 */
export class GameRenderer {
  readonly app: Application
  readonly world = new Container()
  private readonly sim: Simulation
  private readonly forge: TextureForge
  private readonly lighting: Lighting
  private readonly effects: Effects
  private readonly weather: Weather
  private quality: QualityProfile
  private bloom: AdvancedBloomFilter | null = null

  private readonly layers = {
    terrain: new Container(),
    overlays: new Container(),
    zones: new Container(),
    ground: new Container(),
    towers: new Container(),
    projectiles: new Container(),
    air: new Container(),
    ui: new Container(),
  }
  private readonly towerViews = new Map<number, TowerView>()
  private readonly enemyViews = new Map<number, EnemyView>()
  private readonly projectileSprites = new Map<number, { sprite: Sprite; shadow: Sprite | null }>()
  private readonly mineSprites = new Map<number, Sprite>()
  private readonly zoneSprites = new Map<number, Sprite>()
  private readonly dropSprites = new Map<number, Sprite>()
  private readonly vaultCores: Sprite[] = []
  private readonly gateGfx = new Graphics()
  private readonly uiGfx = new Graphics()
  private readonly routeGfx = new Graphics()
  private readonly incomingGfx = new Graphics()
  private readonly gateLabels = new Map<number, Text>()
  private routeCache: { field: FlowField | null; paths: Map<number, Vec[]> } = { field: null, paths: new Map() }
  private routeAlpha = 0
  private conveyor: TilingSprite[] = []
  private specialCells: number[] = []
  private specialKind = ''
  private time = 0
  private gatesClosedDrawn: boolean | null = null
  private specialClosedDrawn: boolean | null = null
  selectedTower: number | null = null
  ghost: GhostState | null = null
  interactionPreview: { pos: Vec; radius: number } | null = null
  private shake = 0
  screenShakeEnabled = true

  // Camera.
  private zoom = 1
  private baseScale = 1
  private pan = { x: 0, y: 0 }

  private constructor(app: Application, sim: Simulation, quality: QualityProfile) {
    this.app = app
    this.sim = sim
    this.quality = quality
    this.forge = new TextureForge()
    const w = sim.grid.width * TILE
    const h = sim.grid.height * TILE
    this.lighting = new Lighting(this.forge, w, h, quality.lightResolution)
    this.effects = new Effects(this.forge, this.lighting, { particles: quality.particles, damageNumbers: quality.damageNumbers })
    this.weather = new Weather(this.forge, this.lighting, sim.config.map.weather, w, h, sim.config.modifiers.fog)
    this.weather.intensity = quality.weather

    const baked = bakeTerrain(sim.config.map, quality.textureScale)
    const terrain = new Sprite(baked.texture)
    terrain.width = w
    terrain.height = h
    this.layers.terrain.addChild(terrain)
    this.lighting.setStatic(baked.lights)
    this.specialKind = baked.specialKind
    this.specialCells = sim.grid.cellsOf('~')
    this.buildOverlays()

    // Vault core orbs.
    for (let i = 0; i < sim.totalCores; i++) {
      const s = new Sprite(this.forge.core)
      s.anchor.set(0.5)
      s.width = s.height = TILE * 0.24
      this.vaultCores.push(s)
      this.layers.overlays.addChild(s)
    }

    this.layers.overlays.addChild(this.gateGfx, this.routeGfx)
    this.layers.ui.addChild(this.incomingGfx, this.uiGfx)
    this.buildGateLabels()
    this.world.addChild(
      this.layers.terrain,
      this.layers.overlays,
      this.layers.zones,
      this.layers.ground,
      this.layers.towers,
      this.layers.projectiles,
      this.layers.air,
      this.effects.under,
      this.lighting.output,
      this.effects.over,
      this.weather.container,
      this.layers.ui,
    )
    app.stage.addChild(this.world)
    this.applyQuality(quality)
    this.fit()
  }

  static async create(parent: HTMLElement, sim: Simulation, quality: QualityProfile): Promise<GameRenderer> {
    const app = new Application()
    const options = {
      antialias: true,
      backgroundColor: 0x0b0806,
      resizeTo: parent,
      resolution: quality.resolution,
      autoDensity: true,
      powerPreference: 'high-performance' as const,
    }
    try {
      await app.init({ ...options, preference: 'webgpu' })
    } catch {
      await app.init({ ...options, preference: 'webgl' })
    }
    app.canvas.style.display = 'block'
    app.canvas.style.touchAction = 'none'
    parent.appendChild(app.canvas)
    app.ticker.stop()
    return new GameRenderer(app, sim, quality)
  }

  get rendererKind(): 'webgpu' | 'webgl' {
    return this.app.renderer.name === 'webgpu' ? 'webgpu' : 'webgl'
  }

  applyQuality(q: QualityProfile): void {
    this.quality = q
    this.effects.setBudget({ particles: q.particles, damageNumbers: q.damageNumbers })
    this.weather.intensity = q.weather
    this.lighting.enabled = q.lighting
    if (q.bloom) {
      this.bloom ??= new AdvancedBloomFilter({ threshold: 0.72, bloomScale: 0.8, brightness: 1.02, blur: 6, quality: q.bloomQuality })
      this.bloom.quality = q.bloomQuality
      this.world.filters = [this.bloom]
    } else {
      this.world.filters = []
    }
  }

  // ------------------------------------------------------------------------------------------------ Camera

  /** Screen space covered by the docked HUD bands; the map is framed between them. */
  private hudInset = { top: 0, bottom: 0 }

  /** Called by the HUD whenever its docked bands change height. */
  setHudInsets(top: number, bottom: number): void {
    if (top === this.hudInset.top && bottom === this.hudInset.bottom) return
    this.hudInset = { top, bottom }
    this.fit()
  }

  /** Height of the playfield between the HUD bands. */
  private get viewHeight(): number {
    const sh = this.app.screen.height
    return Math.max(sh * 0.4, sh - this.hudInset.top - this.hudInset.bottom)
  }

  fit(): void {
    const sw = this.app.screen.width
    const w = this.sim.grid.width * TILE
    const h = this.sim.grid.height * TILE
    this.baseScale = Math.min(sw / w, this.viewHeight / h)
    this.pan.x = 0
    this.pan.y = (this.hudInset.top - this.hudInset.bottom) / 2
    this.clampPan()
  }

  zoomAt(screenX: number, screenY: number, factor: number): void {
    const before = this.screenToWorld(screenX, screenY)
    this.zoom = Math.max(1, Math.min(2.5, this.zoom * factor))
    const scale = this.baseScale * this.zoom
    const sw = this.app.screen.width
    const sh = this.app.screen.height
    const w = this.sim.grid.width * TILE
    const h = this.sim.grid.height * TILE
    const ox = (sw - w * scale) / 2
    const oy = (sh - h * scale) / 2
    this.pan.x = screenX - ox - before.x * scale
    this.pan.y = screenY - oy - before.y * scale
    this.clampPan()
  }

  panBy(dx: number, dy: number): void {
    this.pan.x += dx
    this.pan.y += dy
    this.clampPan()
  }

  private clampPan(): void {
    const scale = this.baseScale * this.zoom
    const w = this.sim.grid.width * TILE * scale
    const h = this.sim.grid.height * TILE * scale
    const sw = this.app.screen.width
    // Pan around the centre of the playfield band, just far enough to bring every edge into view.
    const cy = (this.hudInset.top - this.hudInset.bottom) / 2
    const mx = Math.max(0, (w - sw) / 2 + 24)
    const my = Math.max(0, (h - this.viewHeight) / 2 + 24)
    this.pan.x = Math.max(-mx, Math.min(mx, this.pan.x))
    this.pan.y = Math.max(cy - my, Math.min(cy + my, this.pan.y))
  }

  private applyCamera(): void {
    const scale = this.baseScale * this.zoom
    const sw = this.app.screen.width
    const sh = this.app.screen.height
    const w = this.sim.grid.width * TILE
    const h = this.sim.grid.height * TILE
    const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 12 : 0
    const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 12 : 0
    this.world.scale.set(scale)
    this.world.position.set((sw - w * scale) / 2 + this.pan.x + shakeX, (sh - h * scale) / 2 + this.pan.y + shakeY)
  }

  /** Screen (CSS pixel) coordinates to world tile coordinates. */
  screenToWorld(x: number, y: number): Vec {
    const scale = this.baseScale * this.zoom
    const sw = this.app.screen.width
    const sh = this.app.screen.height
    const w = this.sim.grid.width * TILE
    const h = this.sim.grid.height * TILE
    return {
      x: (x - ((sw - w * scale) / 2 + this.pan.x)) / scale / TILE,
      y: (y - ((sh - h * scale) / 2 + this.pan.y)) / scale / TILE,
    }
  }

  worldToScreen(p: Vec): Vec {
    const scale = this.baseScale * this.zoom
    const sw = this.app.screen.width
    const sh = this.app.screen.height
    const w = this.sim.grid.width * TILE
    const h = this.sim.grid.height * TILE
    return { x: p.x * TILE * scale + (sw - w * scale) / 2 + this.pan.x, y: p.y * TILE * scale + (sh - h * scale) / 2 + this.pan.y }
  }

  // ------------------------------------------------------------------------------------------------ Overlays

  private buildOverlays(): void {
    const g = this.sim.grid
    if (this.specialKind === 'conveyor') {
      const { canvas, ctx } = makeCanvas(64, 64)
      ctx.fillStyle = '#1e1c1a'
      ctx.fillRect(0, 0, 64, 64)
      ctx.fillStyle = '#e0b030'
      for (let i = 0; i < 2; i++) {
        ctx.beginPath()
        ctx.moveTo(8 + i * 32, 16)
        ctx.lineTo(24 + i * 32, 32)
        ctx.lineTo(8 + i * 32, 48)
        ctx.lineTo(14 + i * 32, 48)
        ctx.lineTo(30 + i * 32, 32)
        ctx.lineTo(14 + i * 32, 16)
        ctx.fill()
      }
      const texture = Texture.from({ resource: canvas })
      for (const c of this.specialCells) {
        const t = new TilingSprite({ texture, width: TILE * 0.96, height: TILE * 0.84 })
        const p = g.center(c)
        t.position.set((p.x - 0.48) * TILE, (p.y - 0.42) * TILE)
        t.alpha = 0.85
        this.conveyor.push(t)
        this.layers.overlays.addChild(t)
      }
    }
  }

  private drawGates(): void {
    const state = this.sim.mechanics.state
    if (state.gatesClosed === this.gatesClosedDrawn && state.specialClosed === this.specialClosedDrawn) return
    this.gatesClosedDrawn = state.gatesClosed
    this.specialClosedDrawn = state.specialClosed
    const g = this.sim.grid
    this.gateGfx.clear()
    const barrier = (cell: number, color: number) => {
      const p = g.center(cell)
      const x = (p.x - 0.5) * TILE
      const y = (p.y - 0.5) * TILE
      this.gateGfx.rect(x + 4, y + 4, TILE - 8, TILE - 8).fill({ color: 0x1a1410, alpha: 0.8 })
      for (let i = 0; i < 4; i++) {
        this.gateGfx.rect(x + 6 + i * 14, y + 8, 8, TILE - 16).fill({ color: i % 2 ? 0x1a1410 : color })
      }
      this.gateGfx.rect(x + 4, y + 4, TILE - 8, TILE - 8).stroke({ width: 3, color: 0xc8923e })
    }
    if (state.gatesClosed) for (const c of g.cellsOf('G')) barrier(c, 0xe0b030)
    if (state.specialClosed) {
      for (const c of this.specialCells) {
        if (this.specialKind === 'water') {
          const p = g.center(c)
          this.gateGfx.rect((p.x - 0.5) * TILE, (p.y - 0.5) * TILE, TILE, TILE).fill({ color: 0x2a6a80, alpha: 0.75 })
        } else barrier(c, 0xc04030)
      }
    }
  }

  private animateSpecials(dt: number): void {
    const g = this.sim.grid
    const mech = this.sim.mechanics.state
    for (const t of this.conveyor) t.tilePosition.x += dt * 70
    if (this.specialCells.length === 0) return
    // Sample a few cells per frame for ambient emitters.
    const c = this.specialCells[Math.floor(Math.random() * this.specialCells.length)]
    const p = g.center(c)
    const x = p.x * TILE
    const y = p.y * TILE
    switch (this.specialKind) {
      case 'vent':
        if (mech.active && this.sim.config.map.mechanic.kind === 'steamVents') {
          for (const cell of this.specialCells) {
            const q = g.center(cell)
            this.effects.steam(q.x * TILE, q.y * TILE, 0.5, 0xfff0e0)
          }
        } else if (Math.random() < dt * 6) this.effects.steam(x, y, 0.3)
        break
      case 'lava':
        if (Math.random() < dt * 20) this.effects.emberRise(x, y)
        this.lighting.light(x, y, TILE * 1.4, 0xff5a1a, 0.6 + Math.sin(this.time * 3 + c) * 0.2)
        break
      case 'rod':
        if (Math.random() < dt * 4) this.effects.spark(x, y - 8, 0x9fe0ff)
        break
      case 'conduit':
      case 'lens': {
        const surge = mech.active && this.sim.config.map.mechanic.kind === 'aetherSurge'
        for (const cell of this.specialCells) {
          const q = g.center(cell)
          this.lighting.light(q.x * TILE, q.y * TILE, TILE * (surge ? 2.4 : 1.2), this.specialKind === 'lens' ? 0xb0fff0 : 0xb070ff, surge ? 1 : 0.4)
        }
        break
      }
      case 'water':
        if (Math.random() < dt * 8) this.effects.bubble(x, y, 0xa0e0ff)
        break
      case 'ice':
        if (Math.random() < dt * 5) this.effects.spark(x, y, 0xe0f8ff)
        break
    }
  }

  // ------------------------------------------------------------------------------------------------ Frame

  /** Draws one frame. `alpha` is the fraction of the way to the next sim tick. */
  frame(dt: number, alpha: number): void {
    this.time += dt
    const sim = this.sim
    const now = sim.time
    this.lighting.beginFrame()
    this.effects.beamGfx.clear()

    this.syncTowers(dt, now)
    this.syncEnemies(dt, alpha, now)
    this.syncProjectiles(alpha)
    this.syncMines()
    this.syncZones()
    this.syncDrops()
    this.syncVault()
    this.drawGates()
    this.animateSpecials(dt)
    this.drawIncoming(dt)
    this.drawUi()

    this.effects.update(dt)
    this.weather.update(dt, this.time)
    this.shake = Math.max(0, this.shake - dt * 3)
    this.applyCamera()
    this.lighting.render(this.app.renderer, dt, this.time)
    this.app.renderer.render(this.app.stage)
  }

  private syncTowers(dt: number, now: number): void {
    const alive = new Set<number>()
    for (const t of this.sim.towers) {
      alive.add(t.id)
      let view = this.towerViews.get(t.id)
      if (!view) {
        view = new TowerView(t, this.forge, this.quality.textureScale)
        this.towerViews.set(t.id, view)
        this.layers.towers.addChild(view.root)
      }
      view.update(dt, this.time, t.stunUntil > now || t.jammed, t.overchargeUntil > now)
      const x = t.pos.x * TILE
      const y = t.pos.y * TILE
      this.lighting.light(x, y, TILE * (t.level >= 4 ? 2.2 : 1.4), view.emissive, 0.35 + t.level * 0.08)

      // Continuous beams.
      if (t.def.attack === 'beam' && t.beamTargets.length > 0) {
        const color = toNumber(CATEGORY_EMISSIVE[t.def.category])
        const from = { x, y: y - 6 }
        for (const id of t.beamTargets) {
          const e = this.enemyViews.get(id)
          if (!e) continue
          const to = { x: e.root.x, y: e.root.y }
          this.effects.beam(from, to, color, 3 + t.level, this.time)
          this.lighting.light(to.x, to.y, TILE * 1.2, color, 0.8)
          if (Math.random() < dt * 20) this.effects.spark(to.x, to.y, color)
        }
      }
      // Idle machine flourishes.
      if (t.def.id === 'tesla-coil' && Math.random() < dt * 1.5) {
        const a = Math.random() * Math.PI * 2
        this.effects.lightning([{ x, y: y - 10 }, { x: x + Math.cos(a) * 26, y: y - 10 + Math.sin(a) * 26 }], 0xbfe8ff)
      }
      if ((t.def.id === 'furnace-tower' || t.def.id === 'incinerator') && Math.random() < dt * 3) this.effects.emberRise(x, y - 8)
      if ((t.def.id === 'steam-pressure-booster' || t.def.id === 'steam-hammer') && Math.random() < dt * 2) this.effects.steam(x + 12, y - 10, 0.4)
      if ((t.def.id === 'alchemical-still' || t.def.id === 'toxic-diffuser') && Math.random() < dt * 3) this.effects.bubble(x, y - 6, 0xb0ff80)
      if (t.stunUntil > now && Math.random() < dt * 12) this.effects.spark(x, y, 0x9fe0ff)
    }
    for (const [id, view] of this.towerViews) {
      if (!alive.has(id)) {
        view.destroy()
        this.towerViews.delete(id)
      }
    }
  }

  private syncEnemies(dt: number, alpha: number, now: number): void {
    const alive = new Set<number>()
    for (const e of this.sim.enemies) {
      if (!e.alive) continue
      alive.add(e.id)
      let view = this.enemyViews.get(e.id)
      if (!view) {
        view = new EnemyView(e, this.forge, this.quality.textureScale)
        this.enemyViews.set(e.id, view)
        ;(e.air ? this.layers.air : this.layers.ground).addChild(view.root)
      }
      view.update(dt, this.time, alpha, now)
      const x = view.root.x
      const y = view.root.y
      if (e.status.burnUntil > now && Math.random() < dt * 14) this.effects.emberRise(x, y)
      if (e.status.poisonUntil > now && Math.random() < dt * 6) this.effects.bubble(x, y, 0xa6e05a)
      if (e.status.stunUntil > now && Math.random() < dt * 10) this.effects.spark(x, y - 8, 0xbfe8ff)
      if (e.burrowedUntil > now && Math.random() < dt * 8) this.effects.steam(x, y, 0.3, 0x6a5a48)
      if ((e.def.id === 'steam-golem' || e.def.id === 'pressure-titan' || e.def.id === 'chimney-stalker' || e.def.id === 'boiler-walker') && Math.random() < dt * 3) {
        this.effects.steam(x, y - e.def.size * TILE * 0.5, 0.5, e.def.id === 'chimney-stalker' ? 0x3a3430 : 0xd8d4d0)
      }
      if (e.def.id === 'tesla-wraith' || e.def.id === 'aether-leech' || e.def.isBoss) {
        this.lighting.light(x, y, TILE * e.def.size * 4, e.def.id === 'tesla-wraith' ? 0x7fd4ff : e.def.id === 'aether-leech' ? 0xb690ff : 0xff6a2a, 0.7)
      }
      if (e.carrying > 0) this.lighting.light(x, y, TILE * 1.2, 0x7fd4ff, 0.8)
    }
    for (const [id, view] of this.enemyViews) {
      if (!alive.has(id)) {
        view.destroy()
        this.enemyViews.delete(id)
      }
    }
  }

  private syncProjectiles(alpha: number): void {
    const alive = new Set<number>()
    for (const p of this.sim.projectiles) {
      if (!p.alive) continue
      alive.add(p.id)
      let entry = this.projectileSprites.get(p.id)
      if (!entry) {
        const sprite = new Sprite(p.kind === 'bullet' ? this.forge.spark : this.forge.glow)
        sprite.anchor.set(0.5)
        sprite.blendMode = 'add'
        sprite.tint = PROJECTILE_TINT[p.kind] ?? 0xffffff
        const size = p.kind === 'bullet' ? 0.5 : p.kind === 'lob' ? 0.5 : p.kind === 'orb' ? 0.8 : 0.45
        sprite.scale.set(size * (p.nth ? 1.6 : 1))
        let shadow: Sprite | null = null
        if (p.kind === 'lob') {
          shadow = new Sprite(this.forge.softDot)
          shadow.anchor.set(0.5)
          shadow.tint = 0x000000
          shadow.alpha = 0.35
          shadow.scale.set(0.6)
          this.layers.projectiles.addChild(shadow)
        }
        this.layers.projectiles.addChild(sprite)
        entry = { sprite, shadow }
        this.projectileSprites.set(p.id, entry)
      }
      const x = (p.prev.x + (p.pos.x - p.prev.x) * alpha) * TILE
      const y = (p.prev.y + (p.pos.y - p.prev.y) * alpha) * TILE
      if (p.kind === 'lob') {
        const k = Math.min(1, p.flight / p.flightTime)
        const lift = Math.sin(Math.PI * k) * p.arcHeight * TILE
        entry.sprite.position.set(x, y - lift)
        entry.sprite.scale.set(0.5 + Math.sin(Math.PI * k) * 0.4)
        entry.shadow?.position.set(x, y)
        if (Math.random() < 0.3) this.effects.steam(x, y - lift, 0.2, 0x6a605a)
      } else {
        entry.sprite.position.set(x, y)
        entry.sprite.rotation = Math.atan2(p.pos.y - p.prev.y, p.pos.x - p.prev.x)
        if (p.kind === 'blade') entry.sprite.rotation = this.time * 30
      }
      this.lighting.light(entry.sprite.x, entry.sprite.y, TILE * 0.8, PROJECTILE_TINT[p.kind] ?? 0xffffff, 0.6)
    }
    for (const [id, entry] of this.projectileSprites) {
      if (!alive.has(id)) {
        entry.sprite.destroy()
        entry.shadow?.destroy()
        this.projectileSprites.delete(id)
      }
    }
  }

  private syncMines(): void {
    const alive = new Set<number>()
    for (const m of this.sim.mines) {
      alive.add(m.id)
      let s = this.mineSprites.get(m.id)
      if (!s) {
        s = new Sprite(this.forge.core)
        s.anchor.set(0.5)
        s.tint = 0x9fe0ff
        s.width = s.height = TILE * 0.22
        this.layers.zones.addChild(s)
        this.mineSprites.set(m.id, s)
      }
      s.position.set(m.pos.x * TILE, m.pos.y * TILE)
      s.alpha = m.armedAt > this.sim.time ? 0.4 : 0.7 + Math.sin(this.time * 6 + m.id) * 0.3
    }
    for (const [id, s] of this.mineSprites) {
      if (!alive.has(id)) {
        s.destroy()
        this.mineSprites.delete(id)
      }
    }
  }

  private syncZones(): void {
    const alive = new Set<number>()
    const colors: Record<string, number> = { fire: 0xff6a1a, acid: 0x9ad040, toxic: 0x7ab040, electric: 0x7fd4ff, radiation: 0xd0a0ff, singularity: 0x8a50ff }
    for (const z of this.sim.zones) {
      alive.add(z.id)
      let s = this.zoneSprites.get(z.id)
      if (!s) {
        s = new Sprite(this.forge.glow)
        s.anchor.set(0.5)
        s.blendMode = 'add'
        s.tint = colors[z.kind]
        this.layers.zones.addChild(s)
        this.zoneSprites.set(z.id, s)
      }
      const x = z.pos.x * TILE
      const y = z.pos.y * TILE
      s.position.set(x, y)
      s.width = s.height = z.radius * TILE * 2.6
      s.alpha = 0.55 + Math.sin(this.time * 5 + z.id) * 0.15
      if (z.kind === 'singularity') s.rotation += 0.2
      this.lighting.light(x, y, z.radius * TILE * 2, colors[z.kind], 0.6)
      const r = z.radius * TILE
      const a = Math.random() * Math.PI * 2
      const px = x + Math.cos(a) * r * Math.random()
      const py = y + Math.sin(a) * r * Math.random()
      if (z.kind === 'fire') this.effects.emberRise(px, py)
      else if (z.kind === 'acid' || z.kind === 'toxic') this.effects.bubble(px, py, colors[z.kind])
      else if (z.kind === 'electric') this.effects.spark(px, py, colors.electric)
      else if (z.kind === 'singularity') this.effects.spark(x + Math.cos(a) * r, y + Math.sin(a) * r, colors.singularity)
    }
    for (const [id, s] of this.zoneSprites) {
      if (!alive.has(id)) {
        s.destroy()
        this.zoneSprites.delete(id)
      }
    }
  }

  private syncDrops(): void {
    const alive = new Set<number>()
    for (const d of this.sim.drops) {
      alive.add(d.id)
      let s = this.dropSprites.get(d.id)
      if (!s) {
        s = new Sprite(this.forge.core)
        s.anchor.set(0.5)
        s.width = s.height = TILE * 0.4
        this.layers.air.addChild(s)
        this.dropSprites.set(d.id, s)
      }
      s.position.set(d.pos.x * TILE, d.pos.y * TILE - 8 + Math.sin(this.time * 4 + d.id) * 4)
      this.lighting.light(s.x, s.y, TILE * 1.5, 0x7fd4ff, 1)
    }
    for (const [id, s] of this.dropSprites) {
      if (!alive.has(id)) {
        s.destroy()
        this.dropSprites.delete(id)
      }
    }
  }

  private syncVault(): void {
    const c = this.sim.grid.center(this.sim.grid.core)
    const n = this.sim.vaultCores
    this.vaultCores.forEach((s, i) => {
      s.visible = i < n
      const a = this.time * 0.6 + (i / Math.max(1, n)) * Math.PI * 2
      const ring = i % 2 === 0 ? 0.42 : 0.28
      s.position.set((c.x + Math.cos(a) * ring) * TILE, (c.y + Math.sin(a) * ring) * TILE)
    })
  }

  private buildGateLabels(): void {
    const grid = this.sim.grid
    const gates = new Set(this.sim.config.level.activeSpawns)
    if (gates.size < 2) return
    const style = new TextStyle({
      fontFamily: 'Cinzel, Georgia, serif',
      fontSize: 22,
      fontWeight: '700',
      fill: 0xffe0b0,
      stroke: { color: 0x1a0a04, width: 4 },
      dropShadow: { color: 0xff4a1a, blur: 8, distance: 0, alpha: 0.8 },
    })
    for (const index of gates) {
      const cell = grid.spawns[index]
      if (cell === undefined) continue
      const label = new Text({ text: gateLetter(index), style, resolution: 2 })
      label.anchor.set(0.5)
      const p = grid.center(cell)
      label.position.set(p.x * TILE, (p.y - 0.95) * TILE)
      label.alpha = 0
      this.gateLabels.set(cell, label)
      this.layers.ui.addChild(label)
    }
  }

  /** The route a ground enemy would take from a spawn to the vault right now, as tile-centre points. */
  private routeFrom(cell: number): Vec[] {
    const grid = this.sim.grid
    if (this.routeCache.field !== grid.toCore) this.routeCache = { field: grid.toCore, paths: new Map() }
    let path = this.routeCache.paths.get(cell)
    if (!path) {
      path = [grid.center(cell)]
      let i = cell
      for (let guard = grid.width * grid.height; guard > 0 && i !== grid.core; guard--) {
        i = grid.step(grid.toCore, i)
        if (i < 0) break
        path.push(grid.center(i))
      }
      this.routeCache.paths.set(cell, path)
    }
    return path
  }

  /** Chevrons marching along a polyline (tile units) toward its end, fading in and out at either end. */
  private drawChevrons(g: Graphics, path: Vec[], color: number, alpha: number, phase: number): void {
    const lengths = [0]
    for (let k = 1; k < path.length; k++) lengths.push(lengths[k - 1] + Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y))
    const total = lengths[lengths.length - 1]
    if (total <= 0) return
    const spacing = 0.85
    const size = 0.16 * TILE
    let k = 1
    for (let d = 0.5 + (phase % spacing); d < total - 0.3; d += spacing) {
      while (lengths[k] < d) k++
      const a = path[k - 1]
      const b = path[k]
      const seg = lengths[k] - lengths[k - 1]
      const ux = (b.x - a.x) / seg
      const uy = (b.y - a.y) / seg
      const t = d - lengths[k - 1]
      const x = (a.x + ux * t) * TILE
      const y = (a.y + uy * t) * TILE
      const fade = Math.min(1, (d - 0.5) / 1.2, (total - d) / 1.5)
      const bx = x - ux * size
      const by = y - uy * size
      g.moveTo(bx - uy * size, by + ux * size)
        .lineTo(x, y)
        .lineTo(bx + uy * size, by - ux * size)
        .stroke({ width: 3, color, alpha: alpha * fade, cap: 'round', join: 'round' })
    }
  }

  /**
   * While the player prepares, marks the entrances the next wave will use and the route it will take to the vault;
   * entrances stay lit while they are still releasing enemies.
   */
  private drawIncoming(dt: number): void {
    const sim = this.sim
    const grid = sim.grid
    const route = this.routeGfx
    const marks = this.incomingGfx
    route.clear()
    marks.clear()

    const upcoming = sim.upcomingWave
    const preparing = upcoming >= 0 && (sim.waveIndex < 0 || sim.nextWaveAt !== null) && sim.outcome === 'playing'
    this.routeAlpha = preparing ? Math.min(1, this.routeAlpha + dt * 2.5) : Math.max(0, this.routeAlpha - dt * 2)

    const ground: number[] = []
    const air: number[] = []
    if (upcoming >= 0) {
      for (const group of sim.config.level.waves[upcoming].groups) {
        const list = sim.config.enemies.get(group.enemy)?.movement === 'air' ? air : ground
        const cell = sim.spawnCellOf(group)
        if (!list.includes(cell)) list.push(cell)
      }
    }

    // Markers pulse faster as the countdown runs out.
    const left = sim.nextWaveIn
    const urgency = left === null ? 0 : 1 - Math.min(1, left / Math.max(1, sim.config.rules.waveGap))
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (3 + urgency * 6))

    if (this.routeAlpha > 0) {
      for (const cell of ground) {
        const path = this.routeFrom(cell)
        route
          .poly(path.flatMap((p) => [p.x * TILE, p.y * TILE]), false)
          .stroke({ width: TILE * 0.34, color: INCOMING_GROUND, alpha: 0.1 * this.routeAlpha, cap: 'round', join: 'round' })
        this.drawChevrons(route, path, INCOMING_GROUND, 0.75 * this.routeAlpha, this.time * 1.4)
      }
      // Flyers ignore the maze and head straight for the vault.
      const core = grid.center(grid.core)
      for (const cell of air) {
        const from = grid.center(cell)
        route
          .moveTo(from.x * TILE, from.y * TILE)
          .lineTo(core.x * TILE, core.y * TILE)
          .stroke({ width: 2, color: INCOMING_AIR, alpha: 0.18 * this.routeAlpha })
        this.drawChevrons(route, [from, core], INCOMING_AIR, 0.6 * this.routeAlpha, this.time * 1.4)
      }
    }

    const releasing = sim.releasingSpawnCells
    const active = new Set<number>(releasing)
    if (this.routeAlpha > 0) for (const c of [...ground, ...air]) active.add(c)
    for (const [cell, label] of this.gateLabels) {
      const on = active.has(cell)
      label.alpha += ((on ? 1 : 0.35) - label.alpha) * Math.min(1, dt * 6)
      label.scale.set(on ? 1 + pulse * 0.08 : 1)
    }
    for (const cell of active) {
      const spawning = releasing.includes(cell)
      const strength = spawning ? 1 : this.routeAlpha
      const p = grid.center(cell)
      const x = p.x * TILE
      const y = p.y * TILE
      const color = air.includes(cell) && !ground.includes(cell) ? INCOMING_AIR : INCOMING_GROUND
      marks.circle(x, y, TILE * (0.55 + pulse * 0.12)).stroke({ width: 3, color, alpha: (0.35 + pulse * 0.45) * strength })
      // A slowly turning toothed ring around the hatch.
      const teeth = 12
      const spin = this.time * (spawning ? 1.6 : 0.6)
      for (let k = 0; k < teeth; k++) {
        const a = spin + (k / teeth) * Math.PI * 2
        marks.moveTo(x + Math.cos(a) * TILE * 0.7, y + Math.sin(a) * TILE * 0.7).lineTo(x + Math.cos(a) * TILE * 0.8, y + Math.sin(a) * TILE * 0.8)
      }
      marks.stroke({ width: 3, color: 0xffd090, alpha: 0.55 * strength, cap: 'round' })
      this.lighting.light(x, y, TILE * (2.2 + pulse * 0.8), color, (0.6 + pulse * 0.5) * strength)
    }
  }

  private drawUi(): void {
    const g = this.uiGfx
    g.clear()
    const showGrid = this.ghost !== null
    if (showGrid) {
      const grid = this.sim.grid
      for (let i = 0; i < grid.width * grid.height; i++) {
        if (!grid.isBuildable(i)) continue
        const p = grid.center(i)
        g.rect((p.x - 0.5) * TILE + 3, (p.y - 0.5) * TILE + 3, TILE - 6, TILE - 6).stroke({ width: 1.5, color: 0xf6d98a, alpha: 0.18 })
      }
    }
    if (this.ghost) {
      const { cell, valid, range } = this.ghost
      const x = (cell.x + 0.5) * TILE
      const y = (cell.y + 0.5) * TILE
      const color = valid ? 0x8ad060 : 0xe0503a
      g.circle(x, y, range * TILE).fill({ color, alpha: 0.08 }).stroke({ width: 2, color, alpha: 0.6 })
      g.rect(cell.x * TILE + 2, cell.y * TILE + 2, TILE - 4, TILE - 4).fill({ color, alpha: 0.22 }).stroke({ width: 2.5, color })
    }
    if (this.selectedTower !== null) {
      const t = this.sim.towers.find((x) => x.id === this.selectedTower)
      if (t) {
        const r = this.sim.towerSystem.range(t)
        const x = t.pos.x * TILE
        const y = t.pos.y * TILE
        g.circle(x, y, r * TILE).fill({ color: 0xf6d98a, alpha: 0.06 }).stroke({ width: 2, color: 0xf6d98a, alpha: 0.7 })
        if ((t.base.minRange ?? 0) > 0) g.circle(x, y, (t.base.minRange ?? 0) * TILE).stroke({ width: 1.5, color: 0xe0503a, alpha: 0.6 })
        g.circle(x, y, TILE * 0.52).stroke({ width: 3, color: 0xf6d98a, alpha: 0.9 + Math.sin(this.time * 6) * 0.1 })
      }
    }
    if (this.interactionPreview) {
      const { pos, radius } = this.interactionPreview
      g.circle(pos.x * TILE, pos.y * TILE, radius * TILE).fill({ color: 0x7fd4ff, alpha: 0.1 }).stroke({ width: 2, color: 0x7fd4ff, alpha: 0.8 })
    }
  }

  // ------------------------------------------------------------------------------------------------ Events

  handleEvents(events: SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'fire': {
          const view = this.towerViews.get(ev.tower)
          const t = view?.tower
          if (!view || !t) break
          view.kick()
          const x = t.pos.x * TILE
          const y = t.pos.y * TILE
          const angle = Math.atan2(ev.to.y - t.pos.y, ev.to.x - t.pos.x)
          const color = DAMAGE_COLORS[t.def.damageType]
          if (ev.kind === 'cone') this.effects.cone(x, y, angle, this.sim.towerSystem.range(t), t.base.coneAngle ?? 45, t.def.damageType)
          else if (ev.kind === 'pulse' || ev.kind === 'chain' || ev.kind === 'mine') this.lighting.flash(x, y, TILE * 1.5, color, 0.1)
          else this.effects.muzzle(x, y, angle, color, ev.kind.endsWith('nth') ? 1.6 : ev.kind === 'lob' ? 1.3 : 1)
          if (ev.kind === 'lob') this.effects.steam(x, y, 0.6, 0x8a8078)
          break
        }
        case 'hit': {
          const view = this.enemyViews.get(ev.enemy)
          if (!view) break
          view.hit()
          if (ev.amount >= 1) this.effects.damageNumber(view.root.x, view.root.y - view.size * TILE, ev.amount, DAMAGE_COLORS[ev.damageType], ev.crit)
          if (Math.random() < 0.5) this.effects.impact(view.root.x, view.root.y, 0, ev.damageType, 'hit')
          break
        }
        case 'impact':
          this.effects.impact(ev.pos.x * TILE, ev.pos.y * TILE, ev.radius, ev.damageType, ev.kind)
          if (ev.radius >= 1.4 || ev.kind === 'boiler') this.addShake(0.4)
          break
        case 'lightning':
          this.effects.lightning(ev.points.map((p) => ({ x: p.x * TILE, y: p.y * TILE })), 0xbfe8ff, ev.strong)
          break
        case 'rail':
          this.effects.rail({ x: ev.from.x * TILE, y: ev.from.y * TILE }, { x: ev.to.x * TILE, y: ev.to.y * TILE })
          break
        case 'kill': {
          const x = ev.pos.x * TILE
          const y = ev.pos.y * TILE
          const e = this.enemyViews.get(ev.enemy)
          const size = e?.size ?? 0.3
          this.effects.explosion(x, y, size * TILE * (ev.boss ? 4 : 1.6), ev.boss ? 0xffa040 : 0xffc070, ev.boss || size > 0.5)
          if (ev.boss) this.addShake(1.2)
          break
        }
        case 'ability':
          this.abilityEffect(ev.kind, ev.pos, ev.radius)
          break
        case 'interaction':
          this.effects.explosion(ev.pos.x * TILE, ev.pos.y * TILE, ev.radius * TILE, 0x7fd4ff, true)
          this.addShake(0.6)
          break
        case 'coreTaken':
        case 'coreDropped':
        case 'escape': {
          const c = this.sim.grid.center(this.sim.grid.core)
          this.lighting.flash(c.x * TILE, c.y * TILE, TILE * 3, 0xff4020, 0.4)
          break
        }
        case 'built':
        case 'upgraded': {
          const t = this.sim.towers.find((x) => x.id === ev.tower)
          if (!t) break
          this.effects.ring(t.pos.x * TILE, t.pos.y * TILE, TILE * 0.2, TILE * 1.1, 0xf6d98a, 0.4)
          this.effects.steam(t.pos.x * TILE, t.pos.y * TILE, 1.5)
          break
        }
        case 'sold':
          this.effects.steam(ev.pos.x * TILE, ev.pos.y * TILE, 2)
          break
        case 'gold':
          if (ev.pos) this.effects.glow.emit({ x: ev.pos.x * TILE, y: ev.pos.y * TILE, vy: -40, life: 0.5, scale: 0.25, tint: 0xffd060 })
          break
        case 'bossPhase':
          this.addShake(0.8)
          break
        case 'mechanic':
          if (ev.kind === 'trainCrossing' && ev.active) this.addShake(0.7)
          break
      }
    }
  }

  private abilityEffect(kind: string, pos: Vec, radius: number): void {
    const x = pos.x * TILE
    const y = pos.y * TILE
    const r = radius * TILE
    switch (kind) {
      case 'mapStrike':
        this.effects.lightning([{ x: x + (Math.random() - 0.5) * 60, y: y - TILE * 5 }, { x, y }], 0xdff4ff, true)
        this.effects.explosion(x, y, TILE * 0.6, 0x9fe0ff, false)
        this.lighting.lightningFlash(0.25)
        break
      case 'orbital':
        this.effects.rail({ x, y: y - TILE * 8 }, { x, y }, 0xffe0a0)
        this.effects.explosion(x, y, r, 0xffc070, true)
        this.addShake(0.9)
        break
      case 'periodicPulse':
      case 'stasisField':
      case 'pull':
      case 'rewind':
      case 'overcharge':
        this.effects.ring(x, y, r * 0.2, r, kind === 'stasisField' || kind === 'rewind' ? 0xc0a0ff : kind === 'overcharge' ? 0xffd070 : 0x9fe0ff, 0.5)
        this.lighting.flash(x, y, r * 1.5, 0x9fe0ff, 0.2)
        break
      case 'singularity':
        this.effects.ring(x, y, r * 1.4, r * 0.1, 0x8a50ff, 0.6)
        break
      case 'shieldAura':
        this.effects.ring(x, y, r * 0.3, r, 0x6ab0ff, 0.5)
        break
      case 'sabotage':
        this.effects.ring(x, y, r * 0.2, r, 0xff6a2a, 0.4)
        for (let i = 0; i < 6; i++) this.effects.spark(x, y, 0xffa040)
        break
      case 'deflect':
        this.effects.spark(x, y, 0xff8080)
        break
      case 'armorShed':
        this.effects.explosion(x, y, TILE * 0.4, 0xd8b070, false)
        break
    }
  }

  addShake(amount: number): void {
    if (this.screenShakeEnabled) this.shake = Math.min(1.5, this.shake + amount)
  }

  resize(): void {
    this.app.resize()
    this.fit()
  }

  destroy(): void {
    this.lighting.destroy()
    this.app.destroy(true, { children: true, texture: false })
  }
}
