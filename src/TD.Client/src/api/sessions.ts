import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../state/auth'
import type { Action } from '../game/sim/types'
import { api } from './http'
import type { BonusEffect, DifficultyModifiers, GameMode, LevelDefinition, LevelSummary } from './types'

export interface SessionConfig {
  level: LevelDefinition
  modifiers: DifficultyModifiers
  presetId: string | null
  rewardMultiplier: number
  seed: number
  bonuses: BonusEffect[]
  prestige: Record<string, number>
  unlockedTowers: string[]
}

export interface SessionStart {
  sessionId: string
  token: string
  config: SessionConfig
  contentVersion: string
}

export interface GrantedReward {
  kind: string
  id: string
  name: string
  amount: number
}

export interface CompletionResult {
  outcome: 'victory' | 'defeat'
  stars: number
  previousBestStars: number
  score: number
  xpGained: number
  gearsGained: number
  researchPointsGained: number
  commanderLevelBefore: number
  commanderLevelAfter: number
  levelRewards: GrantedReward[]
  newAchievements: string[]
  newlyUnlockedTowers: string[]
  leaderboardKey: string | null
  leaderboardRank: number | null
}

export interface ProgressionOverview {
  commander: { level: number; totalXp: number; xpIntoLevel: number; xpToNext: number; maxLevel: number }
  gears: number
  researchPoints: number
  highestCampaignLevel: number
  levels: Record<string, { stars: number; bestScore: number; completions: number }>
  research: string[]
  prestige: Record<string, number>
  cosmetics: string[]
  selectedBanner: string
  selectedTitle: string
  achievements: { id: string; unlocked: boolean; unlockedAt: string | null; progress: number }[]
  unlockedTowers: string[]
  features: string[]
  completedMaps: string[]
  statistics: Record<string, number>
  version: number
}

export interface SaveSummary {
  slot: number
  sessionId: string
  tick: number
  summary: string
  updatedAt: string
  version: number
}

export interface SaveDetails extends SaveSummary {
  actions: Action[]
}

export interface StartRequest {
  mode: GameMode
  levelId?: string
  mapId?: string
  presetId?: string
  custom?: DifficultyModifiers | null
}

export const startSession = (request: StartRequest) =>
  api<SessionStart>('/api/sessions', {
    method: 'POST',
    body: { levelId: null, mapId: null, presetId: null, custom: null, ...request },
  })

export const getSession = (id: string) => api<SessionStart>(`/api/sessions/${id}`)

export function completeSession(session: SessionStart, actions: Action[], result: unknown) {
  return api<CompletionResult>(`/api/sessions/${session.sessionId}/complete`, {
    method: 'POST',
    body: { actions, result },
    headers: { 'X-Session-Token': session.token },
  })
}

export const abandonSession = (id: string) => api<void>(`/api/sessions/${id}/abandon`, { method: 'POST' })

export const listSaves = () => api<SaveSummary[]>('/api/saves')
export const getSave = (slot: number) => api<SaveDetails>(`/api/saves/${slot}`)
export const deleteSave = (slot: number) => api<void>(`/api/saves/${slot}`, { method: 'DELETE' })

export function putSave(slot: number, body: { sessionId: string; tick: number; actions: Action[]; summary: string; expectedVersion: number | null }) {
  return api<SaveSummary>(`/api/saves/${slot}`, { method: 'PUT', body })
}

export function useProgression() {
  const signedIn = useAuth((s) => s.session !== null)
  return useQuery({ queryKey: ['progression'], queryFn: () => api<ProgressionOverview>('/api/progression'), enabled: signedIn, staleTime: 15_000 })
}

export function useSaves() {
  const signedIn = useAuth((s) => s.session !== null)
  return useQuery({ queryKey: ['saves'], queryFn: listSaves, enabled: signedIn })
}

export function useRefreshProgress() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: ['progression'] })
    void client.invalidateQueries({ queryKey: ['profile'] })
    void client.invalidateQueries({ queryKey: ['saves'] })
  }
}

export interface LiveEvent {
  kind: 'daily' | 'weekly'
  key: string
  boardKey: string
  endsAt: string
  level: LevelSummary
  presetId: string
  myBest: number | null
}

export function useEvents() {
  const signedIn = useAuth((s) => s.session !== null)
  return useQuery({
    queryKey: ['events'],
    queryFn: () => api<{ daily: LiveEvent; weekly: LiveEvent }>('/api/events'),
    enabled: signedIn,
    staleTime: 60_000,
  })
}
