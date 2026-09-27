import type { DamageType, EnemyAbility, EnemyDefinition, TowerDefinition } from '../../api/types'
import { Grid } from './grid'
import { dist } from './math'
import { MechanicsSystem } from './mechanics'
import { Rng } from './rng'
import {
  canPurchase,
  computeTower,
  economyBonuses,
  sellValue,
  towerCost,
  upgradeCost,
  type EconomyBonuses,
} from './stats'
import { TowerSystem } from './towers'
import type {
  Action,
  ActionInput,
  CoreDrop,
  EnemyState,
  GroundZone,
  Mine,
  Outcome,
  Projectile,
  RunStats,
  SimConfig,
  SimEvent,
  TowerState,
  Vec,
} from './types'

export type ActionResult = { ok: true } | { ok: false; reason: string }

const MAX_ACTIVE_ENEMIES = 600

/**
 * The deterministic game simulation. Advance it with {@link tick}; feed player input through {@link perform}.
 * Given the same config and action log it always produces the same result, which is what lets the server validate
 * a run and lets saves resume by replay.
 */
export class Simulation {
  readonly config: SimConfig
  readonly grid: Grid
  readonly rng: Rng
  readonly dt: number
  readonly econ: EconomyBonuses
  readonly towerSystem: TowerSystem
  readonly mechanics: MechanicsSystem

  tickCount = 0
  gold: number
  vaultCores: number
  readonly totalCores: number
  coresLost = 0
  outcome: Outcome = 'playing'

  enemies: EnemyState[] = []
  towers: TowerState[] = []
  projectiles: Projectile[] = []
  mines: Mine[] = []
  zones: GroundZone[] = []
  drops: CoreDrop[] = []
  events: SimEvent[] = []
  readonly log: Action[] = []
  readonly stats: RunStats

  /** Index of the most recently started wave (-1 before the first). */
  waveIndex = -1
  nextWaveAt: number | null = null
  private waveSpawns: { wave: number; group: number; spawned: number; nextAt: number }[] = []
  private waveAlive: number[] = []
  private waveSpawnDone: boolean[] = []
  private waveCleared: boolean[] = []
  interactionReadyAt = 0
  private nextId = 1
  /** Towers are numbered by build order so the server can follow upgrades and sales in the action log. */
  private nextTowerId = 1
  private readonly rules: Set<string>

  constructor(config: SimConfig) {
    this.config = config
    this.grid = new Grid(config.map)
    this.rng = new Rng(config.seed)
    this.dt = 1 / config.rules.tickRate
    this.econ = economyBonuses(config.bonuses)
    this.rules = new Set(config.level.rules)

    const startingGoldMul = this.ruleNumber('startingGoldMul') ?? 1
    this.gold = Math.round((config.level.startingGold + this.econ.startingGold) * startingGoldMul)
    const fixedCores = this.ruleNumber('cores')
    this.totalCores = fixedCores ?? config.level.cores + this.econ.cores
    this.vaultCores = this.totalCores

    const waves = config.level.waves.length
    this.waveAlive = new Array(waves).fill(0)
    this.waveSpawnDone = new Array(waves).fill(false)
    this.waveCleared = new Array(waves).fill(false)
    this.stats = {
      kills: {},
      bossesDefeated: 0,
      towersBuilt: 0,
      towersBuiltById: {},
      upgradesPurchased: 0,
      ultimatesPurchased: 0,
      goldEarned: 0,
      goldSpent: 0,
      coresRecovered: 0,
      interactionsUsed: 0,
      wavesCleared: 0,
      damageDealt: 0,
    }

    this.towerSystem = new TowerSystem(this)
    this.mechanics = new MechanicsSystem(this)
  }

  get time(): number {
    return this.tickCount * this.dt
  }

  get waveCount(): number {
    return this.config.level.waves.length
  }

  get coresRemaining(): number {
    return this.totalCores - this.coresLost
  }

  newId(): number {
    return this.nextId++
  }

  hasRule(rule: string): boolean {
    return this.rules.has(rule)
  }

  ruleNumber(key: string): number | undefined {
    for (const rule of this.rules) {
      if (rule.startsWith(`${key}:`)) return Number(rule.slice(key.length + 1))
    }
    return undefined
  }

  emit(event: SimEvent): void {
    this.events.push(event)
  }

  drainEvents(): SimEvent[] {
    const out = this.events
    this.events = []
    return out
  }

  // ------------------------------------------------------------------------------------------------ Actions

