import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout, playAsGuest, useProfile } from '../api/account'
import { useLoadedContent } from '../api/content'
import { useAuth } from '../state/auth'
import { Button, GearBackdrop } from '../ui/components'
import { Icon } from '../ui/Icon'
import './screens.css'

export function TitleScreen() {
  const navigate = useNavigate()
  const session = useAuth((s) => s.session)
  const profile = useProfile()
  const content = useLoadedContent()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ensureSignedIn = async (then: string) => {
    setError(null)
    if (!session) {
      setBusy(true)
      try {
        await playAsGuest()
      } catch (e) {
        setError((e as Error).message)
        setBusy(false)
        return
      }
      setBusy(false)
    }
    navigate(then)
  }

  return (
    <div className="screen title-screen">
      <GearBackdrop />
      <div className="title-logo">
        <div className="title-spark" aria-hidden="true" />
        <h1 className="title-name engraved">Sockless</h1>
        <div className="title-sub">
          <span />
          <h2>Tower Defense</h2>
          <span />
        </div>
      </div>

      <nav className="title-menu">
        <Button size="lg" icon="play" disabled={busy} onClick={() => ensureSignedIn('/campaign')}>
          {session ? 'Campaign' : 'Play'}
        </Button>
        <Button size="lg" variant="iron" icon="book" onClick={() => navigate('/codex')}>
          Engineer's Codex
        </Button>
        <Button size="lg" variant="iron" icon="gear" onClick={() => navigate('/settings')}>
          Settings
        </Button>
        {error && <p className="error-text">{error}</p>}
      </nav>

      <footer className="title-footer">
        <div className="account-badge">
          <Icon name="user" size={18} />
          {session ? (
            <>
              <span>
                {profile.data?.displayName ?? session.displayName}
                {profile.data && <em> · Commander {profile.data.commanderLevel}</em>}
              </span>
              {session.kind === 'guest' ? (
                <Button size="sm" variant="copper" onClick={() => navigate('/auth?mode=upgrade')}>
                  Secure progress
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => void logout()}>
                  Sign out
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" variant="iron" onClick={() => navigate('/auth?mode=login')}>
              Sign in
            </Button>
          )}
        </div>
        <span className="muted version">Content {content.bundle.version}</span>
      </footer>
    </div>
  )
}
