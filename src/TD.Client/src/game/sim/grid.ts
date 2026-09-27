import type { MapDefinition } from '../../api/types'
import type { Vec } from './types'

const WALKABLE = new Set(['.', '=', 'S', 'E', 'C', 'G', '~'])
const BUILDABLE = new Set(['.', 'B'])
const SQRT2 = Math.SQRT2

const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
]

/** A distance field toward a goal set plus the best next cell from every cell. */
export interface FlowField {
  dist: Float64Array
  next: Int32Array
}

/**
 * The walkable/buildable grid. Towers on floor tiles block movement, so every change triggers a flow-field rebuild —
 * this is what makes routes dynamic, Defense Grid style.
 */
export class Grid {
  readonly width: number
  readonly height: number
  readonly chars: string[]
  readonly core: number
  readonly spawns: number[]
  readonly exits: number[]
  /** Temporarily impassable (closed gate, flooded channel). */
  readonly closed: Uint8Array
  /** Permanently impassable after collapse. */
  readonly crumbled: Uint8Array
  readonly tower: Int32Array
  toCore!: FlowField
  toExit!: FlowField

  constructor(map: MapDefinition) {
    this.chars = map.grid.map((row) => row)
    this.height = map.grid.length
    this.width = map.grid[0].length
    const n = this.width * this.height
    this.closed = new Uint8Array(n)
    this.crumbled = new Uint8Array(n)
    this.tower = new Int32Array(n)
    const spawns: number[] = []
    const exits: number[] = []
    let core = -1
    for (let i = 0; i < n; i++) {
      const c = this.charAt(i)
      if (c === 'S') {
        spawns.push(i)
        exits.push(i)
      } else if (c === 'E') exits.push(i)
      else if (c === 'C') core = i
    }
    this.core = core
    this.spawns = spawns
    this.exits = exits
    this.rebuild()
  }

  index(x: number, y: number): number {
    return y * this.width + x
  }

  cellOf(p: Vec): number {
    const x = Math.min(this.width - 1, Math.max(0, Math.floor(p.x)))
    const y = Math.min(this.height - 1, Math.max(0, Math.floor(p.y)))
    return this.index(x, y)
  }

  center(i: number): Vec {
    return { x: (i % this.width) + 0.5, y: Math.floor(i / this.width) + 0.5 }
  }

  charAt(i: number): string {
    return this.chars[Math.floor(i / this.width)][i % this.width]
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height
  }

  isWalkable(i: number): boolean {
    return WALKABLE.has(this.charAt(i)) && this.closed[i] === 0 && this.crumbled[i] === 0 && this.tower[i] === 0
  }

  isBuildable(i: number): boolean {
    return BUILDABLE.has(this.charAt(i)) && this.tower[i] === 0
  }

  /** Floor tiles are both walkable and buildable; building there reshapes routes. */
  blocksPath(i: number): boolean {
    return this.charAt(i) === '.'
  }

  cellsOf(char: string): number[] {
    const out: number[] = []
    for (let i = 0; i < this.width * this.height; i++) if (this.charAt(i) === char) out.push(i)
    return out
  }

  rebuild(): void {
    this.toCore = this.field([this.core])
    this.toExit = this.field(this.exits)
  }

  /** Dijkstra over 8-neighbour moves; diagonals only when both orthogonal cells are open (no corner cutting). */
  field(goals: number[], extraBlocked = -1): FlowField {
    const n = this.width * this.height
    const dist = new Float64Array(n).fill(Infinity)
    const next = new Int32Array(n).fill(-1)
    const heap = new MinHeap()
    const open = (i: number) => i !== extraBlocked && this.isWalkable(i)
    for (const g of goals) {
      dist[g] = 0
      heap.push(g, 0)
    }
    while (heap.size > 0) {
      const [i, d] = heap.pop()
      if (d > dist[i]) continue
      const x = i % this.width
      const y = Math.floor(i / this.width)
      for (const [dx, dy, cost] of DIRS) {
        const nx = x + dx
        const ny = y + dy
        if (!this.inBounds(nx, ny)) continue
        const j = this.index(nx, ny)
        if (!open(j)) continue
        if (dx !== 0 && dy !== 0 && (!open(this.index(x + dx, y)) || !open(this.index(x, y + dy)))) continue
        const nd = d + cost
        if (nd < dist[j]) {
          dist[j] = nd
          next[j] = i
          heap.push(j, nd)
        }
      }
    }
    return { dist, next }
  }

  /**
   * The server's placement rule: with every gate treated as open, all spawns must still reach the core and the core
   * must reach an exit. The client additionally honours collapsed floor, which is only ever stricter.
   */
  routesIntact(extraBlocked: number): boolean {
    const reach = new Uint8Array(this.width * this.height)
    const walk = (i: number) =>
      i !== extraBlocked && WALKABLE.has(this.charAt(i)) && this.crumbled[i] === 0 && this.tower[i] === 0
    const queue = [this.core]
    reach[this.core] = 1
    while (queue.length > 0) {
      const i = queue.pop()!
      const x = i % this.width
      const y = Math.floor(i / this.width)
      for (let k = 0; k < 4; k++) {
        const [dx, dy] = DIRS[k]
        const nx = x + dx
        const ny = y + dy
        if (!this.inBounds(nx, ny)) continue
        const j = this.index(nx, ny)
        if (reach[j] || !walk(j)) continue
        reach[j] = 1
        queue.push(j)
      }
    }
    return this.spawns.every((s) => reach[s] === 1) && this.exits.some((e) => reach[e] === 1)
  }

  /** Best next cell toward the field's goal, tolerating a current cell that has just become blocked. */
  step(field: FlowField, i: number): number {
    if (field.next[i] >= 0 || field.dist[i] === 0) return field.next[i]
    const x = i % this.width
    const y = Math.floor(i / this.width)
    let best = -1
    let bestDist = Infinity
    for (const [dx, dy] of DIRS) {
      const nx = x + dx
      const ny = y + dy
      if (!this.inBounds(nx, ny)) continue
      const j = this.index(nx, ny)
      if (field.dist[j] < bestDist) {
        bestDist = field.dist[j]
        best = j
      }
    }
    return best
  }

  /** The cell an enemy came from: the open neighbour furthest along the reverse gradient. */
  stepBack(field: FlowField, i: number): number {
    const x = i % this.width
    const y = Math.floor(i / this.width)
    const here = field.dist[i]
    let best = -1
    let bestDist = -Infinity
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = DIRS[k]
      const nx = x + dx
      const ny = y + dy
      if (!this.inBounds(nx, ny)) continue
      const j = this.index(nx, ny)
      const d = field.dist[j]
      if (Number.isFinite(d) && d > here && d <= here + 1.01 && d > bestDist) {
        bestDist = d
        best = j
      }
    }
    return best
  }
}

class MinHeap {
  private items: number[] = []
  private keys: number[] = []

  get size(): number {
    return this.items.length
  }

  push(item: number, key: number): void {
    this.items.push(item)
    this.keys.push(key)
    let i = this.items.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.keys[p] <= this.keys[i]) break
      this.swap(i, p)
      i = p
    }
  }

  pop(): [number, number] {
    const top: [number, number] = [this.items[0], this.keys[0]]
    const lastItem = this.items.pop()!
    const lastKey = this.keys.pop()!
    if (this.items.length > 0) {
      this.items[0] = lastItem
      this.keys[0] = lastKey
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l
        if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
    return top
  }

  private swap(a: number, b: number): void {
    ;[this.items[a], this.items[b]] = [this.items[b], this.items[a]]
    ;[this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]]
  }
}
