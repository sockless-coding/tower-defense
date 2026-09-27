import { create } from 'zustand'
import type { SessionStart } from '../api/sessions'
import type { CompletionResult } from '../api/sessions'
import type { TargetMode } from '../game/sim/types'

export interface UpgradeOption {
  id: string
  tier: number
  branch: string
  name: string
  description: string
  cost: number
  affordable: boolean
  allowed: boolean
  reason: string | null
}

export interface SelectedTowerInfo {
  id: number
  towerId: string
  name: string
  category: string
  level: number
  upgrades: string[]
  kills: number
  damage: number
  targetMode: TargetMode
  sellValue: number
  canSell: boolean
  stats: { key: string; value: number }[]
  options: UpgradeOption[]
  synergies: string[]
  stunned: boolean
}

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'warn' | 'boss' | 'good'
}

/** HUD snapshot published by the GameController a few times per second. React never reads the sim directly. */
export interface HudState {
  ready: boolean
  loadingLabel: string
  gold: number
  cores: number
  vaultCores: number
  coresTotal: number
  wave: number
  waveCount: number
  nextWaveIn: number | null
  earlyBonus: number
  canCallWave: boolean
  waitingForFirstWave: boolean
  speed: number
  maxSpeed: number
  paused: boolean
  outcome: 'playing' | 'victory' | 'defeat'
  buildSelection: string | null
  selected: SelectedTowerInfo | null
  interaction: { name: string; description: string; ready: boolean; cooldownLeft: number; cooldown: number; targeting: boolean; disabled: boolean }
  boss: { name: string; hp: number; maxHp: number } | null
  toasts: Toast[]
  submitting: boolean
  result: CompletionResult | null
  error: string | null
  lastSaved: number | null
}

export const initialHud: HudState = {
  ready: false,
  loadingLabel: 'Stoking the boilers…',
  gold: 0,
  cores: 0,
  vaultCores: 0,
  coresTotal: 0,
  wave: 0,
  waveCount: 0,
  nextWaveIn: null,
  earlyBonus: 0,
  canCallWave: true,
  waitingForFirstWave: true,
  speed: 1,
  maxSpeed: 1,
  paused: false,
  outcome: 'playing',
  buildSelection: null,
  selected: null,
  interaction: { name: '', description: '', ready: false, cooldownLeft: 0, cooldown: 1, targeting: false, disabled: false },
  boss: null,
  toasts: [],
  submitting: false,
  result: null,
  error: null,
  lastSaved: null,
}

export const useHud = create<HudState>(() => initialHud)

/** The session the player is about to play (set by the briefing, consumed by the game screen). */
export const useActiveSession = create<{ session: SessionStart | null; resumeSlot: number | null; set: (s: SessionStart | null, resumeSlot?: number | null) => void }>((set) => ({
  session: null,
  resumeSlot: null,
  set: (session, resumeSlot = null) => set({ session, resumeSlot }),
}))
