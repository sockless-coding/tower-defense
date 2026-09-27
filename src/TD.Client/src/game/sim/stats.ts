import type { AbilitySpec, BonusEffect, DifficultyModifiers, StatMod, TowerDefinition, TowerUpgrade } from '../../api/types'
import type { TowerStats } from './types'

export function applyMod(stats: TowerStats, mod: { stat: string; op: string; value: number }): void {
  const current = stats[mod.stat] ?? 0
  if (mod.op === 'add') stats[mod.stat] = current + mod.value
  else if (mod.op === 'mul') stats[mod.stat] = current * mod.value
  else stats[mod.stat] = mod.value
}

export function bonusApplies(target: string, tower: TowerDefinition): boolean {
  return target === 'all' || target === `category:${tower.category}` || target === `tower:${tower.id}`
}

/** Economy-wide bonuses aggregated from research and commander perks. */
export interface EconomyBonuses {
  startingGold: number
  bountyMul: number
  interestRate: number
  interestCap: number
  sellRefund: number
  clearBonusMul: number
  towerCostMul: number
  upgradeCostMul: number
  cores: number
  cooldownMul: number
}

export function economyBonuses(bonuses: BonusEffect[]): EconomyBonuses {
  const e: Record<string, number> = {
    startingGold: 0,
    bountyMul: 1,
    interestRate: 0,
    interestCap: 0,
    sellRefund: 0,
    clearBonusMul: 1,
    towerCostMul: 1,
    upgradeCostMul: 1,
    cores: 0,
    cooldownMul: 1,
  }
  for (const b of bonuses) {
    if (b.target === 'economy' || b.target === 'cores' || b.target === 'interaction') applyMod(e, b)
  }
  return e as unknown as EconomyBonuses
}

// Cost formulas are mirrored exactly by the server's session validator (round half away from zero).
export function towerCost(def: TowerDefinition, mods: DifficultyModifiers, econ: EconomyBonuses): number {
  return Math.round(def.cost * mods.towerCost * econ.towerCostMul)
}

export function upgradeCost(upgrade: TowerUpgrade, mods: DifficultyModifiers, econ: EconomyBonuses): number {
  return Math.round(upgrade.cost * mods.towerCost * econ.upgradeCostMul)
}

export function sellValue(invested: number, sellRefund: number, econ: EconomyBonuses): number {
  return Math.floor(invested * Math.min(1, sellRefund + econ.sellRefund))
}

/** Upgrades in purchase order (tier ascending), so mods compose the same way everywhere. */
export function ownedUpgrades(def: TowerDefinition, owned: readonly string[]): TowerUpgrade[] {
  return def.upgrades.filter((u) => owned.includes(u.id)).sort((a, b) => a.tier - b.tier)
}

/** Tier rule shared with the server's TowerTiers: one of II (A/B), then one of III (A/B), then the ultimate. */
export function canPurchase(def: TowerDefinition, owned: readonly string[], upgradeId: string): boolean {
  const upgrade = def.upgrades.find((u) => u.id === upgradeId)
  if (!upgrade || owned.includes(upgradeId)) return false
  const tiers = new Set(def.upgrades.filter((u) => owned.includes(u.id)).map((u) => u.tier))
  return !tiers.has(upgrade.tier) && (upgrade.tier === 2 || tiers.has(upgrade.tier - 1))
}

export interface ComputedTower {
  stats: TowerStats
  abilities: AbilitySpec[]
}

/**
 * Static stats: base → upgrades → research/perks → prestige → synergies. Dynamic effects (support auras, map surges,
 * enemy debuffs, overcharge) are applied per tick as multipliers on top.
 */
export function computeTower(
  def: TowerDefinition,
  owned: readonly string[],
  bonuses: BonusEffect[],
  prestigeRank: number,
  activeSynergies: StatMod[][],
): ComputedTower {
  const stats: TowerStats = { ...def.stats }
  const abilities: AbilitySpec[] = [...def.abilities]

  for (const upgrade of ownedUpgrades(def, owned)) {
    for (const mod of upgrade.mods) applyMod(stats, mod)
    for (const ability of upgrade.abilities) {
      const existing = abilities.findIndex((a) => a.kind === ability.kind)
      if (existing >= 0) abilities[existing] = ability
      else abilities.push(ability)
    }
  }

  for (const bonus of bonuses) {
    if (bonusApplies(bonus.target, def)) applyMod(stats, bonus)
  }

  for (let rank = 0; rank < prestigeRank; rank++) {
    for (const mod of def.prestige.modsPerRank) applyMod(stats, mod)
  }

  for (const mods of activeSynergies) {
    for (const mod of mods) applyMod(stats, mod)
  }

  return { stats, abilities }
}
