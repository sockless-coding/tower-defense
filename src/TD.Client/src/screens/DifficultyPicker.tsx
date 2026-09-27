import { useMemo } from 'react'
import { create } from 'zustand'
import type { Content } from '../api/content'
import type { DifficultyModifiers } from '../api/types'
import { clampToRange, rewardMultiplier } from '../lib/difficulty'
import { local } from '../lib/storage'
import { Icon } from '../ui/Icon'

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

export function DifficultyPicker({ content, commanderLevel }: { content: Content; commanderLevel: number }) {
  const { presetId, custom, setPreset, setCustom } = useDifficultyChoice()
  const { presets, ranges } = content.bundle.difficulty
  const preset = presets.find((p) => p.id === presetId) ?? presets[1]
  const modifiers = custom ?? preset.modifiers
  const multiplier = useMemo(() => rewardMultiplier(modifiers, ranges), [modifiers, ranges])
  const customUnlocked = commanderLevel >= featureLevel(content, 'feature.customDifficulty')

  return (
    <div className="difficulty">
      <div className="difficulty-presets">
        {presets.map((p) => {
          const locked = commanderLevel < p.requiredCommanderLevel
          return (
            <button
              key={p.id}
              type="button"
              disabled={locked}
              className={`difficulty-preset ${p.id === presetId && !custom ? 'selected' : ''}`}
              onClick={() => setPreset(p.id)}
              title={locked ? `Requires Commander level ${p.requiredCommanderLevel}` : p.description}
            >
              {locked && <Icon name="lock" size={12} />} {p.name}
            </button>
          )
        })}
      </div>
      <p className="muted difficulty-desc">{custom ? 'Custom modifiers' : preset.description}</p>

      <div className="difficulty-reward">
        Reward multiplier <b>×{multiplier.toFixed(2)}</b>
      </div>

      {customUnlocked ? (
        <details className="difficulty-custom" open={custom !== null}>
          <summary>Custom modifiers</summary>
          {ranges.map((range) => (
            <label key={range.key} className="slider-row">
              <span>{range.name}</span>
              <input
                type="range"
                min={range.min}
                max={range.max}
                step={range.step}
                value={modifiers[range.key]}
                onChange={(e) => setCustom({ ...modifiers, [range.key]: clampToRange(Number(e.target.value), range) })}
              />
              <b>{range.key === 'fog' || range.key === 'eliteChance' ? `${Math.round(modifiers[range.key] * 100)}%` : `×${modifiers[range.key].toFixed(2)}`}</b>
            </label>
          ))}
        </details>
      ) : (
        <p className="muted small">
          <Icon name="lock" size={12} /> Custom modifiers unlock at Commander level {featureLevel(content, 'feature.customDifficulty')}.
        </p>
      )}
    </div>
  )
}
