import { HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr'
import type { QueryClient } from '@tanstack/react-query'
import { useAuth } from '../state/auth'
import { refreshSession } from './http'

let connection: HubConnection | null = null

/**
 * Connects to the server push hub while signed in. The hub only ever tells the client that server-owned state
 * changed; the client then refetches it through the normal API.
 */
export function startLive(queryClient: QueryClient): () => void {
  const connect = async () => {
    await stop()
    if (!useAuth.getState().session) {
      return
    }

    connection = new HubConnectionBuilder()
      .withUrl('/hubs/live', {
        accessTokenFactory: async () => {
          const session = useAuth.getState().session
          if (session && session.accessTokenExpiresAt - Date.now() < 30_000) {
            await refreshSession()
          }
          return useAuth.getState().session?.accessToken ?? ''
        },
      })
      .withAutomaticReconnect([0, 2000, 5000, 15000, 30000])
      .configureLogging(LogLevel.Warning)
      .build()

    connection.on('ProfileChanged', () => queryClient.invalidateQueries({ queryKey: ['profile'] }))
    connection.on('SaveGameChanged', () => queryClient.invalidateQueries({ queryKey: ['saves'] }))
    connection.on('LeaderboardUpdated', (m: { boardKey: string }) =>
      queryClient.invalidateQueries({ queryKey: ['leaderboard', m.boardKey] }),
    )
    connection.on('EventRotated', () => queryClient.invalidateQueries({ queryKey: ['events'] }))

    try {
      await connection.start()
    } catch {
      // Live updates are optional; the app works without them.
    }
  }

  void connect()
  let lastAccount = useAuth.getState().session?.accountId
  const unsubscribe = useAuth.subscribe((state) => {
    if (state.session?.accountId !== lastAccount) {
      lastAccount = state.session?.accountId
      void connect()
    }
  })

  return () => {
    unsubscribe()
    void stop()
  }
}

async function stop() {
  if (connection) {
    const old = connection
    connection = null
    try {
      await old.stop()
    } catch {
      // Ignore.
    }
  }
}

export function watchLeaderboard(boardKey: string): () => void {
  void connection?.invoke('WatchLeaderboard', boardKey).catch(() => undefined)
  return () => void connection?.invoke('UnwatchLeaderboard', boardKey).catch(() => undefined)
}
