import { useMemo } from 'react'
import type { Content } from '../api/content'
import { clampToRange, rewardMultiplier } from '../lib/difficulty'
import { featureLevel, useDifficultyChoice } from '../state/difficulty'
import { Icon } from '../ui/Icon'

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
