import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../api/account'
import { useLoadedContent } from '../api/content'
import { useProgression } from '../api/sessions'
import { roman } from '../lib/labels'
import { GearBackdrop, ScreenHeader, Stat, Tabs } from '../ui/components'
import { Icon } from '../ui/Icon'
import { MapThumbnail } from '../ui/MapThumbnail'
import './screens.css'

const ACT_NAMES = ['Reconnaissance', 'Encroachment', 'Siege', 'Onslaught']

export function CampaignScreen() {
  const content = useLoadedContent()
  const navigate = useNavigate()
  const profile = useProfile()
  const progression = useProgression()
  const highest = progression.data?.highestCampaignLevel ?? 0
  const [act, setAct] = useState('0')
  const levels = content.bundle.campaign.filter((l) => String(l.variant) === act)

  return (
    <div className="screen">
      <GearBackdrop />
      <ScreenHeader
        title="Campaign"
        right={
          profile.data && (
            <>
              <Stat icon="gear" value={profile.data.gears.toLocaleString()} label="Gears" />
              <Stat icon="flask" value={profile.data.researchPoints} label="Research points" color="var(--aether)" />
            </>
          )
        }
      />
      <Tabs
        tabs={ACT_NAMES.map((name, i) => ({ id: String(i), label: `Act ${roman(i)} · ${name}` }))}
        value={act}
        onChange={setAct}
      />
      <div className="screen-scroll">
        <div className="level-grid">
          {levels.map((level) => {
            const map = content.maps.get(level.mapId)!
            const locked = level.number > highest + 1
            const stars = progression.data?.levels[level.id]?.stars ?? 0
            return (
              <button
                key={level.id}
                type="button"
                className={`level-card ${locked ? 'locked' : ''} ${level.number === highest + 1 ? 'next' : ''}`}
                onClick={() => !locked && navigate(`/level/${level.id}`)}
                disabled={locked}
              >
                <div className="level-card-thumb">
                  <MapThumbnail map={map} width={200} />
                  <span className="level-card-number">{level.number}</span>
                  {locked && (
                    <span className="level-card-lock">
                      <Icon name="lock" size={22} />
                    </span>
                  )}
                  {stars > 0 && (
                    <span className="level-card-stars">
                      {[1, 2, 3].map((i) => (
                        <Icon key={i} name="star" size={13} style={{ color: i <= stars ? '#ffd25a' : 'rgba(0,0,0,0.55)' }} />
                      ))}
                    </span>
                  )}
                  {level.bossId && (
                    <span className="level-card-boss" title={content.enemies.get(level.bossId)?.name}>
                      <Icon name="skull" size={16} />
                    </span>
                  )}
                </div>
                <div className="level-card-name">{level.name}</div>
                <div className="level-card-meta muted">
                  <Icon name="wave" size={14} /> {level.waveCount} waves
                  {level.unlocksTowers.length > 0 && (
                    <span className="level-card-unlock" title="Unlocks a new tower">
                      <Icon name="plus" size={12} /> {content.towers.get(level.unlocksTowers[0])?.name}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
