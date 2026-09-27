import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLoadedContent } from '../api/content'
import { api } from '../api/http'
import { watchLeaderboard } from '../api/live'
import { useEvents, useProgression } from '../api/sessions'
import { GearBackdrop, GearSpinner, Panel, ScreenHeader } from '../ui/components'
import { Icon } from '../ui/Icon'
import './screens.css'

interface Row {
  rank: number
  displayName: string
  score: number
  waves: number
  stars: number
  achievedAt: string
  isMe: boolean
}

interface Board {
  boardKey: string
  entries: number
  top: Row[]
  me: Row | null
}

export function LeaderboardsScreen() {
  const content = useLoadedContent()
  const progression = useProgression()
  const events = useEvents()
  const [params, setParams] = useSearchParams()

  const options = useMemo(() => {
    const list: { key: string; label: string }[] = []
    if (events.data) {
      list.push({ key: events.data.daily.boardKey, label: `Daily · ${events.data.daily.key}` })
      list.push({ key: events.data.weekly.boardKey, label: `Weekly · ${events.data.weekly.key}` })
    }
    for (const m of content.bundle.maps) {
      list.push({ key: `survival:${m.id}`, label: `Survival · ${m.name}` })
      list.push({ key: `endless:${m.id}`, label: `Endless · ${m.name}` })
    }
    for (const l of [...content.bundle.campaign, ...content.bundle.challenges]) {
      if (progression.data?.levels[l.id]) list.push({ key: `level:${l.id}`, label: `${l.mode === 'campaign' ? `Level ${l.number}` : 'Challenge'} · ${l.name}` })
    }
    return list
  }, [content, events.data, progression.data])

  const board = params.get('board') ?? options[0]?.key ?? ''
  const [top] = useState(50)
  const query = useQuery({
    queryKey: ['leaderboard', board],
    queryFn: () => api<Board>(`/api/leaderboards/${encodeURIComponent(board)}?top=${top}`),
    enabled: board.length > 0,
    refetchInterval: 60_000,
  })

  useEffect(() => (board ? watchLeaderboard(board) : undefined), [board])

  return (
    <div className="screen">
      <GearBackdrop />
      <ScreenHeader title="Rankings" />
      <div className="leaderboard-bar">
        <select value={board} onChange={(e) => setParams({ board: e.target.value })}>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="screen-scroll">
        <Panel className="leaderboard">
          {!query.data ? (
            <GearSpinner />
          ) : query.data.top.length === 0 ? (
            <p className="muted">No commanders have posted a score here yet. Be the first.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Commander</th>
                  <th>Score</th>
                  <th>Waves</th>
                  <th>Stars</th>
                </tr>
              </thead>
              <tbody>
                {query.data.top.map((r) => (
                  <tr key={r.rank} className={r.isMe ? 'me' : ''}>
                    <td>{r.rank <= 3 ? <Icon name="trophy" size={14} style={{ color: ['#ffd25a', '#d8dde2', '#d08a50'][r.rank - 1] }} /> : r.rank}</td>
                    <td>{r.displayName}</td>
                    <td>{r.score.toLocaleString()}</td>
                    <td>{r.waves}</td>
                    <td>{'★'.repeat(r.stars)}</td>
                  </tr>
                ))}
                {query.data.me && !query.data.top.some((r) => r.isMe) && (
                  <tr className="me">
                    <td>{query.data.me.rank}</td>
                    <td>{query.data.me.displayName}</td>
                    <td>{query.data.me.score.toLocaleString()}</td>
                    <td>{query.data.me.waves}</td>
                    <td>{'★'.repeat(query.data.me.stars)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          {query.data && <p className="muted small">{query.data.entries.toLocaleString()} commanders ranked · updates live</p>}
        </Panel>
      </div>
    </div>
  )
}
