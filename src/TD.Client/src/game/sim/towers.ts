import type { AbilitySpec, DamageType } from '../../api/types'
import { dist } from './math'
import type { Simulation } from './simulation'
import type { EnemyState, GroundZone, Projectile, TowerState, TowerStats, Vec } from './types'

interface AuraBuff {
  dmg: number
  rate: number
  range: number
  protect: boolean
}

const MAX_ZONES_PER_TOWER = 4

/** Tower targeting, attacks, projectiles, mines, ground effects and support auras. */
export class TowerSystem {
  private auras = new Map<number, AuraBuff>()
  private readonly sim: Simulation

  constructor(sim: Simulation) {
    this.sim = sim
  }

  // ------------------------------------------------------------------------------------------------ Auras

  /** Static support-tower contributions, recomputed whenever towers change. */
  recomputeAuras(): void {
    this.auras.clear()
    const supports = this.sim.towers.filter((t) => t.def.attack === 'support')
    for (const tower of this.sim.towers) {
      const buff: AuraBuff = { dmg: 0, rate: 0, range: 0, protect: false }
      for (const s of supports) {
        if (s === tower || dist(s.pos, tower.pos) > (s.base.range ?? 0)) continue
        buff.dmg += s.base.buffDamage ?? 0
        buff.rate += s.base.buffRate ?? 0
        buff.range += s.base.buffRange ?? 0
        buff.protect ||= (s.base.buffProtect ?? 0) > 0
      }
      buff.dmg = Math.min(1, buff.dmg)
      buff.rate = Math.min(1, buff.rate)
      buff.range = Math.min(0.6, buff.range)
      this.auras.set(tower.id, buff)
      tower.protected = buff.protect
    }
  }

  auraExposeAt(e: EnemyState): number {
    let total = 0
    for (const t of this.sim.towers) {
      const v = t.base.auraExposePct ?? 0
      if (v > 0 && dist(t.pos, e.pos) <= this.range(t)) total += v
    }
    return Math.min(0.6, total)
  }

  auraBountyAt(pos: Vec): number {
    let total = 0
    for (const t of this.sim.towers) {
      const v = t.base.auraBounty ?? 0
      if (v > 0 && dist(t.pos, pos) <= this.range(t)) total += v
    }
    return Math.min(0.5, total)
  }

  interestBonus(): number {
    return this.sim.towers.reduce((sum, t) => sum + (t.base.interestBonus ?? 0), 0)
  }

  waveIncome(): number {
    return Math.round(this.sim.towers.reduce((sum, t) => sum + (t.base.income ?? 0), 0) * this.sim.config.modifiers.economy)
  }

  stunTowersNear(pos: Vec, radius: number, duration: number): void {
    const until = this.sim.time + duration
    for (const t of this.sim.towers) {
      if (t.protected || dist(t.pos, pos) > radius) continue
      if (t.stunUntil < until) {
        t.stunUntil = until
        this.sim.emit({ type: 'towerStunned', tower: t.id, duration })
      }
    }
  }

  range(t: TowerState): number {
    return (t.base.range ?? 0) * t.rangeMul
  }

  // ------------------------------------------------------------------------------------------------ Tick

  update(): void {
    const sim = this.sim
    const t = sim.time
    const debuffers = sim.enemies.filter((e) => e.alive && e.abilities.some((a) => a.kind === 'drain' || a.kind === 'smokeScreen'))

    for (const tower of sim.towers) {
      const aura = this.auras.get(tower.id) ?? { dmg: 0, rate: 0, range: 0, protect: false }
      const overcharged = tower.overchargeUntil > t
      let rateMul = (1 + aura.rate) * (overcharged ? tower.overchargeRate : 1) * sim.mechanics.towerRateMul(tower)
      let rangeMul = (1 + aura.range) * sim.mechanics.rangeMul() * (1 - 0.25 * sim.config.modifiers.fog)
      if (!tower.protected) {
        for (const e of debuffers) {
          for (const a of e.abilities) {
            if (dist(e.pos, tower.pos) > a.params.radius) continue
            if (a.kind === 'drain') rateMul *= a.params.rateMul
            if (a.kind === 'smokeScreen') rangeMul *= a.params.rangeMul
          }
        }
      }
      tower.rateMul = rateMul
      tower.rangeMul = rangeMul
      tower.dmgMul = (1 + aura.dmg) * (overcharged ? tower.overchargeDamage : 1) * sim.mechanics.towerDamageMul(tower)
      tower.jammed = sim.mechanics.isJammed(tower)
    }

    this.updateReveal()
    for (const tower of sim.towers) {
      if (tower.stunUntil > t || tower.jammed) {
        tower.beamTargets = []
        continue
      }
      this.updateAbilities(tower)
      this.attack(tower)
    }
    this.updateProjectiles()
    this.updateMines()
    this.updateZones()
  }

