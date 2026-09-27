import { dist } from './math'
import type { ActionResult, Simulation } from './simulation'
import type { EnemyState, TowerState, Vec } from './types'

/**
 * Map-specific rules and the player's environmental interaction. Intervals shrink and damage grows with the level's
 * mechanic intensity, so later variants of a map are harsher.
 */
export class MechanicsSystem {
  private readonly kind: string
  private readonly p: Record<string, number>
  private readonly intensity: number
  private readonly special: number[]
  private readonly gates: number[]
  private timer = 0
  private active = false
  private activeUntil = 0
  private gatesClosed = false
  private specialClosed = false
  private jamUntil = 0
  private flareUntil = 0
  private conveyorReversedUntil = 0
  private conveyorReverseMul = 1
  private readonly counts = new Map<number, number>()
  private overchargeZones: { pos: Vec; radius: number; until: number; rateMul: number }[] = []

  private readonly sim: Simulation

  constructor(sim: Simulation) {
    this.sim = sim
    const map = sim.config.map
    this.kind = map.mechanic.kind
    this.p = map.mechanic.params
    this.intensity = Math.min(1.5, Math.max(0.5, sim.config.level.mechanicIntensity))
    this.special = sim.grid.cellsOf('~')
    this.gates = sim.grid.cellsOf('G')
    if (this.kind === 'rotatingTurntable') this.setSpecialClosed(true)
  }

  private get interval(): number {
    return (this.p.interval ?? 20) / this.intensity
  }

  private scaled(value: number | undefined): number {
    return (value ?? 0) * this.intensity
  }

  // ------------------------------------------------------------------------------------------------ Gates

  private setGatesClosed(closed: boolean): void {
    if (this.gatesClosed === closed || this.gates.length === 0) return
    this.gatesClosed = closed
    for (const c of this.gates) this.sim.grid.closed[c] = closed ? 1 : 0
    this.sim.grid.rebuild()
    this.sim.emit({ type: 'mechanic', kind: 'gates', active: closed })
  }

  private setSpecialClosed(closed: boolean): void {
    if (this.specialClosed === closed || this.special.length === 0) return
    this.specialClosed = closed
    for (const c of this.special) this.sim.grid.closed[c] = closed ? 1 : 0
    this.sim.grid.rebuild()
  }

  private toggleGates(): void {
    if (this.kind === 'rotatingTurntable') {
      const next = !this.gatesClosed
      this.setGatesClosed(next)
      this.setSpecialClosed(!next)
    } else {
      this.setGatesClosed(!this.gatesClosed)
    }
  }

  private onSpecial(e: EnemyState): boolean {
    return !e.air && this.sim.grid.charAt(this.sim.grid.cellOf(e.pos)) === '~'
  }

  private onGate(e: EnemyState): boolean {
    return !e.air && this.sim.grid.charAt(this.sim.grid.cellOf(e.pos)) === 'G'
  }

  // ------------------------------------------------------------------------------------------------ Tick

  update(): void {
    const sim = this.sim
    const t = sim.time
    const dt = sim.dt
    this.overchargeZones = this.overchargeZones.filter((z) => z.until > t)

    switch (this.kind) {
      case 'trainCrossing':
        this.cycle(this.p.duration, () => {
          this.setGatesClosed(true)
          this.strikeGates(this.scaled(this.p.damage))
        }, () => this.setGatesClosed(false))
        if (this.active) this.strikeGates(this.scaled(this.p.damage) * dt)
        break
      case 'steamVents':
        this.cycle(this.p.duration)
        if (this.active) {
          for (const e of sim.enemies) if (e.alive && this.onSpecial(e)) sim.damage(e, this.scaled(this.p.dps) * dt, 'fire', null, { ignoreArmor: true, dot: true, mechanic: true })
        }
        break
      case 'drawbridge':
      case 'floodgates':
      case 'rotatingTurntable':
        this.timer += dt
        if (this.timer >= this.interval) {
          this.timer = 0
          this.toggleGates()
        }
        break
      case 'tides':
        this.cycle(this.p.duration, () => this.setSpecialClosed(true), () => this.setSpecialClosed(false))
        break
      case 'freezing':
      case 'aetherSurge':
        this.cycle(this.p.duration)
        break
      case 'magneticPulse':
        this.cycle(this.p.duration, () => {
          if (this.p.ballisticJam) this.jamUntil = t + 1
        })
        break
      case 'lightningRods':
        this.every(() => {
          for (const rod of this.special) {
            const c = sim.grid.center(rod)
            sim.emit({ type: 'lightning', points: [{ x: c.x, y: c.y - 3 }, c], strong: true })
            for (const e of sim.enemies) {
              if (e.alive && dist(e.pos, c) <= (this.p.radius ?? 1.2)) sim.damage(e, this.scaled(this.p.damage), 'electric', null, { mechanic: true })
            }
          }
        })
        break
      case 'emberRain':
        this.every(() => {
          const pool = sim.enemies.filter((e) => e.alive)
          for (let i = 0; i < (this.p.strikes ?? 3) && pool.length > 0; i++) {
            const e = sim.rng.pick(pool)!
            sim.emit({ type: 'impact', pos: { ...e.pos }, radius: 0.6, damageType: 'fire', kind: 'ember' })
            sim.damage(e, this.scaled(this.p.damage), 'fire', null, { mechanic: true })
          }
        })
        break
      case 'pressureValves':
        this.every(() => {
          for (const e of sim.enemies) if (e.alive && this.onSpecial(e)) sim.pushBack(e, this.p.pushback ?? 1.5)
          sim.emit({ type: 'mechanic', kind: 'pressureValves', active: true })
        })
        break
    }
  }

