// Mirrors of the server's content and API DTOs (camelCase JSON). Keep in sync with src/TD.Application/Features.

export type TowerCategory = 'ballistic' | 'electrical' | 'flame' | 'chemical' | 'support' | 'mechanical' | 'experimental'
export type DamageType = 'ballistic' | 'electric' | 'fire' | 'chemical' | 'force' | 'temporal'
export type AttackKind =
  | 'projectile'
  | 'hitscan'
  | 'lob'
  | 'chain'
  | 'beam'
  | 'cone'
  | 'pulse'
  | 'mine'
  | 'field'
  | 'support'
  | 'economy'
export type TargetLayer = 'ground' | 'air' | 'both'
export type ModOp = 'add' | 'mul' | 'set'
export type GameMode = 'campaign' | 'survival' | 'challenge' | 'daily' | 'weekly' | 'endless'
export type Movement = 'ground' | 'air'
export type AccountKind = 'guest' | 'registered'

export interface StatMod {
  stat: string
  op: ModOp
  value: number
}

export interface AbilitySpec {
  kind: string
  name: string
  description: string
  params: Record<string, number>
}

export interface TowerUpgrade {
  id: string
  tier: number
  branch: 'A' | 'B' | 'U'
  name: string
  description: string
  cost: number
  mods: StatMod[]
  abilities: AbilitySpec[]
}

export interface TowerDefinition {
  id: string
  name: string
  category: TowerCategory
  description: string
  flavor: string
  cost: number
  attack: AttackKind
  damageType: DamageType
  targets: TargetLayer
  stats: Record<string, number>
  abilities: AbilitySpec[]
  upgrades: TowerUpgrade[]
  prestige: { maxRank: number; gearCost: number[]; modsPerRank: StatMod[]; skinAtMaxRank: string }
  synergies: { partner: string; radius: number; name: string; description: string; mods: StatMod[] }[]
  unlock: { campaignLevel: number; research: string | null }
  maxPerLevel: number | null
}

export interface EnemyAbility {
  kind: string
  params: Record<string, number>
  spawns: string | null
}

export interface BossPhase {
  hpBelow: number
  name: string
  speedMul: number
  armorAdd: number
  abilities: EnemyAbility[]
}

export interface EnemyDefinition {
  id: string
  name: string
  description: string
  movement: Movement
  hp: number
  armor: number
  speed: number
  bounty: number
  coreCarry: number
  size: number
  threat: number
  introducedAtLevel: number
  isBoss: boolean
  resist: Partial<Record<DamageType, number>>
  immune: string[]
  abilities: EnemyAbility[]
  phases: BossPhase[]
}

export interface MapPalette {
  ground: string
  accent: string
  metal: string
  light: string
  fog: string
  sky: string
}

export interface MapDefinition {
  id: string
  name: string
  theme: string
  description: string
  weather: string
  palette: MapPalette
  mechanic: { kind: string; name: string; description: string; params: Record<string, number> }
  interaction: { kind: string; name: string; description: string; cooldown: number; params: Record<string, number> }
  grid: string[]
}

export interface WaveGroup {
  enemy: string
  count: number
  interval: number
  spawn: number
  delay: number
  elite: boolean
  hpMul: number
}

export interface WaveDefinition {
  number: number
  groups: WaveGroup[]
  clearBonus: number
}

export interface GameRules {
  tickRate: number
  maxGameSpeed: number
  sellRefund: number
  interestRate: number
  interestCap: number
  minArmorDamageFraction: number
  eliteHpMul: number
  eliteArmorAdd: number
  eliteSpeedMul: number
  eliteBountyMul: number
  waveGap: number
  earlyCallBonusPerSecond: number
  coreReturnSpeed: number
  coreDropPickupRadius: number
  minSecondsPerWave: number
}

export interface LevelDefinition {
  id: string
  mode: GameMode
  number: number
  mapId: string
  name: string
  briefing: string
  variant: number
  activeSpawns: number[]
  startingGold: number
  cores: number
  mechanicIntensity: number
  waves: WaveDefinition[]
  bossId: string | null
  unlocksTowers: string[]
  allowedTowers: string[] | null
  rules: string[]
}

export type LevelSummary = Omit<LevelDefinition, 'waves' | 'activeSpawns' | 'startingGold' | 'cores' | 'mechanicIntensity'> & {
  waveCount: number
}

export interface DifficultyModifiers {
  enemySpeed: number
  enemyHealth: number
  enemyArmor: number
  towerCost: number
  towerDamage: number
  economy: number
  fog: number
  eliteChance: number
  bossFrequency: number
}

export interface DifficultyPreset {
  id: string
  name: string
  description: string
  order: number
  requiredCommanderLevel: number
  modifiers: DifficultyModifiers
}

export interface ModifierRange {
  key: keyof DifficultyModifiers
  name: string
  min: number
  max: number
  step: number
  rewardWeight: number
  higherIsHarder: boolean
}

export type ResearchCategory = 'steamPower' | 'engineering' | 'electricity' | 'chemistry' | 'militaryScience'

export interface BonusEffect {
  target: string
  stat: string
  op: ModOp
  value: number
}

export interface ResearchNode {
  id: string
  name: string
  category: ResearchCategory
  tier: number
  cost: number
  requires: string[]
  description: string
  effects: BonusEffect[]
  x: number
  y: number
}

export interface AchievementDefinition {
  id: string
  name: string
  description: string
  category: string
  stat: string
  threshold: number
  rewardGears: number
  rewardCosmetic: string | null
  hidden: boolean
}

export type CommanderRewardKind = 'gears' | 'researchPoints' | 'cosmetic' | 'perk' | 'feature'

export interface CommanderReward {
  level: number
  kind: CommanderRewardKind
  id: string
  name: string
  description: string
  amount: number
  effects: BonusEffect[]
}

export interface CosmeticDefinition {
  id: string
  kind: string
  name: string
  description: string
}

export interface CommanderRules {
  maxLevel: number
  baseXp: number
  exponent: number
  rewards: CommanderReward[]
  cosmetics: CosmeticDefinition[]
}

export interface ContentBundle {
  version: string
  rules: GameRules
  towers: TowerDefinition[]
  enemies: EnemyDefinition[]
  maps: MapDefinition[]
  difficulty: { presets: DifficultyPreset[]; ranges: ModifierRange[] }
  research: ResearchNode[]
  achievements: AchievementDefinition[]
  commander: CommanderRules
  campaign: LevelSummary[]
  challenges: LevelSummary[]
}

export interface AuthResponse {
  accountId: string
  displayName: string
  kind: AccountKind
  accessToken: string
  accessTokenExpiresAt: string
  refreshToken: string
  refreshTokenExpiresAt: string
}

export interface Profile {
  accountId: string
  displayName: string
  kind: AccountKind
  commanderLevel: number
  commanderXp: number
  gears: number
  researchPoints: number
  selectedBanner: string
  selectedTitle: string
  settings: Record<string, unknown>
  version: number
}

export interface ProblemDetails {
  title?: string
  detail?: string
  status?: number
  code?: string
  errors?: Record<string, string[]>
}
