import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { MusicDirector } from '../game/audio/music'
import { play } from '../game/audio/synth'
import { useProfile } from '../api/account'
import { useContent } from '../api/content'
import { startLive } from '../api/live'
import { AchievementsScreen } from '../screens/AchievementsScreen'
import { AuthScreen } from '../screens/AuthScreen'
import { BriefingScreen } from '../screens/BriefingScreen'
import { CampaignScreen } from '../screens/CampaignScreen'
import { CodexScreen } from '../screens/CodexScreen'
import { CommanderScreen } from '../screens/CommanderScreen'
import { GameScreen } from '../screens/game/GameScreen'
import { Sandbox } from '../screens/game/Sandbox'
import { LeaderboardsScreen } from '../screens/LeaderboardsScreen'
import { ModesScreen } from '../screens/ModesScreen'
import { ResearchScreen } from '../screens/ResearchScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { TitleScreen } from '../screens/TitleScreen'
import { useAuth } from '../state/auth'
import { useSettings } from '../state/settings'
import { Button, GearBackdrop, GearSpinner } from '../ui/components'
import { UpdatePrompt } from './UpdatePrompt'

export function App() {
  const content = useContent()
  const queryClient = useQueryClient()
  const profile = useProfile()
  const hydrate = useSettings((s) => s.hydrate)

  useEffect(() => startLive(queryClient), [queryClient])

  // Menus get the calm workshop theme; battles drive their own score.
  const location = useLocation()
  const inBattle = location.pathname.startsWith('/play') || location.pathname.startsWith('/dev/')
  useEffect(() => {
    const start = () => {
      if (!inBattle) MusicDirector.get().setMode('menu')
    }
    start()
    window.addEventListener('pointerdown', start, { once: true })
    return () => window.removeEventListener('pointerdown', start)
  }, [inBattle])

  // Mechanical click on every control.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest('.btn, .tab, .build-card, .codex-item, .level-card, .speed-btn, .upgrade-btn, .difficulty-preset')
      if (el && !(el as HTMLButtonElement).disabled) play('click', { bus: 'ui', volume: 0.7, cooldown: 0.02 })
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [])

  // Pull synced preferences once the profile arrives.
  useEffect(() => {
    if (profile.data?.settings) hydrate(profile.data.settings)
  }, [profile.data?.accountId, hydrate]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!content.data) {
    return (
      <div className="screen center">
        <GearBackdrop />
        {content.error ? (
          <div style={{ zIndex: 1, textAlign: 'center' }}>
            <p className="error-text">The foundry could not be reached. {(content.error as Error).message}</p>
            <Button onClick={() => content.refetch()} icon="gear">
              Retry
            </Button>
          </div>
        ) : (
          <GearSpinner label="Stoking the boilers…" />
        )}
      </div>
    )
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<TitleScreen />} />
        <Route path="/auth" element={<AuthScreen />} />
        <Route path="/codex" element={<CodexScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/campaign" element={<RequireAccount><CampaignScreen /></RequireAccount>} />
        <Route path="/level/:id" element={<RequireAccount><BriefingScreen /></RequireAccount>} />
        <Route path="/play/:sessionId" element={<RequireAccount><GameScreen /></RequireAccount>} />
        <Route path="/modes" element={<RequireAccount><ModesScreen /></RequireAccount>} />
        <Route path="/research" element={<RequireAccount><ResearchScreen /></RequireAccount>} />
        <Route path="/commander" element={<RequireAccount><CommanderScreen /></RequireAccount>} />
        <Route path="/achievements" element={<RequireAccount><AchievementsScreen /></RequireAccount>} />
        <Route path="/leaderboards" element={<RequireAccount><LeaderboardsScreen /></RequireAccount>} />
        {import.meta.env.DEV && <Route path="/dev/sandbox" element={<Sandbox />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UpdatePrompt />
    </>
  )
}

function RequireAccount({ children }: { children: React.ReactNode }) {
  const session = useAuth((s) => s.session)
  return session ? <>{children}</> : <Navigate to="/" replace />
}