  /** A repeating "idle for interval, active for duration" cycle. */
  private cycle(duration: number | undefined, onStart?: () => void, onEnd?: () => void): void {
    const t = this.sim.time
    if (this.active) {
      if (t >= this.activeUntil) {
        this.active = false
        this.timer = 0
        onEnd?.()
        this.sim.emit({ type: 'mechanic', kind: this.kind, active: false })
      }
      return
    }
    this.timer += this.sim.dt
    if (this.timer >= this.interval) this.startActive(duration ?? 3, onStart)
  }

  private startActive(duration: number, onStart?: () => void): void {
    this.active = true
    this.activeUntil = this.sim.time + duration
    onStart?.()
    this.sim.emit({ type: 'mechanic', kind: this.kind, active: true })
  }

  private every(fn: () => void): void {
    this.timer += this.sim.dt
    if (this.timer >= this.interval) {
      this.timer = 0
      fn()
    }
  }

  private strikeGates(amount: number): void {
    for (const e of this.sim.enemies) {
      if (e.alive && this.onGate(e)) this.sim.damage(e, amount, 'force', null, { mechanic: true })
    }
  }

  // ------------------------------------------------------------------------------------------------ Queries

  speedFactor(e: EnemyState): number {
    let f = 1
    if (!e.air && this.onSpecial(e)) {
      if (this.kind === 'floodgates' || this.kind === 'freezing') f *= 1 - (this.p.slowPct ?? 0.3)
      if (this.kind === 'conveyor') f *= this.conveyorReversedUntil > this.sim.time ? this.conveyorReverseMul : this.p.speedMul ?? 1.5
    }
    if (this.kind === 'freezing' && this.active) f *= 1 - (this.p.globalSlowPct ?? 0)
    if (this.kind === 'magneticPulse' && this.active && e.air) f *= 1 - (this.p.airSlowPct ?? 0.5)
    return f
  }

  rangeMul(): number {
    if (this.flareUntil > this.sim.time) return 1
    return this.kind === 'darkness' || this.kind === 'smog' ? this.p.rangeMul ?? 0.8 : 1
  }

  towerRateMul(tower: TowerState): number {
    let f = 1
    for (const z of this.overchargeZones) if (dist(z.pos, tower.pos) <= z.radius) f = Math.max(f, z.rateMul)
    return f
  }

  towerDamageMul(tower: TowerState): number {
    if (this.kind === 'aetherSurge' && this.active && this.nearSpecial(tower.pos, this.p.radius ?? 1.5)) return this.p.damageMul ?? 1.3
    if (this.kind === 'lightningRods' && tower.def.category === 'electrical' && this.nearSpecial(tower.pos, 2)) return 1 + (this.p.electricBuff ?? 0.2)
    return 1
  }

  isJammed(tower: TowerState): boolean {
    return this.jamUntil > this.sim.time && tower.def.category === 'ballistic'
  }

  private nearSpecial(pos: Vec, radius: number): boolean {
    return this.special.some((c) => dist(this.sim.grid.center(c), pos) <= radius)
  }

  rollCloak(): boolean {
    return this.kind === 'smog' && this.sim.rng.chance(this.p.cloakChance ?? 0)
  }

