import { useEffect, useRef } from 'react'
import { saveSettings } from '../api/account'
import { useAuth } from '../state/auth'
import { type QualityTier, type Settings, useSettings } from '../state/settings'
import { GearBackdrop, Panel, ScreenHeader, Tabs } from '../ui/components'
import { SUPPORT_URL } from '../lib/links'
import { Icon } from '../ui/Icon'
import './screens.css'

const volumes: [keyof Settings, string][] = [
  ['masterVolume', 'Master'],
  ['musicVolume', 'Music'],
  ['sfxVolume', 'Effects'],
  ['ambienceVolume', 'Ambience'],
]

const toggles: [keyof Settings, string][] = [
  ['damageNumbers', 'Show damage numbers'],
  ['screenShake', 'Screen shake'],
  ['showGrid', 'Always show build grid'],
  ['confirmSell', 'Confirm before selling'],
]

export function SettingsScreen() {
  const { settings, update } = useSettings()
  const signedIn = useAuth((s) => s.session !== null)
  const first = useRef(true)

  // Preferences follow the player across devices: push changes to the profile, debounced.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!signedIn) return
    const timer = window.setTimeout(() => void saveSettings({ ...settings }).catch(() => undefined), 800)
    return () => window.clearTimeout(timer)
  }, [settings, signedIn])

  return (
    <div className="screen">
      <GearBackdrop />
      <ScreenHeader title="Settings" />
      <div className="screen-scroll settings">
        <Panel title="Graphics">
          <Tabs<QualityTier>
            tabs={(['auto', 'low', 'medium', 'high', 'ultra'] as const).map((q) => ({ id: q, label: q }))}
            value={settings.quality}
            onChange={(quality) => update({ quality })}
          />
          <p className="muted small">Auto picks a tier from your device's GPU and screen, and adapts if the frame rate drops.</p>
        </Panel>
        <Panel title="Audio">
          {volumes.map(([key, label]) => (
            <label key={key} className="slider-row">
              <span>{label}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings[key] as number}
                onChange={(e) => update({ [key]: Number(e.target.value) } as Partial<Settings>)}
              />
              <b>{Math.round((settings[key] as number) * 100)}%</b>
            </label>
          ))}
        </Panel>
        <Panel title="Gameplay">
          {toggles.map(([key, label]) => (
            <label key={key} className="toggle-row">
              <input type="checkbox" checked={settings[key] as boolean} onChange={(e) => update({ [key]: e.target.checked } as Partial<Settings>)} />
              <span>{label}</span>
            </label>
          ))}
        </Panel>
        <Panel title="Support">
          <p className="muted small">Sockless Tower Defense is free to play, with no ads or purchases. If you enjoy it, you can support development with a coffee.</p>
          <a className="btn btn-copper btn-md support-link" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
            <Icon name="coffee" size={18} />
            <span>Buy me a coffee</span>
          </a>
        </Panel>
      </div>
    </div>
  )
}
