import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../api/account'
import { useLoadedContent } from '../api/content'
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
            return (
              <button key={level.id} type="button" className="level-card" onClick={() => navigate(`/level/${level.id}`)}>
                <div className="level-card-thumb">
                  <MapThumbnail map={map} width={200} />
                  <span className="level-card-number">{level.number}</span>
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