  /** Crumbling floor: a special tile collapses once enough enemies cross it, if routes survive the collapse. */
  onEnterCell(e: EnemyState, cell: number): void {
    if (this.kind !== 'crumblingFloor' || e.air || this.sim.grid.charAt(cell) !== '~' || this.sim.grid.crumbled[cell]) return
    const n = (this.counts.get(cell) ?? 0) + 1
    this.counts.set(cell, n)
    if (n < (this.p.threshold ?? 30) / this.intensity) return
    const grid = this.sim.grid
    grid.crumbled[cell] = 1
    if (grid.routesIntact(-1) && !this.sim.enemies.some((o) => o.alive && !o.air && o !== e && grid.cellOf(o.pos) === cell)) {
      grid.rebuild()
      this.sim.emit({ type: 'impact', pos: grid.center(cell), radius: 0.7, damageType: 'force', kind: 'collapse' })
    } else {
      grid.crumbled[cell] = 0
      this.counts.set(cell, -Infinity)
    }
  }

  get state(): { active: boolean; gatesClosed: boolean; specialClosed: boolean; flare: boolean } {
    return { active: this.active, gatesClosed: this.gatesClosed, specialClosed: this.specialClosed, flare: this.flareUntil > this.sim.time }
  }

  // ------------------------------------------------------------------------------------------------ Interaction

  get cooldown(): number {
    return this.sim.config.map.interaction.cooldown * this.sim.econ.cooldownMul
  }

  interact(x: number, y: number): ActionResult {
    const sim = this.sim
    const t = sim.time
    if (sim.hasRule('noInteraction')) return { ok: false, reason: 'Map interactions are disabled in this challenge.' }
    if (t < sim.interactionReadyAt) return { ok: false, reason: 'Still recharging.' }
    if (!Number.isFinite(x) || !Number.isFinite(y) || !sim.grid.inBounds(Math.floor(x), Math.floor(y))) {
      return { ok: false, reason: 'Out of bounds.' }
    }
    const spec = sim.config.map.interaction
    const p = spec.params
    const pos = { x, y }
    const radius = p.radius ?? 2
    const inRadius = (e: EnemyState) => e.alive && dist(e.pos, pos) <= radius + e.def.size * 0.5

    switch (spec.kind) {
      case 'trainNow':
        if (this.kind === 'trainCrossing' && !this.active) {
          this.startActive(this.p.duration ?? 3, () => this.setGatesClosed(true))
          this.timer = 0
        }
        this.strikeGates(p.damage)
        break
      case 'ventBlast':
      case 'cargoDrop':
        for (const e of sim.enemies) if (inRadius(e)) sim.damage(e, p.damage, spec.kind === 'ventBlast' ? 'fire' : 'force', null, { mechanic: true })
        break
      case 'flare':
        this.flareUntil = t + p.duration
        for (const e of sim.enemies) if (inRadius(e)) e.revealedUntil = t + p.duration
        break
      case 'floodRelease':
        for (const e of sim.enemies) {
          if (!e.alive || !this.onSpecial(e)) continue
          sim.damage(e, p.damage, 'force', null, { mechanic: true })
          if (!e.def.immune.includes('slow')) {
            e.status.slowPct = Math.max(e.status.slowPct, p.slowPct)
            e.status.slowUntil = t + p.duration
          }
        }
        break
      case 'freezeBlast':
        for (const e of sim.enemies) if (inRadius(e) && !e.def.immune.includes('stasis')) e.status.stasisUntil = t + p.duration
        break
      case 'magnetYank':
        for (const e of sim.enemies) {
          if (!inRadius(e) || !e.air) continue
          e.status.groundedUntil = t + p.duration
          if (!e.def.immune.includes('slow')) {
            e.status.slowPct = Math.max(e.status.slowPct, 0.5)
            e.status.slowUntil = t + p.duration
          }
        }
        break
      case 'empPulse':
        for (const e of sim.enemies) if (inRadius(e) && !e.def.immune.includes('stun')) e.status.stunUntil = t + p.duration
        break
      case 'overchargeTowers':
        this.overchargeZones.push({ pos, radius, until: t + p.duration, rateMul: p.rateMul })
        break
      case 'toggleGates':
        this.toggleGates()
        this.timer = 0
        break
      case 'reverseConveyor':
        this.conveyorReversedUntil = t + p.duration
        this.conveyorReverseMul = p.speedMul
        break
      default:
        return { ok: false, reason: 'This map has no interaction.' }
    }

    sim.interactionReadyAt = t + this.cooldown
    sim.stats.interactionsUsed++
    sim.emit({ type: 'interaction', kind: spec.kind, pos, radius })
    return { ok: true }
  }
}
