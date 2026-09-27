import type { Content } from '../api/content'
import { completeSession, putSave, type SessionStart } from '../api/sessions'
import { ApiError } from '../api/http'
import { initialHud, useHud, type HudState, type SelectedTowerInfo, type Toast, type UpgradeOption, type WaveIntel, type WaveIntelEntry } from '../state/game'
import type { Settings } from '../state/settings'
import { gateLetter } from '../lib/labels'
import { GameAudio } from './audio/gameAudio'
import { GameRenderer } from './render/GameRenderer'
import { FrameGovernor, lowerTier, resolveQuality, type QualityProfile } from './render/quality'
import { canPurchase } from './sim/stats'
import { replay, Simulation } from './sim/simulation'
import type { Action, SimConfig, SimEvent, TargetMode } from './sim/types'

export const AUTOSAVE_SLOT = 1
const AUTOSAVE_SECONDS = 30
const HUD_INTERVAL = 0.12

export interface GameControllerOptions {
  parent: HTMLElement
  session: SessionStart
  content: Content
  settings: Settings
  features: string[]
  resume?: { tick: number; actions: Action[] } | null
  /** Local-only runs (dev sandbox): no cloud saves, no submission. */
  offline?: boolean
  onEvents?: (events: SimEvent[], sim: Simulation) => void
}

export function toSimConfig(session: SessionStart, content: Content): SimConfig {
  const c = session.config
  return {
    level: c.level,
    map: content.maps.get(c.level.mapId)!,
    towers: content.towers,
    enemies: content.enemies,
    rules: content.bundle.rules,
    modifiers: c.modifiers,
    seed: c.seed,
    bonuses: c.bonuses,
    prestige: c.prestige,
    unlockedTowers: c.unlockedTowers,
  }
}

/**
 * Runs one battle: fixed-step simulation, interpolated rendering, pointer/keyboard input, periodic cloud autosave,
 * and the final submission to the server. React observes it only through the HUD store.
 */
