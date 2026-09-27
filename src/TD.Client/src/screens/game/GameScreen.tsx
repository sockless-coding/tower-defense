import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLoadedContent } from '../../api/content'
import { abandonSession, getSave, getSession, useProgression, type SessionStart } from '../../api/sessions'
import { AUTOSAVE_SLOT, GameController } from '../../game/GameController'
import { useActiveSession, useHud } from '../../state/game'
import { useSettings } from '../../state/settings'
import { Button, GearSpinner, Modal } from '../../ui/components'
import { GameHud } from './Hud'
import { ResultsOverlay } from './Results'
import './game.css'

export function GameScreen() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const content = useLoadedContent()
  const settings = useSettings((s) => s.settings)
  const progression = useProgression()
  const active = useActiveSession()
  const hostRef = useRef<HTMLDivElement>(null)
  const [game, setGame] = useState<GameController | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const hud = useHud()

  useEffect(() => {
    if (!sessionId || !hostRef.current || !progression.data) return
    let controller: GameController | null = null
    let cancelled = false
    const host = hostRef.current
    ;(async () => {
      try {
        let session: SessionStart | null = active.session?.sessionId === sessionId ? active.session : null
        session ??= await getSession(sessionId)
        let resume = null
        if (active.resumeSlot !== null) {
          const save = await getSave(active.resumeSlot)
          if (save.sessionId === sessionId) resume = { tick: save.tick, actions: save.actions }
        }
        if (cancelled) return
        controller = await GameController.create({ parent: host, session, content, settings, features: progression.data.features, resume })
        if (cancelled) {
          controller.destroy()
          return
        }
        setGame(controller)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
      controller?.destroy()
      setGame(null)
    }
  }, [sessionId, !!progression.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const level = game?.sim.config.level
  const nextLevelId = level?.mode === 'campaign' ? content.bundle.campaign.find((l) => l.number === level.number + 1)?.id ?? null : null

  const openMenu = () => {
    game?.setPaused(true)
    setMenu(true)
  }
  const closeMenu = () => {
    setMenu(false)
    game?.setPaused(false)
  }
  const quit = async (abandon: boolean) => {
    if (game && abandon && sessionId) await abandonSession(sessionId).catch(() => undefined)
    else await game?.save()
    navigate(level?.mode === 'campaign' ? '/campaign' : '/modes')
  }
  const retry = () => {
    if (level) navigate(level.mode === 'campaign' || level.mode === 'challenge' ? `/level/${level.id}` : '/modes')
  }

  return (
    <div className="game-screen">
      <div className="game-host" ref={hostRef} />
      {(!game || !hud.ready) && (
        <div className="game-loading">
          {error ? (
            <>
              <p className="error-text">{error}</p>
              <Button onClick={() => navigate('/campaign')}>Back to campaign</Button>
            </>
          ) : (
            <GearSpinner label={hud.loadingLabel} />
          )}
        </div>
      )}
      {game && hud.ready && (
        <>
          <GameHud game={game} content={content} onMenu={openMenu} />
          <ResultsOverlay nextLevelId={nextLevelId} onRetry={retry} onRetrySubmit={() => game.retrySubmit()} />
        </>
      )}
      {menu && game && (
        <Modal title="Paused" onClose={closeMenu}>
          <div className="pause-menu">
            <Button icon="play" onClick={closeMenu}>
              Resume
            </Button>
            <Button variant="iron" icon="map" onClick={() => void quit(false)}>
              Save and exit
            </Button>
            <Button variant="danger" icon="close" onClick={() => void quit(true)}>
              Abandon battle
            </Button>
            <p className="muted small">
              Progress autosaves to the cloud (slot {AUTOSAVE_SLOT}) and can be resumed on any device.
              {hud.lastSaved && ` Last saved ${new Date(hud.lastSaved).toLocaleTimeString()}.`}
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
