/**
 * Mulberry32, bit-for-bit identical to the server's SeededRandom (see SeededRandomTests on both sides).
 * The simulation must never call Math.random: every random choice flows from the session seed.
 */
export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  nextUint(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }

  next(): number {
    return this.nextUint() / 4294967296
  }

  int(maxExclusive: number): number {
    return maxExclusive <= 0 ? 0 : Math.floor(this.next() * maxExclusive)
  }

  chance(p: number): boolean {
    return p > 0 && this.next() < p
  }

  pick<T>(items: readonly T[]): T | undefined {
    return items.length === 0 ? undefined : items[this.int(items.length)]
  }
}

/** FNV-1a 32-bit over UTF-16 code units, matching SeededRandom.Hash. */
export function hashString(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash >>> 0
}