export class GameController {
  readonly sim: Simulation
  readonly renderer: GameRenderer
  private readonly session: SessionStart
  private readonly content: Content
  private readonly options: GameControllerOptions
  private quality: QualityProfile
  private readonly governor = new FrameGovernor()
  private raf = 0
  private last = 0
  private acc = 0
  private hudTimer = 0
  private saveTimer = 0
  private saveVersion: number | null = null
  private toastId = 1
  private toasts: Toast[] = []
  private destroyed = false
  private speed = 1
  private paused = false
  private buildSelection: string | null = null
  private selected: number | null = null
  private targeting = false
  private submitted = false
  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number; moved: boolean }>()
  private pinchDistance = 0
  private touchGhost: { x: number; y: number } | null = null
  private readonly maxSpeed: number
  private readonly cleanup: (() => void)[] = []
  private readonly audio: GameAudio
  private intel: { wave: number; value: WaveIntel | null } = { wave: -2, value: null }

  private constructor(options: GameControllerOptions, sim: Simulation, renderer: GameRenderer, quality: QualityProfile) {
    this.options = options
    this.session = options.session
    this.content = options.content
    this.sim = sim
    this.renderer = renderer
    this.quality = quality
    this.maxSpeed = options.features.includes('feature.speed3x') ? 3 : options.features.includes('feature.speed2x') ? 2 : 1
    renderer.screenShakeEnabled = options.settings.screenShake
    this.audio = new GameAudio(sim)
    this.bindInput()
    useHud.setState({ ...initialHud, ready: true, maxSpeed: this.maxSpeed })
    this.publish()
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  static async create(options: GameControllerOptions): Promise<GameController> {
    useHud.setState({ ...initialHud, loadingLabel: options.resume ? 'Replaying your battle…' : 'Forging the battlefield…' })
    const config = toSimConfig(options.session, options.content)
    const sim = options.resume ? replay(config, options.resume.actions, options.resume.tick) : new Simulation(config)
    const quality = resolveQuality(options.settings.quality, 'webgl')
    const renderer = await GameRenderer.create(options.parent, sim, quality)
    const tuned = resolveQuality(options.settings.quality, renderer.rendererKind)
    renderer.applyQuality(tuned)
    return new GameController(options, sim, renderer, tuned)
  }

  // ------------------------------------------------------------------------------------------------ Loop

  private frame = (now: number) => {
    if (this.destroyed) return
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    const sim = this.sim

    if (!this.paused && sim.outcome === 'playing') {
      this.acc += dt * this.speed
      const step = sim.dt
      let steps = 0
      while (this.acc >= step && steps < 12 && sim.outcome === 'playing') {
        sim.tick()
        const events = sim.drainEvents()
        this.renderer.handleEvents(events)
        this.audio.handle(events)
        this.onEvents(events)
        this.options.onEvents?.(events, sim)
        this.acc -= step
        steps++
      }
      if (steps === 12) this.acc = 0
    }

    this.renderer.frame(dt, this.paused ? 1 : Math.min(1, this.acc / sim.dt))
    if (!this.paused) this.audio.update(dt)

    if (this.options.settings.quality === 'auto' && this.governor.sample(dt)) {
      const next = lowerTier(this.quality.tier)
      if (next) {
        this.quality = resolveQuality(next, this.renderer.rendererKind)
        this.renderer.applyQuality(this.quality)
      }
    }

    this.hudTimer -= dt
    if (this.hudTimer <= 0) {
      this.hudTimer = HUD_INTERVAL
      this.publish()
    }

    if (!this.paused && sim.outcome === 'playing' && sim.waveIndex >= 0) {
      this.saveTimer += dt
      if (this.saveTimer >= AUTOSAVE_SECONDS) {
        this.saveTimer = 0
        void this.save()
      }
    }

    if (sim.outcome !== 'playing' && !this.submitted) {
      this.submitted = true
      this.audio.finish(sim.outcome)
      this.publish()
      void this.submit()
    }

    this.raf = requestAnimationFrame(this.frame)
  }

  private onEvents(events: SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'waveStart':
          this.toast(ev.boss ? `Wave ${ev.wave} — a boss approaches!` : `Wave ${ev.wave}`, ev.boss ? 'boss' : 'info')
          break
        case 'bossPhase':
          this.toast(`Boss phase: ${ev.name}`, 'boss')
          break
        case 'coreTaken':
          this.toast(`${ev.count > 1 ? `${ev.count} cores` : 'A core'} stolen from the vault!`, 'warn')
          break
        case 'escape':
          if (ev.cores > 0) this.toast(`${ev.cores} core${ev.cores > 1 ? 's' : ''} lost!`, 'warn')
          break
        case 'coreReturned':
          this.toast('Core recovered', 'good')
          break
        case 'towerStunned':
          if (this.selected === ev.tower) this.publish()
          break
      }
    }
  }

  private toast(text: string, tone: Toast['tone']): void {
    const toast = { id: this.toastId++, text, tone }
    this.toasts = [...this.toasts.slice(-3), toast]
    window.setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== toast.id)
      useHud.setState({ toasts: this.toasts })
    }, 2600)
    useHud.setState({ toasts: this.toasts })
  }

  // ------------------------------------------------------------------------------------------------ HUD

  private publish(): void {
    const sim = this.sim
    const t = sim.time
    const interaction = sim.config.map.interaction
    const cooldown = sim.mechanics.cooldown
    const boss = sim.enemies.find((e) => e.alive && e.def.isBoss)
    const state: Partial<HudState> = {
      gold: sim.gold,
      cores: sim.coresRemaining,
      vaultCores: sim.vaultCores,
      coresTotal: sim.totalCores,
      wave: sim.waveIndex + 1,
      waveCount: sim.waveCount,
      nextWaveIn: sim.nextWaveIn,
      earlyBonus: sim.earlyCallBonus,
      canCallWave: sim.waveIndex + 1 < sim.waveCount && sim.outcome === 'playing',
      waitingForFirstWave: sim.waveIndex < 0,
      speed: this.speed,
      paused: this.paused,
      outcome: sim.outcome,
      buildSelection: this.buildSelection,
      selected: this.selectedInfo(),
      interaction: {
        name: interaction.name,
        description: interaction.description,
        ready: t >= sim.interactionReadyAt,
        cooldownLeft: Math.max(0, sim.interactionReadyAt - t),
        cooldown,
        targeting: this.targeting,
        disabled: sim.hasRule('noInteraction'),
      },
      boss: boss ? { name: boss.def.name, hp: boss.hp, maxHp: boss.maxHp } : null,
      nextWave: this.waveIntel(),
      toasts: this.toasts,
    }
    useHud.setState(state)
  }

  /** Composition of the next wave, cached per wave so the HUD only re-renders when it changes. */
  private waveIntel(): WaveIntel | null {
    const sim = this.sim
    const index = sim.upcomingWave
    if (this.intel.wave === index) return this.intel.value
    let value: WaveIntel | null = null
    if (index >= 0) {
      const multiGate = new Set(sim.config.level.activeSpawns).size > 1
      const entries = new Map<string, WaveIntelEntry>()
      for (const g of sim.config.level.waves[index].groups) {
        const def = sim.config.enemies.get(g.enemy)
        if (!def) continue
        const key = `${g.enemy}:${g.elite}`
        const gate = gateLetter(sim.grid.spawns.indexOf(sim.spawnCellOf(g)))
        const entry = entries.get(key) ?? { enemyId: g.enemy, name: def.name, count: 0, elite: g.elite, air: def.movement === 'air', boss: def.isBoss, gates: [] }
        entry.count += g.count
        if (multiGate && !entry.gates.includes(gate)) entry.gates.push(gate)
        entries.set(key, entry)
      }
      const list = [...entries.values()].sort((a, b) => Number(b.boss) - Number(a.boss) || b.count - a.count)
      for (const e of list) e.gates.sort()
      value = { number: index + 1, boss: list.some((e) => e.boss), total: list.reduce((n, e) => n + e.count, 0), entries: list }
    }
    this.intel = { wave: index, value }
    return value
  }

  private selectedInfo(): SelectedTowerInfo | null {
    if (this.selected === null) return null
    const sim = this.sim
    const t = sim.towers.find((x) => x.id === this.selected)
    if (!t) {
      this.selected = null
      return null
    }
    const options: UpgradeOption[] = t.def.upgrades
      .filter((u) => canPurchase(t.def, t.upgrades, u.id))
      .map((u) => {
        const check = sim.canUpgrade(t, u.id)
        const cost = sim.upgradeCostOf(t, u.id)
        return {
          id: u.id,
          tier: u.tier,
          branch: u.branch,
          name: u.name,
          description: u.description,
          cost,
          affordable: sim.gold >= cost,
          allowed: check.ok || (!check.ok && check.reason === 'Not enough gold.'),
          reason: check.ok ? null : check.reason,
        }
      })
    const keys = ['damage', 'rate', 'range', 'splash', 'chains', 'pierce', 'slowPct', 'burnDps', 'poisonDps', 'buffDamage', 'buffRate', 'buffRange', 'income', 'auraSlowPct']
    return {
      id: t.id,
      towerId: t.def.id,
      name: t.def.name,
      category: t.def.category,
      level: t.level,
      upgrades: t.upgrades,
      kills: t.kills,
      damage: t.damageDealt,
      targetMode: t.targetMode,
      sellValue: sim.sellValueOf(t),
      canSell: !sim.hasRule('noSell'),
      stats: keys
        .filter((k) => (t.base[k] ?? 0) > 0)
        .map((k) => ({ key: k, value: k === 'damage' ? (t.base[k] ?? 0) * t.dmgMul : k === 'rate' ? (t.base[k] ?? 0) * t.rateMul : k === 'range' ? sim.towerSystem.range(t) : t.base[k] ?? 0 })),
      options,
      synergies: t.synergies,
      stunned: t.stunUntil > sim.time,
    }
  }

  // ------------------------------------------------------------------------------------------------ Commands (from the HUD)

  selectBuild(towerId: string | null): void {
    this.buildSelection = this.buildSelection === towerId ? null : towerId
    this.selected = null
    this.targeting = false
    this.touchGhost = null
    this.renderer.selectedTower = null
    this.renderer.ghost = null
    this.renderer.interactionPreview = null
    this.publish()
  }

  deselect(): void {
    this.buildSelection = null
    this.selected = null
    this.targeting = false
    this.renderer.selectedTower = null
    this.renderer.ghost = null
    this.renderer.interactionPreview = null
    this.publish()
  }

  upgrade(upgradeId: string): void {
    if (this.selected === null) return
    const result = this.sim.perform({ type: 'upgrade', id: this.selected, upgrade: upgradeId })
    if (!result.ok) this.toast(result.reason, 'warn')
    this.publish()
  }

  sell(): void {
    if (this.selected === null) return
    const result = this.sim.perform({ type: 'sell', id: this.selected })
    if (!result.ok) this.toast(result.reason, 'warn')
    else this.deselect()
    this.publish()
  }

  setTargetMode(mode: TargetMode): void {
    if (this.selected === null) return
    this.sim.perform({ type: 'target', id: this.selected, mode })
    this.publish()
  }

  callWave(): void {
    const result = this.sim.perform({ type: 'callWave' })
    if (!result.ok) this.toast(result.reason, 'warn')
    this.publish()
  }

  beginInteraction(): void {
    if (this.sim.time < this.sim.interactionReadyAt) return
    this.targeting = !this.targeting
    this.buildSelection = null
    this.renderer.ghost = null
    this.publish()
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(1, Math.min(this.maxSpeed, speed))
    this.publish()
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) void this.save()
    this.publish()
  }

  togglePause(): void {
    this.setPaused(!this.paused)
  }

  // ------------------------------------------------------------------------------------------------ Input

  private bindInput(): void {
    const canvas = this.renderer.app.canvas
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts)
      this.cleanup.push(() => el.removeEventListener(type, fn as EventListener, opts))
    }
    const local = (e: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    on(canvas, 'pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId)
      const p = local(e)
      this.pointers.set(e.pointerId, { ...p, startX: p.x, startY: p.y, moved: false })
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y)
      }
    })
    on(canvas, 'pointermove', (e) => {
      const p = local(e)
      const tracked = this.pointers.get(e.pointerId)
      if (tracked) {
        const dx = p.x - tracked.x
        const dy = p.y - tracked.y
        if (Math.hypot(p.x - tracked.startX, p.y - tracked.startY) > 8) tracked.moved = true
        if (this.pointers.size === 2) {
          const [a, b] = [...this.pointers.values()]
          tracked.x = p.x
          tracked.y = p.y
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (this.pinchDistance > 0) this.renderer.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / this.pinchDistance)
          this.pinchDistance = d
          return
        }
        if (tracked.moved) this.renderer.panBy(dx, dy)
        tracked.x = p.x
        tracked.y = p.y
      }
      if (e.pointerType === 'mouse') this.hover(p.x, p.y)
    })
    const end = (e: PointerEvent) => {
      const tracked = this.pointers.get(e.pointerId)
      this.pointers.delete(e.pointerId)
      if (this.pointers.size < 2) this.pinchDistance = 0
      if (tracked && !tracked.moved && e.type === 'pointerup') this.tap(tracked.x, tracked.y, e.pointerType)
    }
    on(canvas, 'pointerup', end)
    on(canvas, 'pointercancel', end)
    on(canvas, 'pointerleave', () => {
      if (this.buildSelection && !this.touchGhost) this.renderer.ghost = null
      this.renderer.interactionPreview = this.targeting ? this.renderer.interactionPreview : null
    })
    on(canvas, 'wheel', (e) => {
      e.preventDefault()
      const p = local(e)
      this.renderer.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12)
    }, { passive: false })
    on(canvas, 'contextmenu', (e) => {
      e.preventDefault()
      this.deselect()
    })
    on(window, 'keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'Escape') this.deselect()
      else if (e.key === ' ') {
        e.preventDefault()
        this.togglePause()
      } else if (e.key === 'n' || e.key === 'N') this.callWave()
      else if (['1', '2', '3'].includes(e.key)) this.setSpeed(Number(e.key))
    })
    on(window, 'resize', () => this.renderer.resize())
    const onVisibility = () => {
      if (document.hidden && this.sim.outcome === 'playing') this.setPaused(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    this.cleanup.push(() => document.removeEventListener('visibilitychange', onVisibility))
  }

  private hover(x: number, y: number): void {
    const w = this.renderer.screenToWorld(x, y)
    if (this.targeting) {
      this.renderer.interactionPreview = { pos: w, radius: this.sim.config.map.interaction.params.radius ?? 2 }
      return
    }
    if (!this.buildSelection) return
    this.showGhost(Math.floor(w.x), Math.floor(w.y))
  }

  private showGhost(cx: number, cy: number): void {
    const def = this.content.towers.get(this.buildSelection!)!
    if (!this.sim.grid.inBounds(cx, cy)) {
      this.renderer.ghost = null
      return
    }
    const check = this.sim.canBuildAt(def.id, cx, cy)
    this.renderer.ghost = { tower: def, cell: { x: cx, y: cy }, valid: check.ok, range: def.stats.range ?? 0 }
  }

  private tap(x: number, y: number, pointerType: string): void {
    const w = this.renderer.screenToWorld(x, y)
    const cx = Math.floor(w.x)
    const cy = Math.floor(w.y)

    if (this.targeting) {
      const result = this.sim.perform({ type: 'interact', x: w.x, y: w.y })
      if (!result.ok) this.toast(result.reason, 'warn')
      this.targeting = false
      this.renderer.interactionPreview = null
      this.publish()
      return
    }

    if (this.buildSelection) {
      // Touch: first tap previews, a second tap on the same cell confirms.
      if (pointerType === 'touch' && (!this.touchGhost || this.touchGhost.x !== cx || this.touchGhost.y !== cy)) {
        this.touchGhost = { x: cx, y: cy }
        this.showGhost(cx, cy)
        return
      }
      const result = this.sim.perform({ type: 'build', tower: this.buildSelection, x: cx, y: cy })
      if (!result.ok) {
        this.toast(result.reason, 'warn')
      } else {
        this.touchGhost = null
        const def = this.content.towers.get(this.buildSelection)!
        if (this.sim.gold < this.sim.costOf(def)) this.buildSelection = null
      }
      this.renderer.ghost = null
      if (this.buildSelection && pointerType === 'mouse') this.showGhost(cx, cy)
      this.publish()
      return
    }

    const tower = this.sim.grid.inBounds(cx, cy) ? this.sim.towers.find((t) => t.cell.x === cx && t.cell.y === cy) : undefined
    this.selected = tower ? tower.id : null
    this.renderer.selectedTower = this.selected
    this.publish()
  }

  // ------------------------------------------------------------------------------------------------ Persistence

  private summary(): string {
    const s = this.sim
    return `${s.config.level.name} · wave ${Math.max(1, s.waveIndex + 1)}/${s.waveCount}`
  }

  async save(): Promise<void> {
    if (this.options.offline || this.sim.outcome !== 'playing' || this.sim.log.length === 0) return
    try {
      const saved = await putSave(AUTOSAVE_SLOT, {
        sessionId: this.session.sessionId,
        tick: this.sim.tickCount,
        actions: this.sim.log,
        summary: this.summary(),
        expectedVersion: null,
      })
      this.saveVersion = saved.version
      useHud.setState({ lastSaved: Date.now() })
    } catch {
      // Autosave is best-effort; the run itself is unaffected.
    }
  }

  private async submit(): Promise<void> {
    if (this.options.offline) return
    useHud.setState({ submitting: true, error: null })
    const payload = this.sim.result()
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await completeSession(this.session, this.sim.log, payload)
        useHud.setState({ submitting: false, result })
        return
      } catch (error) {
        const retryable = !(error instanceof ApiError) || error.status >= 500
        if (!retryable || attempt === 2) {
          useHud.setState({ submitting: false, error: (error as Error).message })
          return
        }
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      }
    }
  }

  retrySubmit(): void {
    void this.submit()
  }

  destroy(): void {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    for (const fn of this.cleanup) fn()
    this.audio.destroy()
    this.renderer.destroy()
    void this.saveVersion
  }
}
