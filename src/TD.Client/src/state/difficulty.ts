import { create } from 'zustand'
import type { Content } from '../api/content'
import type { DifficultyModifiers } from '../api/types'
import { local } from '../lib/storage'

interface DifficultyChoice {
  presetId: string
  custom: DifficultyModifiers | null
  setPreset: (id: string) => void
  setCustom: (modifiers: DifficultyModifiers | null) => void
}

const KEY = 'td.difficulty'
const stored = local.get<{ presetId: string; custom: DifficultyModifiers | null }>(KEY)

export const useDifficultyChoice = create<DifficultyChoice>((set, get) => ({
  presetId: stored?.presetId ?? 'engineer',
  custom: stored?.custom ?? null,
  setPreset: (presetId) => {
    set({ presetId, custom: null })
    local.set(KEY, { presetId, custom: null })
  },
  setCustom: (custom) => {
    set({ custom })
    local.set(KEY, { presetId: get().presetId, custom })
  },
}))

/** Unlock level for a commander feature, derived from content (e.g. custom difficulty at level 5). */
export function featureLevel(content: Content, featureId: string): number {
  return content.bundle.commander.rewards.find((r) => r.kind === 'feature' && r.id === featureId)?.level ?? 1
}
