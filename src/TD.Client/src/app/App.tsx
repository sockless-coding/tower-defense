import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useProfile } from '../api/account'
import { useContent } from '../api/content'
import { startLive } from '../api/live'
import { AuthScreen } from '../screens/AuthScreen'
import { BriefingScreen } from '../screens/BriefingScreen'
import { CampaignScreen } from '../screens/CampaignScreen'
import { CodexScreen } from '../screens/CodexScreen'
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
