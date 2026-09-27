import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DifficultyModifiers, EnemyDefinition, GameRules, LevelDefinition, MapDefinition, TowerDefinition, WaveDefinition } from '../../api/types'
import type { SimConfig } from './types'

// Test helpers that read the authoritative content straight from the server project.
const contentDir = join(__dirname, '../../../../TD.Application/Content')
const read = <T>(name: string): T => JSON.parse(readFileSync(join(contentDir, `${name}.json`), 'utf8')) as T

export const content = {
  towers: new Map(read<TowerDefinition[]>('towers').map((t) => [t.id, t])),
  enemies: new Map(read<EnemyDefinition[]>('enemies').map((e) => [e.id, e])),
  maps: new Map(read<MapDefinition[]>('maps').map((m) => [m.id, m])),
  rules: read<GameRules>('rules'),
}

export const engineer: DifficultyModifiers = {
  enemySpeed: 1,
  enemyHealth: 1,
  enemyArmor: 1,
  towerCost: 1,
  towerDamage: 1,
  economy: 1,
  fog: 0,
  eliteChance: 0,
  bossFrequency: 1,
}

export function wave(number: number, groups: Partial<WaveDefinition['groups'][number]>[]): WaveDefinition {
  return {
    number,
    clearBonus: 20,
    groups: groups.map((g) => ({ enemy: 'automaton-scout', count: 5, interval: 0.8, spawn: 0, delay: 0, elite: false, hpMul: 1, ...g })),
  }
}

export function makeConfig(overrides: Partial<LevelDefinition> & { mapId?: string } = {}, extra: Partial<SimConfig> = {}): SimConfig {
  const mapId = overrides.mapId ?? 'underground-tunnels'
  const level: LevelDefinition = {
    id: 'test-level',
    mode: 'campaign',
    number: 1,
    mapId,
    name: 'Test',
    briefing: '',
    variant: 0,
    activeSpawns: [0],
    startingGold: 1000,
    cores: 20,
    mechanicIntensity: 1,
    waves: [wave(1, [{ count: 6 }]), wave(2, [{ count: 8 }])],
    bossId: null,
    unlocksTowers: [],
    allowedTowers: null,
    rules: [],
    ...overrides,
  }
  return {
    level,
    map: content.maps.get(mapId)!,
    towers: content.towers,
    enemies: content.enemies,
    rules: content.rules,
    modifiers: engineer,
    seed: 1234,
    bonuses: [],
    prestige: {},
    unlockedTowers: [...content.towers.keys()],
    ...extra,
  }
}
