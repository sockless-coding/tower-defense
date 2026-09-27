import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLoadedContent } from '../../api/content'
import { useRefreshProgress } from '../../api/sessions'
import { useHud } from '../../state/game'
import { Button, Divider, GearSpinner, Panel } from '../../ui/components'
import { Icon } from '../../ui/Icon'
import { TowerPortrait } from '../../ui/Portraits'

export function ResultsOverlay({ nextLevelId, onRetry, onRetrySubmit }: { nextLevelId: string | null; onRetry: () => void; onRetrySubmit: () => void }) {
  const hud = useHud()
  const content = useLoadedContent()
  const navigate = useNavigate()
  const refresh = useRefreshProgress()
  const victory = hud.outcome === 'victory'

  useEffect(() => {
    if (hud.result) refresh()
  }, [hud.result]) // eslint-disable-line react-hooks/exhaustive-deps

  if (hud.outcome === 'playing') return null
  const r = hud.result

  return (
    <div className="modal-scrim results">
      <div className="modal modal-wide">
        <Panel>
          <div className={`results-banner ${victory ? 'win' : 'loss'}`}>
            <h1 className="engraved">{victory ? 'Victory' : 'The Vault Has Fallen'}</h1>
            {victory && r && (
              <div className="stars">
                {[1, 2, 3].map((i) => (
                  <span key={i} className={`star ${i <= r.stars ? 'on' : ''}`} style={{ animationDelay: `${0.25 * i}s` }}>
                    <Icon name="star" size={46} />
                  </span>
                ))}
              </div>
            )}
          </div>

          {hud.submitting && <GearSpinner label="Filing the battle report with Command…" />}
          {hud.error && (
            <div className="results-error">
              <p className="error-text">The report could not be filed: {hud.error}</p>
              <Button size="sm" onClick={onRetrySubmit}>
                Try again
              </Button>
            </div>
          )}

          {r && (
            <>
              <div className="results-grid">
                <div>
                  <span>Score</span>
                  <b>{r.score.toLocaleString()}</b>
                </div>
                <div>
                  <span>
                    <Icon name="star" size={14} /> XP
                  </span>
                  <b>+{r.xpGained.toLocaleString()}</b>
                </div>
                <div>
                  <span>
                    <Icon name="gear" size={14} /> Gears
                  </span>
                  <b>+{r.gearsGained.toLocaleString()}</b>
                </div>
                <div>
                  <span>
                    <Icon name="flask" size={14} /> Research
                  </span>
                  <b>+{r.researchPointsGained}</b>
                </div>
              </div>
              {r.commanderLevelAfter > r.commanderLevelBefore && (
                <p className="level-up">
                  <Icon name="trophy" size={18} /> Commander level {r.commanderLevelAfter}!
                  {r.levelRewards.filter((x) => x.kind !== 'Gears').map((x) => (
                    <span key={x.id} className="chip">
                      {x.name}
                    </span>
                  ))}
                </p>
              )}
              {r.newlyUnlockedTowers.length > 0 && (
                <div className="unlocked-towers">
                  {r.newlyUnlockedTowers.map((id) => {
                    const t = content.towers.get(id)!
                    return (
                      <div key={id} className="unlocked-tower">
                        <TowerPortrait tower={t} size={64} />
                        <span>
                          New tower: <b>{t.name}</b>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
              {r.newAchievements.length > 0 && (
                <div className="new-achievements">
                  {r.newAchievements.map((id) => {
                    const a = content.bundle.achievements.find((x) => x.id === id)
                    return (
                      <span key={id} className="chip">
                        <Icon name="trophy" size={12} /> {a?.name ?? id}
                      </span>
                    )
                  })}
                </div>
              )}
              {r.leaderboardRank && <p className="muted">Leaderboard rank #{r.leaderboardRank}</p>}
            </>
          )}

          <Divider />
          <div className="results-actions">
            <Button variant="iron" icon="map" onClick={() => navigate('/campaign')}>
              Campaign
            </Button>
            <Button variant="iron" icon="wrench" onClick={onRetry}>
              Retry
            </Button>
            {victory && nextLevelId && (
              <Button icon="play" onClick={() => navigate(`/level/${nextLevelId}`)}>
                Next level
              </Button>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
