import { useQuery } from '@tanstack/react-query'
import { idb } from '../lib/storage'
import { OfflineError, rawRequest } from './http'
import type {
  ContentBundle,
  EnemyDefinition,
  LevelSummary,
  MapDefinition,
  ResearchNode,
  TowerDefinition,
} from './types'

const CACHE_KEY = 'content-bundle'

/** The server-authored content bundle plus lookup tables. Immutable once built. */
export interface Content {
  bundle: ContentBundle
  towers: Map<string, TowerDefinition>
  enemies: Map<string, EnemyDefinition>
  maps: Map<string, MapDefinition>
  research: Map<string, ResearchNode>
  levels: Map<string, LevelSummary>
}

export function indexContent(bundle: ContentBundle): Content {
  return {
    bundle,
    towers: new Map(bundle.towers.map((t) => [t.id, t])),
    enemies: new Map(bundle.enemies.map((e) => [e.id, e])),
    maps: new Map(bundle.maps.map((m) => [m.id, m])),
    research: new Map(bundle.research.map((r) => [r.id, r])),
    levels: new Map([...bundle.campaign, ...bundle.challenges].map((l) => [l.id, l])),
  }
}

/**
 * Loads content with an ETag revalidation against the IndexedDB copy, so repeat launches transfer nothing and the
 * game still boots offline with the last known content.
 */
export async function loadContent(): Promise<Content> {
  const cached = await idb.get<ContentBundle>(CACHE_KEY)
  try {
    const response = await rawRequest('/api/content', {
      auth: false,
      headers: cached ? { 'If-None-Match': `"${cached.version}"` } : {},
    })
    if (response.status === 304 && cached) {
      return indexContent(cached)
    }
    if (!response.ok) {
      throw new Error(`Content request failed (${response.status})`)
    }
    const bundle = (await response.json()) as ContentBundle
    void idb.set(CACHE_KEY, bundle)
    return indexContent(bundle)
  } catch (error) {
    if (cached && (error instanceof OfflineError || error instanceof Error)) {
      return indexContent(cached)
    }
    throw error
  }
}

export function useContent() {
  return useQuery({ queryKey: ['content'], queryFn: loadContent, staleTime: Infinity, gcTime: Infinity })
}

/** For components rendered below the content gate in the app shell. */
export function useLoadedContent(): Content {
  const { data } = useContent()
  if (!data) {
    throw new Error('Content accessed before it was loaded.')
  }
  return data
}