  /** Validates and applies a player action at the current tick, recording it in the log on success. */
  perform(input: ActionInput): ActionResult {
    if (this.outcome !== 'playing') return { ok: false, reason: 'The battle is over.' }
    const action = { ...input, t: this.tickCount } as Action
    const result = this.applyAction(action)
    if (result.ok) this.log.push(action)
    return result
  }

  private applyAction(action: Action): ActionResult {
    switch (action.type) {
      case 'build':
        return this.build(action.tower, action.x, action.y)
      case 'upgrade':
        return this.upgrade(action.id, action.upgrade)
      case 'sell':
        return this.sell(action.id)
      case 'target': {
        const tower = this.towers.find((t) => t.id === action.id)
        if (!tower) return { ok: false, reason: 'No such tower.' }
        tower.targetMode = action.mode
        return { ok: true }
      }
      case 'callWave':
        return this.callWave()
      case 'interact':
        return this.mechanics.interact(action.x, action.y)
    }
  }

  canBuildAt(towerId: string, x: number, y: number): ActionResult {
    const def = this.config.towers.get(towerId)
    if (!def || !this.config.unlockedTowers.includes(towerId)) return { ok: false, reason: 'That tower is not available.' }
    if (!this.grid.inBounds(x, y)) return { ok: false, reason: 'Out of bounds.' }
    const i = this.grid.index(x, y)
    if (!this.grid.isBuildable(i)) return { ok: false, reason: 'Cannot build here.' }
    if (def.maxPerLevel !== null && this.towers.filter((t) => t.def.id === towerId).length >= def.maxPerLevel) {
      return { ok: false, reason: `Limit of ${def.maxPerLevel} ${def.name}s reached.` }
    }
    const maxTowers = this.ruleNumber('maxTowers')
    if (maxTowers !== undefined && this.towers.length >= maxTowers) return { ok: false, reason: `Limited to ${maxTowers} towers.` }
    if (this.gold < this.costOf(def)) return { ok: false, reason: 'Not enough gold.' }
    if (this.grid.blocksPath(i)) {
      if (this.enemies.some((e) => e.alive && !e.air && this.grid.cellOf(e.pos) === i)) {
        return { ok: false, reason: 'An enemy is in the way.' }
      }
      if (!this.grid.routesIntact(i)) return { ok: false, reason: 'That would block every route to the vault.' }
    }
    return { ok: true }
  }

  costOf(def: TowerDefinition): number {
    return towerCost(def, this.config.modifiers, this.econ)
  }

  upgradeCostOf(tower: TowerState, upgradeId: string): number {
    const u = tower.def.upgrades.find((x) => x.id === upgradeId)
    return u ? upgradeCost(u, this.config.modifiers, this.econ) : Infinity
  }

  sellValueOf(tower: TowerState): number {
    return sellValue(tower.invested, this.config.rules.sellRefund, this.econ)
  }

  private build(towerId: string, x: number, y: number): ActionResult {
    const check = this.canBuildAt(towerId, x, y)
    if (!check.ok) return check
    const def = this.config.towers.get(towerId)!
    const cost = this.costOf(def)
    const i = this.grid.index(x, y)
    const tower: TowerState = {
      id: this.nextTowerId++,
      def,
      cell: { x, y },
      pos: { x: x + 0.5, y: y + 0.5 },
      upgrades: [],
      level: 1,
      invested: cost,
      targetMode: 'first',
      base: {},
      dmgMul: 1,
      rateMul: 1,
      rangeMul: 1,
      abilities: [],
      cooldown: 0.3,
      abilityTimers: {},
      attackCount: 0,
      targetId: 0,
      beamTargets: [],
      beamTime: 0,
      aim: -Math.PI / 2,
      stunUntil: 0,
      overchargeUntil: 0,
      overchargeRate: 1,
      overchargeDamage: 1,
      mines: 0,
      kills: 0,
      damageDealt: 0,
      synergies: [],
      protected: false,
      jammed: false,
    }
    this.spend(cost)
    this.grid.tower[i] = tower.id
    this.towers.push(tower)
    if (this.grid.blocksPath(i)) this.grid.rebuild()
    this.recomputeTowers()
    this.stats.towersBuilt++
    this.stats.towersBuiltById[towerId] = (this.stats.towersBuiltById[towerId] ?? 0) + 1
    this.emit({ type: 'built', tower: tower.id })
    return { ok: true }
  }

