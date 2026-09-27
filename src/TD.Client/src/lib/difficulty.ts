import type { DifficultyModifiers, ModifierRange } from '../api/types'

// Client-side preview of the server's DifficultyMath. The server recomputes this at session start and its value wins.

const NEUTRAL_ZERO = new Set<keyof DifficultyModifiers>(['fog', 'eliteChance'])

export function rewardMultiplier(modifiers: DifficultyModifiers, ranges: ModifierRange[]): number {
  let product = 1
  for (const range of ranges) {
    const neutral = NEUTRAL_ZERO.has(range.key) ? 0 : 1
    const delta = modifiers[range.key] - neutral
    const harder = range.higherIsHarder ? delta : -delta
    product *= Math.max(0.2, 1 + range.rewardWeight * harder)
  }
  return Math.round(Math.min(6, Math.max(0.25, product)) * 1000) / 1000
}

export function clampToRange(value: number, range: ModifierRange): number {
  const stepped = Math.round(value / range.step) * range.step
  return Math.min(range.max, Math.max(range.min, Number(stepped.toFixed(4))))
}
