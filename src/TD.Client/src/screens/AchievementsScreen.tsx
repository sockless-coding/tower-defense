import { useState } from 'react'
import { useLoadedContent } from '../api/content'
import { useProgression } from '../api/sessions'
import { titleCase } from '../lib/labels'
import { GearBackdrop, GearSpinner, ProgressBar, ScreenHeader, Tabs } from '../ui/components'
import { Icon } from '../ui/Icon'
import './screens.css'

export function AchievementsScreen() {
  const content = useLoadedContent()
  const progression = useProgression()
  const [category, setCategory] = useState('all')
  const p = progression.data
  if (!p) {
    return (
      <div className="screen center">
        <GearBackdrop />
        <GearSpinner label="Polishing the medals…" />
      </div>
    )
  }
  const status = new Map(p.achievements.map((a) => [a.id, a]))
  const categories = ['all', ...new Set(content.bundle.achievements.map((a) => a.category))]
  const list = content.bundle.achievements.filter((a) => category === 'all' || a.category === category)
  const done = p.achievements.filter((a) => a.unlocked).length

  return (
    <div className="screen">
      <GearBackdrop />
      <ScreenHeader title="Achievements" right={<span className="stat"><Icon name="trophy" size={16} /> <b>{done}/{content.bundle.achievements.length}</b></span>} />
      <Tabs tabs={categories.map((c) => ({ id: c, label: titleCase(c) }))} value={category} onChange={setCategory} />
      <div className="screen-scroll">
        <div className="achievement-grid">
          {list.map((a) => {
            const s = status.get(a.id)
            const unlocked = s?.unlocked ?? false
            const progress = Math.min(a.threshold, s?.progress ?? 0)
            return (
              <div key={a.id} className={`achievement ${unlocked ? 'unlocked' : ''}`}>
                <span className="ach-medal">
                  <Icon name={unlocked ? 'trophy' : 'lock'} size={22} />
                </span>
                <div className="ach-body">
                  <b>{a.name}</b>
                  <p>{a.description}</p>
                  {!unlocked && a.threshold > 1 && <ProgressBar value={progress} max={a.threshold} label={`${progress.toLocaleString()} / ${a.threshold.toLocaleString()}`} />}
                  <span className="ach-reward">
                    <Icon name="gear" size={11} /> {a.rewardGears}
                    {a.rewardCosmetic && <> · {content.bundle.commander.cosmetics.find((c) => c.id === a.rewardCosmetic)?.name}</>}
                    {unlocked && s?.unlockedAt && <> · {new Date(s.unlockedAt).toLocaleDateString()}</>}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