  canUpgrade(tower: TowerState, upgradeId: string): ActionResult {
    if (!canPurchase(tower.def, tower.upgrades, upgradeId)) return { ok: false, reason: 'That upgrade is not available.' }
    const upgrade = tower.def.upgrades.find((u) => u.id === upgradeId)!
    const maxTier = this.ruleNumber('maxTier')
    if (maxTier !== undefined && upgrade.tier > maxTier) return { ok: false, reason: `Upgrades are limited to tier ${maxTier}.` }
    if (this.gold < this.upgradeCostOf(tower, upgradeId)) return { ok: false, reason: 'Not enough gold.' }
    return { ok: true }
  }

  private upgrade(id: number, upgradeId: string): ActionResult {
    const tower = this.towers.find((t) => t.id === id)
    if (!tower) return { ok: false, reason: 'No such tower.' }
    const check = this.canUpgrade(tower, upgradeId)
    if (!check.ok) return check
    const upgrade = tower.def.upgrades.find((u) => u.id === upgradeId)!
    const cost = this.upgradeCostOf(tower, upgradeId)
    this.spend(cost)
    tower.invested += cost
    tower.upgrades.push(upgradeId)
    tower.level = upgrade.tier
    this.recomputeTowers()
    this.stats.upgradesPurchased++
    if (upgrade.tier === 4) this.stats.ultimatesPurchased++
    this.emit({ type: 'upgraded', tower: tower.id, tier: upgrade.tier })
    return { ok: true }
  }

  private sell(id: number): ActionResult {
    if (this.hasRule('noSell')) return { ok: false, reason: 'Selling is disabled in this challenge.' }
    const index = this.towers.findIndex((t) => t.id === id)
    if (index < 0) return { ok: false, reason: 'No such tower.' }
    const tower = this.towers[index]
    const refund = this.sellValueOf(tower)
    this.gold += refund
    this.towers.splice(index, 1)
    const cell = this.grid.index(tower.cell.x, tower.cell.y)
    this.grid.tower[cell] = 0
    this.mines = this.mines.filter((m) => m.tower !== tower.id)
    if (this.grid.blocksPath(cell)) this.grid.rebuild()
    this.recomputeTowers()
    this.emit({ type: 'sold', tower: tower.id, pos: tower.pos })
    return { ok: true }
  }

  private callWave(): ActionResult {
    const next = this.waveIndex + 1
    if (next >= this.waveCount) return { ok: false, reason: 'No waves remain.' }
    if (this.nextWaveAt !== null) {
      const early = Math.max(0, this.nextWaveAt - this.time)
      const bonus = Math.floor(early * this.config.rules.earlyCallBonusPerSecond)
      if (bonus > 0) this.earn(bonus, null)
    }
    this.startWave(next)
    return { ok: true }
  }

  spend(amount: number): void {
    this.gold -= amount
    this.stats.goldSpent += amount
  }

  earn(amount: number, pos: Vec | null): void {
    if (amount <= 0) return
    this.gold += amount
    this.stats.goldEarned += amount
    this.emit({ type: 'gold', amount, pos })
  }

  /** Recomputes static tower stats, including synergies and support auras, after any build/sell/upgrade. */
  recomputeTowers(): void {
    for (const tower of this.towers) {
      const active = tower.def.synergies.filter((s) =>
        this.towers.some(
          (o) =>
            o !== tower &&
            dist(o.pos, tower.pos) <= s.radius &&
            (s.partner.startsWith('category:') ? o.def.category === s.partner.slice(9) : o.def.id === s.partner),
        ),
      )
      tower.synergies = active.map((s) => s.name)
      const computed = computeTower(
        tower.def,
        tower.upgrades,
        this.config.bonuses,
        this.config.prestige[tower.def.id] ?? 0,
        active.map((s) => s.mods),
      )
      tower.base = computed.stats
      tower.abilities = computed.abilities
    }
    this.towerSystem.recomputeAuras()
  }

  // ------------------------------------------------------------------------------------------------ Tick

  tick(): void {
    if (this.outcome !== 'playing') return
    this.updateWaves()
    this.mechanics.update()
    this.towerSystem.update()
    this.updateEnemies()
    this.updateDrops()
    this.cleanup()
    this.checkOutcome()
    this.tickCount++
  }

  // ------------------------------------------------------------------------------------------------ Waves

  private startWave(index: number): void {
    const wave = this.config.level.waves[index]
    this.waveIndex = index
    if (index > 0) {
      const rate = this.config.rules.interestRate + this.econ.interestRate + this.towerSystem.interestBonus()
      const cap = this.config.rules.interestCap + this.econ.interestCap
      this.earn(Math.min(cap, Math.floor(this.gold * rate)), null)
    }
    this.earn(this.towerSystem.waveIncome(), null)
    wave.groups.forEach((g, gi) => this.waveSpawns.push({ wave: index, group: gi, spawned: 0, nextAt: this.time + g.delay }))
    this.nextWaveAt = null
    this.emit({ type: 'waveStart', wave: index + 1, boss: wave.groups.some((g) => this.config.enemies.get(g.enemy)?.isBoss) })
  }

