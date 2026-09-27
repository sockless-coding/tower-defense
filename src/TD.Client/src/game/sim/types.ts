import type {
  AbilitySpec,
  BonusEffect,
  DamageType,
  DifficultyModifiers,
  EnemyDefinition,
  GameRules,
  LevelDefinition,
  MapDefinition,
  TowerDefinition,
} from '../../api/types'

export type Vec = { x: number; y: number }

/** Everything the simulation needs. Built from a server-issued session so the server decides bonuses and unlocks. */
export interface SimConfig {
  level: LevelDefinition
  map: MapDefinition
  towers: ReadonlyMap<string, TowerDefinition>
  enemies: ReadonlyMap<string, EnemyDefinition>
  rules: GameRules
  modifiers: DifficultyModifiers
  seed: number
  /** Flattened research and commander perk effects granted by the server. */
  bonuses: BonusEffect[]
  /** Prestige rank per tower id, granted by the server. */
  prestige: Record<string, number>
  /** Towers the player may build this session (server-computed unlocks intersected with level restrictions). */
  unlockedTowers: string[]
}

export type TargetMode = 'first' | 'last' | 'strong' | 'weak' | 'close'

/** Player inputs. The ordered log of these, with ticks, is what the server validates. */
export type Action =
  | { t: number; type: 'build'; tower: string; x: number; y: number }
  | { t: number; type: 'upgrade'; id: number; upgrade: string }
  | { t: number; type: 'sell'; id: number }
  | { t: number; type: 'target'; id: number; mode: TargetMode }
  | { t: number; type: 'callWave' }
  | { t: number; type: 'interact'; x: number; y: number }

export type ActionInput = Action extends infer A ? (A extends { t: number } ? Omit<A, 't'> : never) : never

export interface StatusEffects {
  slowPct: number
  slowUntil: number
  stunUntil: number
  stasisUntil: number
  burnDps: number
  burnUntil: number
  burnSource: number
  poisonDps: number
  poisonUntil: number
  poisonSource: number
  exposePct: number
  exposeUntil: number
  corrode: number
  groundedUntil: number
}

export interface EnemyState {
  id: number
  def: EnemyDefinition
  pos: Vec
  prev: Vec
  hp: number
  maxHp: number
  armor: number
  shield: number
  speed: number
  bounty: number
  elite: boolean
  air: boolean
  /** 'toCore' until it reaches the vault (or a dropped core), then 'toExit'. */
  goal: 'toCore' | 'toExit'
  carrying: number
  cloaked: boolean
  revealedUntil: number
  phasedUntil: number
  burrowedUntil: number
  chargeUntil: number
  abilityTimers: number[]
  abilities: EnemyDefinition['abilities']
  phaseIndex: number
  speedMul: number
  status: StatusEffects
  /** Remaining flow distance to the current goal; lower means further along ("first" targeting). */
  progress: number
  spawnIndex: number
  airTarget: Vec | null
  shedSteps: number
  lastCell: number
  alive: boolean
  escaped: boolean
  heading: number
  /** Summoned children pay no bounty (keeps the server's income ceiling computable). */
  summoned: boolean
  wave: number
  hpMul: number
}

export interface TowerStats {
  [key: string]: number
}

export interface TowerState {
  id: number
  def: TowerDefinition
  cell: { x: number; y: number }
  pos: Vec
  upgrades: string[]
  level: number
  invested: number
  targetMode: TargetMode
  /** Stats after upgrades, research, prestige and difficulty; recomputed on change. */
  base: TowerStats
  /** Per-tick multipliers from synergies, support auras, map effects and debuffs. */
  dmgMul: number
  rateMul: number
  rangeMul: number
  abilities: AbilitySpec[]
  cooldown: number
  abilityTimers: Record<string, number>
  attackCount: number
  targetId: number
  beamTargets: number[]
  beamTime: number
  aim: number
  stunUntil: number
  overchargeUntil: number
  overchargeRate: number
  overchargeDamage: number
  mines: number
  kills: number
  damageDealt: number
  synergies: string[]
  protected: boolean
  jammed: boolean
}

export interface Projectile {
  id: number
  tower: number
  kind: 'bullet' | 'shell' | 'lob' | 'blade' | 'glob' | 'orb'
  pos: Vec
  prev: Vec
  origin: Vec
  target: Vec
  targetId: number
  speed: number
  damage: number
  damageType: DamageType
  splash: number
  pierceLeft: number
  bouncesLeft: number
  hit: number[]
  stats: TowerStats
  flight: number
  flightTime: number
  arcHeight: number
  alive: boolean
  air: boolean
  crit: boolean
  nth: boolean
}

export interface Mine {
  id: number
  tower: number
  pos: Vec
  armedAt: number
}

export interface GroundZone {
  id: number
  tower: number
  kind: 'fire' | 'acid' | 'toxic' | 'electric' | 'radiation' | 'singularity'
  pos: Vec
  radius: number
  dps: number
  slowPct: number
  pull: number
  damageType: DamageType
  until: number
}

export interface CoreDrop {
  id: number
  pos: Vec
  count: number
}

/** Visual/audio notifications emitted by a tick. Purely informational: nothing in the sim reads them. */
export type SimEvent =
  | { type: 'spawn'; enemy: number }
  | { type: 'fire'; tower: number; to: Vec; kind: string }
  | { type: 'hit'; enemy: number; amount: number; damageType: DamageType; crit: boolean }
  | { type: 'impact'; pos: Vec; radius: number; damageType: DamageType; kind: string }
  | { type: 'lightning'; points: Vec[]; strong: boolean }
  | { type: 'rail'; from: Vec; to: Vec }
  | { type: 'kill'; enemy: number; pos: Vec; bounty: number; boss: boolean }
  | { type: 'escape'; enemy: number; cores: number }
  | { type: 'coreTaken'; enemy: number; count: number }
  | { type: 'coreDropped'; pos: Vec; count: number }
  | { type: 'coreReturned'; count: number }
  | { type: 'waveStart'; wave: number; boss: boolean }
  | { type: 'bossPhase'; enemy: number; name: string }
  | { type: 'ability'; kind: string; pos: Vec; radius: number; tower?: number; enemy?: number }
  | { type: 'mechanic'; kind: string; active: boolean }
  | { type: 'interaction'; kind: string; pos: Vec; radius: number }
  | { type: 'towerStunned'; tower: number; duration: number }
  | { type: 'built'; tower: number }
  | { type: 'upgraded'; tower: number; tier: number }
  | { type: 'sold'; tower: number; pos: Vec }
  | { type: 'gold'; amount: number; pos: Vec | null }

export interface RunStats {
  kills: Record<string, number>
  bossesDefeated: number
  towersBuilt: number
  towersBuiltById: Record<string, number>
  upgradesPurchased: number
  ultimatesPurchased: number
  goldEarned: number
  goldSpent: number
  coresRecovered: number
  interactionsUsed: number
  wavesCleared: number
  damageDealt: number
}

export type Outcome = 'playing' | 'victory' | 'defeat'
