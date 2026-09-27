import type { Vec } from './types'

export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)