  private updateWaves(): void {
    const now = this.time
    for (const s of this.waveSpawns) {
      const group = this.config.level.waves[s.wave].groups[s.group]
      while (s.spawned < group.count && now >= s.nextAt) {
        const def = this.config.enemies.get(group.enemy)!
        const spawnCell = this.grid.spawns[this.config.level.activeSpawns[group.spawn] ?? 0]
        this.spawnEnemy(def, this.grid.center(spawnCell), s.wave, group.hpMul, group.elite, false, spawnCell)
        s.spawned++
        s.nextAt += group.interval
      }
    }
    this.waveSpawns = this.waveSpawns.filter((s) => s.spawned < this.config.level.waves[s.wave].groups[s.group].count)

    for (let w = 0; w <= this.waveIndex; w++) {
      if (!this.waveSpawnDone[w] && !this.waveSpawns.some((s) => s.wave === w)) {
        this.waveSpawnDone[w] = true
        if (w === this.waveIndex && w + 1 < this.waveCount) this.nextWaveAt = now + this.config.rules.waveGap
      }
    }
    this.settleClearedWaves()

    if (this.nextWaveAt !== null && now >= this.nextWaveAt) this.startWave(this.waveIndex + 1)
  }

  /** Pays the clear bonus for every fully spawned wave with no survivors. */
  private settleClearedWaves(): void {
    for (let w = 0; w <= this.waveIndex; w++) {
      if (this.waveSpawnDone[w] && !this.waveCleared[w] && this.waveAlive[w] === 0) {
        this.waveCleared[w] = true
        this.stats.wavesCleared++
        const bonus = this.config.level.waves[w].clearBonus
        this.earn(Math.round(bonus * this.econ.clearBonusMul * this.config.modifiers.economy), null)
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ Enemies

  spawnEnemy(
    def: EnemyDefinition,
    at: Vec,
    wave: number,
    hpMul: number,
    elite: boolean,
    summoned: boolean,
    spawnCell = -1,
    inherit?: EnemyState,
  ): EnemyState | null {
    if (this.enemies.length >= MAX_ACTIVE_ENEMIES) return null
    const m = this.config.modifiers
    const r = this.config.rules
    const maxHp = def.hp * hpMul * m.enemyHealth * (elite ? r.eliteHpMul : 1)
    const jitter = spawnCell >= 0 ? 0.25 : 0.15
    const pos = { x: at.x + (this.rng.next() - 0.5) * jitter, y: at.y + (this.rng.next() - 0.5) * jitter }
    const enemy: EnemyState = {
      id: this.newId(),
      def,
      pos,
      prev: { ...pos },
      hp: maxHp,
      maxHp,
      armor: def.armor * m.enemyArmor + (elite ? r.eliteArmorAdd : 0),
      shield: 0,
      speed: def.speed * m.enemySpeed * (elite ? r.eliteSpeedMul : 1),
      bounty: summoned ? 0 : def.bounty * Math.sqrt(hpMul) * (elite ? r.eliteBountyMul : 1),
      elite,
      air: def.movement === 'air',
      goal: inherit?.goal ?? 'toCore',
      carrying: 0,
      cloaked: def.abilities.some((a) => a.kind === 'cloak') || this.mechanics.rollCloak(),
      revealedUntil: 0,
      phasedUntil: 0,
      burrowedUntil: 0,
      chargeUntil: 0,
      abilityTimers: def.abilities.map(() => 0),
      abilities: [...def.abilities],
      phaseIndex: 0,
      speedMul: 1,
      status: {
        slowPct: 0,
        slowUntil: 0,
        stunUntil: 0,
        stasisUntil: 0,
        burnDps: 0,
        burnUntil: 0,
        burnSource: 0,
        poisonDps: 0,
        poisonUntil: 0,
        poisonSource: 0,
        exposePct: 0,
        exposeUntil: 0,
        corrode: 0,
        groundedUntil: 0,
      },
      progress: Infinity,
      spawnIndex: spawnCell,
      airTarget: null,
      shedSteps: 0,
      lastCell: -1,
      alive: true,
      escaped: false,
      heading: 0,
      summoned,
      wave,
      hpMul,
    }
    if (enemy.air) enemy.airTarget = enemy.goal === 'toCore' ? this.grid.center(this.grid.core) : this.nearestExit(pos)
    this.enemies.push(enemy)
    this.waveAlive[wave]++
    this.emit({ type: 'spawn', enemy: enemy.id })
    return enemy
  }

  nearestExit(from: Vec): Vec {
    let best = this.grid.exits[0]
    let bestD = Infinity
    for (const e of this.grid.exits) {
      const d = dist(this.grid.center(e), from)
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
    return this.grid.center(best)
  }

  isStunned(e: EnemyState): boolean {
    const t = this.time
    return e.status.stunUntil > t || e.status.stasisUntil > t
  }

  isBurrowed(e: EnemyState): boolean {
    return e.burrowedUntil > this.time
  }

  isPhased(e: EnemyState): boolean {
    return e.phasedUntil > this.time
  }

  isGrounded(e: EnemyState): boolean {
    return !e.air || e.status.groundedUntil > this.time
  }

  private updateEnemies(): void {
    const t = this.time
    const dt = this.dt
    for (const e of this.enemies) {
      if (!e.alive) continue
      e.prev = { x: e.pos.x, y: e.pos.y }

      // Damage over time bypasses armour but respects resistances and immunities.
      if (e.status.burnUntil > t && e.status.burnDps > 0) {
        this.damage(e, e.status.burnDps * dt, 'fire', this.towerById(e.status.burnSource), { ignoreArmor: true, dot: true })
      }
      if (e.alive && e.status.poisonUntil > t && e.status.poisonDps > 0) {
        this.damage(e, e.status.poisonDps * dt, 'chemical', this.towerById(e.status.poisonSource), { ignoreArmor: true, dot: true })
      }
      if (!e.alive) continue

      this.updateEnemyAbilities(e)
      if (!e.alive) continue
      if (this.isStunned(e)) continue

      let speed = e.speed * e.speedMul
      if (e.status.slowUntil > t) speed *= 1 - Math.min(0.8, e.status.slowPct)
      if (e.chargeUntil > t) speed *= this.abilityParam(e, 'charge', 'speedMul', 1)
      if (this.isBurrowed(e)) speed *= this.abilityParam(e, 'burrow', 'speedMul', 1)
      speed *= this.mechanics.speedFactor(e)

      if (e.air) this.moveAir(e, speed * dt)
      else this.moveGround(e, speed * dt)
    }
  }

  abilityParam(e: EnemyState, kind: string, key: string, fallback: number): number {
    const ability = e.abilities.find((a) => a.kind === kind)
    return ability?.params[key] ?? fallback
  }

  private updateEnemyAbilities(e: EnemyState): void {
    const t = this.time
    const dt = this.dt
    if (e.status.stasisUntil > t) return
    e.abilities.forEach((a: EnemyAbility, i) => {
      const p = a.params
      switch (a.kind) {
        case 'regenerate':
          e.hp = Math.min(e.maxHp, e.hp + p.hps * dt)
          break
        case 'healAura':
          for (const o of this.enemies) {
            if (o.alive && dist(o.pos, e.pos) <= p.radius) o.hp = Math.min(o.maxHp, o.hp + p.hps * dt)
          }
          break
        case 'shieldAura':
        case 'spawner':
        case 'burrow':
        case 'phase':
        case 'charge':
        case 'sabotage': {
          e.abilityTimers[i] = (e.abilityTimers[i] ?? 0) + dt
          if (e.abilityTimers[i] < p.interval) break
          e.abilityTimers[i] = 0
          if (a.kind === 'shieldAura') {
            for (const o of this.enemies) {
              if (o.alive && dist(o.pos, e.pos) <= p.radius) o.shield = Math.max(o.shield, p.shield)
            }
            this.emit({ type: 'ability', kind: 'shieldAura', pos: e.pos, radius: p.radius, enemy: e.id })
          } else if (a.kind === 'spawner' && a.spawns) {
            const child = this.config.enemies.get(a.spawns)
            if (child) {
              for (let k = 0; k < p.count; k++) this.spawnEnemy(child, e.pos, e.wave, e.hpMul, false, true, -1, e)
            }
          } else if (a.kind === 'burrow') {
            e.burrowedUntil = t + p.duration
          } else if (a.kind === 'phase') {
            e.phasedUntil = t + p.duration
          } else if (a.kind === 'charge') {
            e.chargeUntil = t + p.duration
          } else if (a.kind === 'sabotage') {
            this.towerSystem.stunTowersNear(e.pos, p.radius, p.duration)
            this.emit({ type: 'ability', kind: 'sabotage', pos: e.pos, radius: p.radius, enemy: e.id })
          }
          break
        }
      }
    })
  }

  private moveGround(e: EnemyState, step: number): void {
    const field = e.goal === 'toCore' ? this.grid.toCore : this.grid.toExit
    let remaining = step
    for (let guard = 0; guard < 3 && remaining > 1e-6; guard++) {
      const cell = this.grid.cellOf(e.pos)
      if (cell !== e.lastCell) {
        this.mechanics.onEnterCell(e, cell)
        e.lastCell = cell
      }
      if (field.dist[cell] === 0) {
        const c = this.grid.center(cell)
        const d = dist(c, e.pos)
        if (d <= remaining) {
          e.pos = c
          this.arrive(e)
          return
        }
        this.advance(e, c, remaining)
        return
      }
      const next = this.grid.step(field, cell)
      if (next < 0) {
        e.progress = Infinity
        return // No open route (gate closed, tide in): hold position until it reopens.
      }
      const target = this.grid.center(next)
      const d = dist(target, e.pos)
      e.progress = field.dist[next] + d
      if (d <= remaining) {
        e.pos = target
        remaining -= d
      } else {
        this.advance(e, target, remaining)
        remaining = 0
      }
    }
  }

  private advance(e: EnemyState, target: Vec, step: number): void {
    const dx = target.x - e.pos.x
    const dy = target.y - e.pos.y
    const d = Math.hypot(dx, dy)
    if (d < 1e-9) return
    e.heading = Math.atan2(dy, dx)
    e.pos = { x: e.pos.x + (dx / d) * step, y: e.pos.y + (dy / d) * step }
  }

  private moveAir(e: EnemyState, step: number): void {
    const target = e.airTarget ?? this.grid.center(this.grid.core)
    const d = dist(target, e.pos)
    e.progress = d
    if (d <= step) {
      e.pos = { ...target }
      this.arrive(e)
    } else {
      this.advance(e, target, step)
    }
  }

  /** Reached the vault (grab cores, turn for the exit) or an exit (escape with whatever it carries). */
  private arrive(e: EnemyState): void {
    if (e.goal === 'toCore') {
      const take = Math.min(e.def.coreCarry, this.vaultCores)
      if (take > 0) {
        this.vaultCores -= take
        e.carrying = take
        this.emit({ type: 'coreTaken', enemy: e.id, count: take })
      }
      e.goal = 'toExit'
      if (e.air) e.airTarget = this.nearestExit(e.pos)
      return
    }
    e.alive = false
    e.escaped = true
    const cores = e.carrying
    this.coresLost += cores
    e.carrying = 0
    this.emit({ type: 'escape', enemy: e.id, cores })
  }

  /** Knocks an enemy back along its route (ground) or toward its origin (air). */
  pushBack(e: EnemyState, distance: number): void {
    if (e.def.immune.includes('pull') || distance <= 0) return
    if (e.air) {
      const origin = e.spawnIndex >= 0 ? this.grid.center(e.spawnIndex) : this.grid.center(this.grid.spawns[0])
      const d = dist(origin, e.pos)
      if (d > 0.01) {
        const k = Math.min(distance, d) / d
        e.pos = { x: e.pos.x + (origin.x - e.pos.x) * k, y: e.pos.y + (origin.y - e.pos.y) * k }
      }
      return
    }
    const field = e.goal === 'toCore' ? this.grid.toCore : this.grid.toExit
    let remaining = distance
    for (let guard = 0; guard < 8 && remaining > 1e-6; guard++) {
      const cell = this.grid.cellOf(e.pos)
      const back = this.grid.stepBack(field, cell)
      if (back < 0) return
      const target = this.grid.center(back)
      const d = dist(target, e.pos)
      if (d <= remaining) {
        e.pos = target
        remaining -= d
      } else {
        const k = remaining / d
        e.pos = { x: e.pos.x + (target.x - e.pos.x) * k, y: e.pos.y + (target.y - e.pos.y) * k }
        remaining = 0
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ Damage

  towerById(id: number): TowerState | null {
    if (!id) return null
    return this.towers.find((t) => t.id === id) ?? null
  }

  /**
   * Applies one hit. Armour is flat reduction (with a minimum fraction always landing), then resistance, exposure,
   * and the tower's situational bonuses. Returns the damage actually dealt.
   */
  damage(
    e: EnemyState,
    amount: number,
    type: DamageType,
    source: TowerState | null,
    opts: { ignoreArmor?: boolean; dot?: boolean; crit?: boolean; armorPierce?: number; mechanic?: boolean } = {},
  ): number {
    if (!e.alive || amount <= 0) return 0
    if (this.isPhased(e) && !(source && (source.base.hitsPhased ?? 0) > 0)) return 0
    const t = this.time
    let amt = amount

    if (!opts.ignoreArmor) {
      const pierce = (opts.armorPierce ?? 0) + (source?.base.armorPierce ?? 0)
      const armor = Math.max(0, e.armor - e.status.corrode - pierce)
      amt = Math.max(amt - armor, amt * this.config.rules.minArmorDamageFraction)
    }
    amt *= 1 - (e.def.resist[type] ?? 0)
    if (e.status.exposeUntil > t) amt *= 1 + e.status.exposePct
    const aura = this.towerSystem.auraExposeAt(e)
    if (aura > 0) amt *= 1 + aura
    if (source) {
      if (e.air) amt *= 1 + (source.base.airDamageMul ?? 0)
      if (e.def.isBoss) amt *= 1 + (source.base.bossDamageMul ?? 0)
    }
    if (!opts.mechanic) amt *= this.config.modifiers.towerDamage
    if (amt <= 0) return 0

    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, amt)
      e.shield -= absorbed
      amt -= absorbed
      if (amt <= 0) return absorbed
    }

    e.hp -= amt
    this.stats.damageDealt += amt
    if (source) source.damageDealt += amt
    if (!opts.dot) this.emit({ type: 'hit', enemy: e.id, amount: amt, damageType: type, crit: !!opts.crit })

    this.checkArmorShed(e)
    this.checkBossPhase(e)

    if (e.hp > 0 && source && !e.def.isBoss) {
      const execute = source.abilities.find((a) => a.kind === 'execute')
      if (execute && e.hp / e.maxHp < execute.params.threshold) e.hp = 0
    }
    if (e.hp <= 0) this.kill(e, source)
    return amt
  }

  private checkArmorShed(e: EnemyState): void {
    const shed = e.abilities.find((a) => a.kind === 'armorShed')
    if (!shed) return
    const lost = 1 - e.hp / e.maxHp
    const steps = Math.floor(lost / shed.params.step)
    while (e.shedSteps < steps) {
      e.shedSteps++
      e.armor = Math.max(0, e.armor - shed.params.armorLoss)
      this.emit({ type: 'ability', kind: 'armorShed', pos: e.pos, radius: e.def.size, enemy: e.id })
    }
  }

  private checkBossPhase(e: EnemyState): void {
    const phases = e.def.phases
    while (e.phaseIndex < phases.length && e.hp / e.maxHp <= phases[e.phaseIndex].hpBelow) {
      const phase = phases[e.phaseIndex]
      e.phaseIndex++
      e.speedMul *= phase.speedMul
      e.armor = Math.max(0, e.armor + phase.armorAdd)
      for (const ability of phase.abilities) {
        const existing = e.abilities.findIndex((a) => a.kind === ability.kind)
        if (existing >= 0) e.abilities[existing] = ability
        else {
          e.abilities.push(ability)
          e.abilityTimers.push(0)
        }
      }
      this.emit({ type: 'bossPhase', enemy: e.id, name: phase.name })
    }
  }

  kill(e: EnemyState, source: TowerState | null): void {
    if (!e.alive) return
    e.alive = false
    e.hp = 0
    this.stats.kills[e.def.id] = (this.stats.kills[e.def.id] ?? 0) + 1
    if (e.def.isBoss) this.stats.bossesDefeated++
    if (source) source.kills++

    if (e.bounty > 0) {
      const bonus = (source?.base.bountyBonus ?? 0) + this.towerSystem.auraBountyAt(e.pos)
      const amount = Math.round(e.bounty * this.config.modifiers.economy * this.econ.bountyMul * (1 + Math.min(1.5, bonus)))
      this.earn(amount, e.pos)
    }
    this.emit({ type: 'kill', enemy: e.id, pos: e.pos, bounty: e.bounty, boss: e.def.isBoss })

    if (e.carrying > 0) {
      this.drops.push({ id: this.newId(), pos: { ...e.pos }, count: e.carrying })
      this.emit({ type: 'coreDropped', pos: e.pos, count: e.carrying })
      e.carrying = 0
    }

    for (const a of e.abilities) {
      if (a.kind === 'explodeOnDeath') {
        this.towerSystem.stunTowersNear(e.pos, a.params.radius, a.params.stunTowers)
        this.emit({ type: 'impact', pos: e.pos, radius: a.params.radius, damageType: 'fire', kind: 'boiler' })
      } else if (a.kind === 'splitOnDeath' && a.spawns) {
        const child = this.config.enemies.get(a.spawns)
        if (child) {
          for (let k = 0; k < a.params.count; k++) this.spawnEnemy(child, e.pos, e.wave, e.hpMul, false, false, -1, e)
        }
      }
    }

    const explode = source?.abilities.find((a) => a.kind === 'onKillExplode')
    if (explode) {
      const amount = e.maxHp * explode.params.damageFraction
      this.emit({ type: 'impact', pos: e.pos, radius: explode.params.radius, damageType: source!.def.damageType, kind: 'burst' })
      for (const o of this.enemies) {
        if (o.alive && o !== e && dist(o.pos, e.pos) <= explode.params.radius) this.damage(o, amount, source!.def.damageType, source, { ignoreArmor: true })
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ Cores

  private updateDrops(): void {
    const step = this.config.rules.coreReturnSpeed * this.dt
    const radius = this.config.rules.coreDropPickupRadius
    for (const drop of this.drops) {
      if (drop.count <= 0) continue
      const carrier = this.enemies.find((e) => e.alive && e.carrying === 0 && !this.isBurrowed(e) && dist(e.pos, drop.pos) <= radius)
      if (carrier) {
        carrier.carrying = drop.count
        carrier.goal = 'toExit'
        if (carrier.air) carrier.airTarget = this.nearestExit(carrier.pos)
        this.emit({ type: 'coreTaken', enemy: carrier.id, count: drop.count })
        drop.count = 0
        continue
      }
      const core = this.grid.center(this.grid.core)
      const d = dist(core, drop.pos)
      if (d <= step) {
        this.vaultCores += drop.count
        this.stats.coresRecovered += drop.count
        this.emit({ type: 'coreReturned', count: drop.count })
        drop.count = 0
      } else {
        drop.pos = { x: drop.pos.x + ((core.x - drop.pos.x) / d) * step, y: drop.pos.y + ((core.y - drop.pos.y) / d) * step }
      }
    }
    this.drops = this.drops.filter((d) => d.count > 0)
  }

  // ------------------------------------------------------------------------------------------------ Bookkeeping

  private cleanup(): void {
    if (!this.enemies.some((e) => !e.alive)) return
    for (const e of this.enemies) {
      if (!e.alive) this.waveAlive[e.wave]--
    }
    this.enemies = this.enemies.filter((e) => e.alive)
  }

  private checkOutcome(): void {
    if (this.coresLost >= this.totalCores) {
      this.outcome = 'defeat'
      return
    }
    const allSpawned = this.waveIndex === this.waveCount - 1 && this.waveSpawnDone[this.waveCount - 1]
    if (allSpawned && this.enemies.length === 0) {
      this.settleClearedWaves()
      // Any cores still floating home count as recovered once the field is clear.
      for (const drop of this.drops) {
        this.vaultCores += drop.count
        this.stats.coresRecovered += drop.count
      }
      this.drops = []
      this.outcome = 'victory'
    }
  }

  /** Summary submitted to the server alongside the action log. The server treats it as a claim to verify. */
  result() {
    return {
      outcome: this.outcome,
      ticks: this.tickCount,
      coresRemaining: this.coresRemaining,
      coresTotal: this.totalCores,
      wavesCleared: this.stats.wavesCleared,
      stats: this.stats,
    }
  }

  get paused(): boolean {
    return this.waveIndex < 0
  }

  /** Seconds until the next wave auto-starts, or null when waiting on the player / all waves released. */
  get nextWaveIn(): number | null {
    return this.nextWaveAt === null ? null : Math.max(0, this.nextWaveAt - this.time)
  }

  get earlyCallBonus(): number {
    return this.nextWaveAt === null ? 0 : Math.floor(Math.max(0, this.nextWaveAt - this.time) * this.config.rules.earlyCallBonusPerSecond)
  }
}

/** Hard stop for replays: three hours of game time. */
export const MAX_REPLAY_TICKS = 30 * 60 * 60 * 3

/** Replays a recorded log from scratch, used for save resumption and determinism tests. */
export function replay(config: SimConfig, log: readonly Action[], untilTick = Infinity): Simulation {
  const sim = new Simulation(config)
  let i = 0
  const stop = Math.min(untilTick, MAX_REPLAY_TICKS)
  while (sim.outcome === 'playing' && sim.tickCount < stop) {
    while (i < log.length && log[i].t === sim.tickCount) {
      const { t: _t, ...input } = log[i++]
      void _t
      const result = sim.perform(input as ActionInput)
      if (!result.ok) throw new Error(`Replay diverged at tick ${sim.tickCount}: ${result.reason}`)
    }
    if (i >= log.length && untilTick === Infinity && sim.waveIndex < 0) break
    sim.tick()
    sim.events.length = 0
  }
  return sim
}