  private updateReveal(): void {
    const sim = this.sim
    const until = sim.time + sim.dt * 2
    for (const tower of sim.towers) {
      const revealer = (tower.base.reveal ?? 0) > 0
      const grounder = (tower.base.groundAir ?? 0) > 0
      if (!revealer && !grounder) continue
      const r = this.range(tower)
      for (const e of sim.enemies) {
        if (!e.alive || dist(e.pos, tower.pos) > r) continue
        if (revealer && e.cloaked) e.revealedUntil = until
        if (grounder && e.air) e.status.groundedUntil = until
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ Targeting

  canTarget(tower: TowerState, e: EnemyState): boolean {
    const sim = this.sim
    if (!e.alive) return false
    const phaseHunter = (tower.base.hitsPhased ?? 0) > 0
    if (!phaseHunter) {
      if (sim.isBurrowed(e)) return false
      if (e.cloaked && e.revealedUntil <= sim.time) return false
    }
    const targets = tower.def.targets
    if (targets === 'both') return true
    if (targets === 'air') return e.air
    return sim.isGrounded(e)
  }

  private candidates(tower: TowerState, range: number, minRange = 0): EnemyState[] {
    const out: EnemyState[] = []
    for (const e of this.sim.enemies) {
      if (!this.canTarget(tower, e)) continue
      const d = dist(e.pos, tower.pos)
      if (d <= range + e.def.size * 0.5 && d >= minRange) out.push(e)
    }
    return out
  }

  /** Enemies carrying cores toward an exit are always the most urgent. */
  private priority(tower: TowerState, e: EnemyState): number {
    const urgency = e.goal === 'toExit' && e.carrying > 0 ? -10000 : 0
    switch (tower.targetMode) {
      case 'first':
        return urgency + e.progress
      case 'last':
        return urgency - e.progress
      case 'strong':
        return urgency - e.hp
      case 'weak':
        return urgency + e.hp
      case 'close':
        return urgency + dist(e.pos, tower.pos)
    }
  }

  private selectTargets(tower: TowerState, count: number, range: number, minRange = 0): EnemyState[] {
    const list = this.candidates(tower, range, minRange)
    if (list.length <= 1) return list
    const scored = list.map((e) => ({ e, p: this.priority(tower, e) }))
    scored.sort((a, b) => a.p - b.p || a.e.id - b.e.id)
    return scored.slice(0, count).map((s) => s.e)
  }

  // ------------------------------------------------------------------------------------------------ Attacks

  private attack(tower: TowerState): void {
    const sim = this.sim
    const kind = tower.def.attack
    if (kind === 'support' || kind === 'economy') return
    if (kind === 'beam') {
      this.beam(tower)
      return
    }
    if (kind === 'field') this.fieldAura(tower)

    const rate = (tower.base.rate ?? 0) * tower.rateMul
    if (rate <= 0) return
    tower.cooldown -= sim.dt
    if (tower.cooldown > 0) return

    const range = this.range(tower)
    const split = this.ability(tower, 'splitShot')?.params.count ?? 1
    const minRange = tower.base.minRange ?? 0

    if (kind === 'mine') {
      if (this.placeMine(tower)) tower.cooldown += 1 / rate
      else tower.cooldown = 0
      return
    }

    const targets = kind === 'pulse' || kind === 'field' ? this.candidates(tower, range) : this.selectTargets(tower, split, range, minRange)
    if (targets.length === 0) {
      tower.cooldown = 0
      return
    }
    tower.cooldown += 1 / rate
    tower.targetId = targets[0].id
    tower.aim = Math.atan2(targets[0].pos.y - tower.pos.y, targets[0].pos.x - tower.pos.x)

    const shot = this.rollShot(tower)
    switch (kind) {
      case 'projectile':
      case 'lob':
        for (const target of targets) this.launch(tower, target, shot)
        break
      case 'hitscan':
        for (const target of targets) this.hitscan(tower, target, shot)
        break
      case 'chain':
        for (const target of targets) this.chain(tower, target, shot)
        break
      case 'cone':
        this.cone(tower, targets[0], shot)
        break
      case 'pulse':
      case 'field':
        this.pulse(tower, targets, shot)
        break
    }
  }

  private ability(tower: TowerState, kind: string): AbilitySpec | undefined {
    return tower.abilities.find((a) => a.kind === kind)
  }

  /** Damage, crit and every-Nth bonuses for one attack. */
  private rollShot(tower: TowerState): { damage: number; crit: boolean; nth: boolean; stun: number; splash: number } {
    const sim = this.sim
    tower.attackCount++
    let damage = (tower.base.damage ?? 0) * tower.dmgMul
    const crit = sim.rng.chance(tower.base.critChance ?? 0)
    if (crit) damage *= 1 + (tower.base.critMul ?? 1)
    const nthAbility = this.ability(tower, 'everyNth')
    const nth = !!nthAbility && tower.attackCount % nthAbility.params.n === 0
    let stun = 0
    let splash = tower.base.splash ?? 0
    if (nth && nthAbility) {
      damage *= nthAbility.params.damageMul
      stun = nthAbility.params.stunDuration ?? 0
      splash = Math.max(splash, nthAbility.params.splash ?? 0)
    }
    return { damage, crit, nth, stun, splash }
  }

  /** On-hit effects shared by every attack kind. */
  applyEffects(stats: TowerStats, e: EnemyState, sourceId: number, extraStun = 0): void {
    const sim = this.sim
    if (!e.alive) return
    const t = sim.time
    const s = e.status
    const immune = e.def.immune
    if ((stats.slowPct ?? 0) > 0 && !immune.includes('slow')) {
      if (stats.slowPct >= s.slowPct || s.slowUntil <= t) s.slowPct = stats.slowPct
      s.slowUntil = Math.max(s.slowUntil, t + (stats.slowDuration ?? 1))
    }
    const stunDuration = Math.max(extraStun, sim.rng.chance(stats.stunChance ?? 0) ? stats.stunDuration ?? 0.5 : 0, sim.rng.chance(stats.shockChance ?? 0) ? stats.stunDuration ?? 0.4 : 0)
    if (stunDuration > 0 && !immune.includes('stun') && !immune.includes('shock')) s.stunUntil = Math.max(s.stunUntil, t + stunDuration)
    if ((stats.burnDps ?? 0) > 0 && !immune.includes('burn')) {
      s.burnDps = Math.max(s.burnUntil > t ? s.burnDps : 0, stats.burnDps)
      s.burnUntil = t + (stats.burnDuration ?? 2)
      s.burnSource = sourceId
    }
    if ((stats.poisonDps ?? 0) > 0 && !immune.includes('poison')) {
      s.poisonDps = Math.max(s.poisonUntil > t ? s.poisonDps : 0, stats.poisonDps)
      s.poisonUntil = t + (stats.poisonDuration ?? 3)
      s.poisonSource = sourceId
    }
    if ((stats.corrodePerHit ?? 0) > 0) s.corrode = Math.min(Math.max(s.corrode, stats.corrodeMax ?? 0), s.corrode + stats.corrodePerHit)
    if ((stats.exposePct ?? 0) > 0) {
      s.exposePct = Math.max(s.exposeUntil > t ? s.exposePct : 0, stats.exposePct)
      s.exposeUntil = t + (stats.exposeDuration ?? 2)
    }
    const push = (stats.pullDistance ?? 0) + (stats.knockback ?? 0)
    if (push > 0 && !e.def.isBoss) sim.pushBack(e, push)
  }

  private hit(tower: TowerState, stats: TowerStats, e: EnemyState, damage: number, type: DamageType, crit: boolean, stun = 0): void {
    this.sim.damage(e, damage, type, tower, { crit })
    this.applyEffects(stats, e, tower.id, stun)
  }

  private launch(tower: TowerState, target: EnemyState, shot: ReturnType<TowerSystem['rollShot']>): void {
    const sim = this.sim
    const isLob = tower.def.attack === 'lob'
    const pierce = tower.base.pierce ?? 0
    const speed = tower.base.projectileSpeed ?? (isLob ? 5 : 12)
    const kind: Projectile['kind'] = isLob
      ? 'lob'
      : pierce > 0
        ? 'blade'
        : tower.def.damageType === 'chemical'
          ? 'glob'
          : tower.def.category === 'experimental'
            ? 'orb'
            : tower.def.damageType === 'force'
              ? 'shell'
              : 'bullet'
    let aimPoint = { ...target.pos }
    let flightTime = 0
    if (isLob) {
      // Lead the target by the flight time along its current heading.
      const d = dist(tower.pos, target.pos)
      flightTime = Math.max(0.6, d / speed)
      const s = target.speed * (target.status.slowUntil > sim.time ? 1 - target.status.slowPct : 1) * flightTime * 0.8
      aimPoint = { x: target.pos.x + Math.cos(target.heading) * s, y: target.pos.y + Math.sin(target.heading) * s }
    }
    const p: Projectile = {
      id: sim.newId(),
      tower: tower.id,
      kind,
      pos: { ...tower.pos },
      prev: { ...tower.pos },
      origin: { ...tower.pos },
      target: aimPoint,
      targetId: target.id,
      speed,
      damage: shot.damage,
      damageType: tower.def.damageType,
      splash: shot.splash,
      pierceLeft: pierce,
      bouncesLeft: tower.def.attack === 'projectile' ? Math.round(tower.base.chains ?? 0) : 0,
      hit: [],
      stats: { ...tower.base, stunExtra: shot.stun },
      flight: 0,
      flightTime,
      arcHeight: isLob ? Math.min(2.5, 0.8 + dist(tower.pos, target.pos) * 0.25) : 0,
      alive: true,
      air: target.air,
      crit: shot.crit,
      nth: shot.nth,
    }
    sim.projectiles.push(p)
    sim.emit({ type: 'fire', tower: tower.id, to: aimPoint, kind: shot.nth ? `${kind}-nth` : kind })
  }

  private updateProjectiles(): void {
    const sim = this.sim
    const dt = sim.dt
    for (const p of sim.projectiles) {
      if (!p.alive) continue
      p.prev = { ...p.pos }
      const tower = sim.towerById(p.tower)

      if (p.kind === 'lob') {
        p.flight += dt
        const k = Math.min(1, p.flight / p.flightTime)
        p.pos = { x: p.origin.x + (p.target.x - p.origin.x) * k, y: p.origin.y + (p.target.y - p.origin.y) * k }
        if (k >= 1) {
          this.explode(p, tower, p.target, false)
          p.alive = false
        }
        continue
      }

      const step = p.speed * dt
      if (p.pierceLeft > 0) {
        // Piercing blades fly straight through the line, cutting each enemy once.
        const dx = p.target.x - p.origin.x
        const dy = p.target.y - p.origin.y
        const len = Math.hypot(dx, dy) || 1
        p.pos = { x: p.pos.x + (dx / len) * step, y: p.pos.y + (dy / len) * step }
        for (const e of sim.enemies) {
          if (!e.alive || p.hit.includes(e.id) || e.air !== p.air || sim.isBurrowed(e)) continue
          if (dist(e.pos, p.pos) <= e.def.size + 0.2) {
            p.hit.push(e.id)
            this.projectileHit(p, tower, e)
            if (p.hit.length > p.pierceLeft) break
          }
        }
        const travelled = dist(p.pos, p.origin)
        if (p.hit.length > p.pierceLeft || travelled > (p.stats.range ?? 4) * 1.4) {
          if (!this.bounce(p)) p.alive = false
        }
        continue
      }

      const target = sim.enemies.find((e) => e.id === p.targetId && e.alive)
      if (target) p.target = { ...target.pos }
      const d = dist(p.target, p.pos)
      const reach = target ? target.def.size * 0.5 : 0.05
      if (d <= step + reach) {
        p.pos = { ...p.target }
        if (target) {
          p.hit.push(target.id)
          this.projectileHit(p, tower, target)
          if (p.splash > 0) this.explode(p, tower, p.pos, true, target.id)
          if (!this.bounce(p)) p.alive = false
        } else {
          if (p.splash > 0) this.explode(p, tower, p.pos, true)
          p.alive = false
        }
      } else {
        p.pos = { x: p.pos.x + ((p.target.x - p.pos.x) / d) * step, y: p.pos.y + ((p.target.y - p.pos.y) / d) * step }
      }
    }
    sim.projectiles = sim.projectiles.filter((p) => p.alive)
  }

  private projectileHit(p: Projectile, tower: TowerState | null, e: EnemyState): void {
    const sim = this.sim
    const deflect = e.abilities.find((a) => a.kind === 'deflect')
    if (deflect && p.damageType === 'ballistic' && sim.rng.chance(deflect.params.chance)) {
      sim.emit({ type: 'ability', kind: 'deflect', pos: e.pos, radius: e.def.size, enemy: e.id })
      return
    }
    sim.damage(e, p.damage, p.damageType, tower, { crit: p.crit })
    this.applyEffects(p.stats, e, p.tower, p.stats.stunExtra ?? 0)
  }

  /** Ricochet to the nearest enemy not yet struck. */
  private bounce(p: Projectile): boolean {
    if (p.bouncesLeft <= 0) return false
    const reach = p.stats.chainRange ?? 1.5
    let best: EnemyState | null = null
    let bestD = Infinity
    for (const e of this.sim.enemies) {
      if (!e.alive || p.hit.includes(e.id) || this.sim.isBurrowed(e)) continue
      const d = dist(e.pos, p.pos)
      if (d <= reach && d < bestD) {
        bestD = d
        best = e
      }
    }
    if (!best) return false
    p.bouncesLeft--
    p.pierceLeft = 0
    p.targetId = best.id
    p.target = { ...best.pos }
    p.damage *= p.stats.chainFalloff ?? 0.8
    return true
  }

  private explode(p: Projectile, tower: TowerState | null, at: Vec, skipPrimary: boolean, primaryId = 0): void {
    const sim = this.sim
    const radius = Math.max(p.splash, p.kind === 'lob' ? 0.5 : 0)
    sim.emit({ type: 'impact', pos: at, radius, damageType: p.damageType, kind: p.nth ? 'big' : p.kind })
    for (const e of sim.enemies) {
      if (!e.alive || (skipPrimary && e.id === primaryId)) continue
      if (p.kind === 'lob' && e.air) continue
      if (dist(e.pos, at) <= radius + e.def.size * 0.5) {
        const falloff = skipPrimary ? 0.6 : 1
        sim.damage(e, p.damage * falloff, p.damageType, tower, { crit: p.crit })
        this.applyEffects(p.stats, e, p.tower, p.stats.stunExtra ?? 0)
      }
    }
    if (tower) this.lingering(tower, at)
  }

  private hitscan(tower: TowerState, target: EnemyState, shot: ReturnType<TowerSystem['rollShot']>): void {
    const sim = this.sim
    const range = this.range(tower)
    const dx = target.pos.x - tower.pos.x
    const dy = target.pos.y - tower.pos.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const end = { x: tower.pos.x + ux * range * 1.1, y: tower.pos.y + uy * range * 1.1 }
    const maxHits = 1 + (tower.base.pierce ?? 0)
    const struck: { e: EnemyState; along: number }[] = []
    for (const e of sim.enemies) {
      if (!this.canTarget(tower, e)) continue
      const rx = e.pos.x - tower.pos.x
      const ry = e.pos.y - tower.pos.y
      const along = rx * ux + ry * uy
      if (along < 0 || along > range * 1.1) continue
      const off = Math.abs(rx * uy - ry * ux)
      if (off <= 0.35 + e.def.size * 0.5 || e.id === target.id) struck.push({ e, along })
    }
    struck.sort((a, b) => a.along - b.along || a.e.id - b.e.id)
    sim.emit({ type: 'rail', from: tower.pos, to: end })
    sim.emit({ type: 'fire', tower: tower.id, to: end, kind: shot.nth ? 'rail-nth' : 'rail' })
    for (const { e } of struck.slice(0, maxHits)) {
      const deflect = e.abilities.find((a) => a.kind === 'deflect')
      if (deflect && tower.def.damageType === 'ballistic' && sim.rng.chance(deflect.params.chance)) continue
      this.hit(tower, tower.base, e, shot.damage, tower.def.damageType, shot.crit, shot.stun)
    }
  }

  private chain(tower: TowerState, target: EnemyState, shot: ReturnType<TowerSystem['rollShot']>): void {
    const sim = this.sim
    const chains = Math.round(tower.base.chains ?? 0)
    const reach = tower.base.chainRange ?? 1.5
    const falloff = tower.base.chainFalloff ?? 0.85
    const points: Vec[] = [{ x: tower.pos.x, y: tower.pos.y - 0.45 }, { ...target.pos }]
    const struck = new Set<number>([target.id])
    let damage = shot.damage
    this.hit(tower, tower.base, target, damage, tower.def.damageType, shot.crit, shot.stun)
    let current = target
    for (let i = 0; i < chains; i++) {
      let best: EnemyState | null = null
      let bestD = Infinity
      for (const e of sim.enemies) {
        if (struck.has(e.id) || !this.canTarget(tower, e)) continue
        const d = dist(e.pos, current.pos)
        if (d <= reach && d < bestD) {
          bestD = d
          best = e
        }
      }
      if (!best) break
      damage *= falloff
      struck.add(best.id)
      points.push({ ...best.pos })
      this.hit(tower, tower.base, best, damage, tower.def.damageType, false, shot.stun)
      current = best
    }
    sim.emit({ type: 'lightning', points, strong: shot.nth })
    sim.emit({ type: 'fire', tower: tower.id, to: target.pos, kind: 'chain' })
  }

  private cone(tower: TowerState, target: EnemyState, shot: ReturnType<TowerSystem['rollShot']>): void {
    const sim = this.sim
    const range = this.range(tower)
    const half = ((tower.base.coneAngle ?? 45) * Math.PI) / 360
    const facing = Math.atan2(target.pos.y - tower.pos.y, target.pos.x - tower.pos.x)
    for (const e of this.candidates(tower, range)) {
      const a = Math.atan2(e.pos.y - tower.pos.y, e.pos.x - tower.pos.x)
      let diff = Math.abs(a - facing)
      if (diff > Math.PI) diff = Math.PI * 2 - diff
      if (diff <= half || dist(e.pos, tower.pos) < 0.6) this.hit(tower, tower.base, e, shot.damage, tower.def.damageType, shot.crit, shot.stun)
    }
    sim.emit({ type: 'fire', tower: tower.id, to: target.pos, kind: 'cone' })
    this.lingering(tower, target.pos)
  }

  private pulse(tower: TowerState, targets: EnemyState[], shot: ReturnType<TowerSystem['rollShot']>): void {
    const sim = this.sim
    for (const e of targets) this.hit(tower, tower.base, e, shot.damage, tower.def.damageType, shot.crit, shot.stun)
    sim.emit({ type: 'impact', pos: tower.pos, radius: this.range(tower), damageType: tower.def.damageType, kind: shot.nth ? 'pulse-nth' : 'pulse' })
    sim.emit({ type: 'fire', tower: tower.id, to: tower.pos, kind: 'pulse' })
    if (targets.length > 0 && this.ability(tower, 'lingeringGround')) {
      this.lingering(tower, sim.rng.pick(targets)!.pos)
    }
  }

  /** Continuous auras from field towers: slow, and optionally drag air units low enough for ground guns. */
  private fieldAura(tower: TowerState): void {
    const sim = this.sim
    const slow = tower.base.auraSlowPct ?? 0
    if (slow <= 0) return
    const until = sim.time + sim.dt * 3
    const range = this.range(tower)
    for (const e of sim.enemies) {
      if (!e.alive || dist(e.pos, tower.pos) > range || e.def.immune.includes('slow')) continue
      const s = e.status
      if (slow >= s.slowPct || s.slowUntil <= sim.time) s.slowPct = Math.min(0.8, slow)
      s.slowUntil = Math.max(s.slowUntil, until)
    }
  }

  private beam(tower: TowerState): void {
    const sim = this.sim
    const range = this.range(tower)
    const primary = this.selectTargets(tower, 1, range)[0]
    if (!primary) {
      tower.beamTargets = []
      tower.beamTime = 0
      return
    }
    if (tower.targetId !== primary.id) tower.beamTime = 0
    tower.beamTime += sim.dt
    tower.targetId = primary.id
    tower.aim = Math.atan2(primary.pos.y - tower.pos.y, primary.pos.x - tower.pos.x)

    const rampMax = tower.base.beamRampMax ?? 0
    const ramp = rampMax > 0 ? Math.min(rampMax, 1 + (tower.base.beamRamp ?? 0) * tower.beamTime) : 1
    const perTick = (tower.base.damage ?? 0) * (tower.base.rate ?? 1) * sim.dt * tower.dmgMul * tower.rateMul * ramp
    const split = this.ability(tower, 'prismSplit')
    const extra = (split?.params.count ?? 0) + Math.round(tower.base.chains ?? 0)
    const fraction = split?.params.damageFraction ?? tower.base.chainFalloff ?? 0.6

    const targets = [primary]
    if (extra > 0) {
      const others = this.candidates(tower, range)
        .filter((e) => e.id !== primary.id)
        .sort((a, b) => dist(a.pos, primary.pos) - dist(b.pos, primary.pos) || a.id - b.id)
        .slice(0, extra)
      targets.push(...others)
    }
    tower.beamTargets = targets.map((e) => e.id)
    targets.forEach((e, i) => {
      sim.damage(e, i === 0 ? perTick : perTick * fraction, tower.def.damageType, tower, { dot: true })
      this.applyEffects(tower.base, e, tower.id)
    })
  }

  // ------------------------------------------------------------------------------------------------ Mines & zones

  private placeMine(tower: TowerState): boolean {
    const sim = this.sim
    const max = Math.round(tower.base.mineCount ?? 0)
    const own = sim.mines.filter((m) => m.tower === tower.id).length
    tower.mines = own
    if (own >= max) return false
    const range = this.range(tower)
    const cells: number[] = []
    const g = sim.grid
    for (let y = Math.floor(tower.pos.y - range); y <= Math.ceil(tower.pos.y + range); y++) {
      for (let x = Math.floor(tower.pos.x - range); x <= Math.ceil(tower.pos.x + range); x++) {
        if (!g.inBounds(x, y)) continue
        const i = g.index(x, y)
        if (g.isWalkable(i) && Number.isFinite(g.toCore.dist[i]) && dist(g.center(i), tower.pos) <= range) cells.push(i)
      }
    }
    const cell = sim.rng.pick(cells)
    if (cell === undefined) return false
    const c = g.center(cell)
    const pos = { x: c.x + (sim.rng.next() - 0.5) * 0.6, y: c.y + (sim.rng.next() - 0.5) * 0.6 }
    sim.mines.push({ id: sim.newId(), tower: tower.id, pos, armedAt: sim.time + 0.5 })
    sim.emit({ type: 'fire', tower: tower.id, to: pos, kind: 'mine' })
    return true
  }

  private updateMines(): void {
    const sim = this.sim
    const t = sim.time
    const spent = new Set<number>()
    for (const mine of sim.mines) {
      if (mine.armedAt > t) continue
      const trigger = sim.enemies.find((e) => e.alive && sim.isGrounded(e) && !sim.isBurrowed(e) && dist(e.pos, mine.pos) <= 0.45)
      if (!trigger) continue
      const tower = sim.towerById(mine.tower)
      spent.add(mine.id)
      if (!tower) continue
      const damage = (tower.base.damage ?? 0) * tower.dmgMul
      const radius = tower.base.splash ?? 0.8
      sim.emit({ type: 'impact', pos: mine.pos, radius, damageType: tower.def.damageType, kind: 'mine' })
      const struck: EnemyState[] = []
      for (const e of sim.enemies) {
        if (e.alive && sim.isGrounded(e) && dist(e.pos, mine.pos) <= radius + e.def.size * 0.5) {
          struck.push(e)
          this.hit(tower, tower.base, e, damage, tower.def.damageType, false)
        }
      }
      const chains = Math.round(tower.base.chains ?? 0)
      if (chains > 0) {
        const points: Vec[] = [mine.pos]
        let current = mine.pos
        let d = damage
        for (let i = 0; i < chains; i++) {
          const next = sim.enemies
            .filter((e) => e.alive && !struck.includes(e) && dist(e.pos, current) <= (tower.base.chainRange ?? 1.5))
            .sort((a, b) => dist(a.pos, current) - dist(b.pos, current) || a.id - b.id)[0]
          if (!next) break
          d *= tower.base.chainFalloff ?? 0.7
          struck.push(next)
          points.push(next.pos)
          this.hit(tower, tower.base, next, d, tower.def.damageType, false)
          current = next.pos
        }
        if (points.length > 1) sim.emit({ type: 'lightning', points, strong: false })
      }
    }
    if (spent.size > 0) sim.mines = sim.mines.filter((m) => !spent.has(m.id))
  }

  /** Spawns a lingering ground effect (burning oil, acid pools, radiation) if the tower has one. */
  private lingering(tower: TowerState, at: Vec): void {
    const sim = this.sim
    const spec = this.ability(tower, 'lingeringGround')
    if (!spec) return
    const own = sim.zones.filter((z) => z.tower === tower.id)
    if (own.length >= MAX_ZONES_PER_TOWER) {
      const oldest = own.reduce((a, b) => (a.until < b.until ? a : b))
      sim.zones = sim.zones.filter((z) => z !== oldest)
    }
    const type = tower.def.damageType
    const kind: GroundZone['kind'] =
      type === 'fire' ? 'fire' : type === 'chemical' ? (tower.def.id === 'acid-sprayer' ? 'acid' : 'toxic') : type === 'electric' ? 'electric' : 'radiation'
    sim.zones.push({
      id: sim.newId(),
      tower: tower.id,
      kind,
      pos: { ...at },
      radius: spec.params.radius,
      dps: spec.params.dps * tower.dmgMul,
      slowPct: spec.params.slowPct ?? 0,
      pull: 0,
      damageType: type,
      until: sim.time + spec.params.duration,
    })
  }

  private updateZones(): void {
    const sim = this.sim
    const t = sim.time
    const dt = sim.dt
    for (const zone of sim.zones) {
      if (zone.until <= t) continue
      const tower = sim.towerById(zone.tower)
      for (const e of sim.enemies) {
        if (!e.alive) continue
        const d = dist(e.pos, zone.pos)
        if (d > zone.radius + e.def.size * 0.5) continue
        if (zone.kind !== 'singularity' && !sim.isGrounded(e)) continue
        sim.damage(e, zone.dps * dt, zone.damageType, tower, { ignoreArmor: true, dot: true })
        if (zone.slowPct > 0 && !e.def.immune.includes('slow')) {
          e.status.slowPct = Math.max(e.status.slowUntil > t ? e.status.slowPct : 0, zone.slowPct)
          e.status.slowUntil = t + 0.2
        }
        if (zone.pull > 0 && d > 0.05 && !e.def.immune.includes('pull')) {
          const step = Math.min(d, zone.pull * dt)
          e.pos = { x: e.pos.x + ((zone.pos.x - e.pos.x) / d) * step, y: e.pos.y + ((zone.pos.y - e.pos.y) / d) * step }
        }
      }
    }
    sim.zones = sim.zones.filter((z) => z.until > t)
  }

  // ------------------------------------------------------------------------------------------------ Abilities

  private updateAbilities(tower: TowerState): void {
    const sim = this.sim
    const t = sim.time
    for (const a of tower.abilities) {
      const interval = a.params.interval
      if (!interval) continue
      const charge = (tower.abilityTimers[a.kind] ?? 0) + sim.dt * tower.rateMul
      if (charge < interval) {
        tower.abilityTimers[a.kind] = charge
        continue
      }
      // Fully charged abilities wait for a worthwhile moment instead of firing into empty air.
      if (this.triggerAbility(tower, a)) tower.abilityTimers[a.kind] = 0
      else tower.abilityTimers[a.kind] = interval
    }
    void t
  }

  private triggerAbility(tower: TowerState, a: AbilitySpec): boolean {
    const sim = this.sim
    const p = a.params
    const t = sim.time
    const type = tower.def.damageType
    switch (a.kind) {
      case 'periodicPulse': {
        const targets = this.candidates(tower, p.radius)
        if (targets.length === 0) return false
        for (const e of targets) {
          sim.damage(e, p.damage * tower.dmgMul, type, tower)
          this.applyEffects({ slowPct: p.slowPct ?? 0, slowDuration: p.slowDuration ?? 0 }, e, tower.id, p.stunDuration ?? 0)
        }
        sim.emit({ type: 'ability', kind: 'periodicPulse', pos: tower.pos, radius: p.radius, tower: tower.id })
        return true
      }
      case 'mapStrike': {
        const pool = sim.enemies.filter((e) => e.alive && !sim.isBurrowed(e))
        if (pool.length === 0) return false
        for (let i = 0; i < p.strikes; i++) {
          const e = sim.rng.pick(pool)!
          if (!e.alive) continue
          sim.emit({ type: 'ability', kind: 'mapStrike', pos: { ...e.pos }, radius: 0.6, tower: tower.id })
          sim.damage(e, p.damage * tower.dmgMul, type, tower)
          this.applyEffects({}, e, tower.id, p.stunDuration ?? 0)
        }
        return true
      }
      case 'pull':
      case 'rewind': {
        const radius = a.kind === 'pull' ? p.radius : this.range(tower)
        const targets = sim.enemies.filter((e) => e.alive && dist(e.pos, tower.pos) <= radius)
        if (targets.length === 0) return false
        for (const e of targets) if (!e.def.isBoss) sim.pushBack(e, p.distance)
        sim.emit({ type: 'ability', kind: a.kind, pos: tower.pos, radius, tower: tower.id })
        return true
      }
      case 'overcharge': {
        const range = this.range(tower)
        const affected = tower.def.attack === 'support' ? sim.towers.filter((o) => o !== tower && dist(o.pos, tower.pos) <= range) : [tower]
        if (affected.length === 0 || (tower.def.attack !== 'support' && this.candidates(tower, range).length === 0)) return false
        for (const o of affected) {
          o.overchargeUntil = t + p.duration
          o.overchargeRate = p.rateMul
          o.overchargeDamage = p.damageMul
        }
        sim.emit({ type: 'ability', kind: 'overcharge', pos: tower.pos, radius: tower.def.attack === 'support' ? range : 0.6, tower: tower.id })
        return true
      }
      case 'orbital': {
        const target = this.candidates(tower, this.range(tower)).sort((x, y) => y.hp - x.hp || x.id - y.id)[0]
        if (!target) return false
        sim.emit({ type: 'ability', kind: 'orbital', pos: { ...target.pos }, radius: p.radius, tower: tower.id })
        for (const e of sim.enemies) {
          if (e.alive && dist(e.pos, target.pos) <= p.radius) sim.damage(e, (e === target ? 1 : 0.4) * p.damage * tower.dmgMul, type, tower)
        }
        return true
      }
      case 'singularity': {
        const target = this.selectTargets(tower, 1, this.range(tower))[0]
        if (!target) return false
        sim.zones.push({
          id: sim.newId(),
          tower: tower.id,
          kind: 'singularity',
          pos: { ...target.pos },
          radius: p.radius,
          dps: p.dps * tower.dmgMul,
          slowPct: 0,
          pull: p.pullStrength,
          damageType: type,
          until: t + p.duration,
        })
        sim.emit({ type: 'ability', kind: 'singularity', pos: target.pos, radius: p.radius, tower: tower.id })
        return true
      }
      case 'stasisField': {
        const targets = sim.enemies.filter((e) => e.alive && dist(e.pos, tower.pos) <= p.radius && !e.def.immune.includes('stasis'))
        if (targets.length === 0) return false
        for (const e of targets) e.status.stasisUntil = Math.max(e.status.stasisUntil, t + p.duration)
        sim.emit({ type: 'ability', kind: 'stasisField', pos: tower.pos, radius: p.radius, tower: tower.id })
        return true
      }
      default:
        return true
    }
  }
}
