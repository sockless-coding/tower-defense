import { useQuery } from '@tanstack/react-query'
import { api } from './http'
import type { LevelDefinition } from './types'

export function useLevel(id: string | undefined) {
  return useQuery({
    queryKey: ['level', id],
    queryFn: () => api<LevelDefinition>(`/api/levels/${id}`, { auth: false }),
    enabled: !!id,
    staleTime: Infinity,
  })
}
