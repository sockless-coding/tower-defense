import { Texture } from 'pixi.js'
import type { MapDefinition } from '../../api/types'
import {
  BRASS,
  COPPER,
  circle,
  drawGear,
  fbm,
  glow,
  grain,
  hash2,
  IRON,
  makeCanvas,
  type Metal,
  metalGradient,
  pipe,
  radialMetal,
  rgba,
  rivet,
  rivetRing,
  shadeHex,
  STEEL,
  type Ctx,
} from './paint'

export const TILE = 64

export interface LightSpec {
  x: number
  y: number
  color: number
  radius: number
  flicker: number
}

export interface BakedTerrain {
  texture: Texture
  lights: LightSpec[]
  specialKind: string
}

const SPECIAL_KIND: Record<string, string> = {
  floodgates: 'water',
  tides: 'water',
  freezing: 'ice',
  conveyor: 'conveyor',
  steamVents: 'vent',
  pressureValves: 'vent',
  lightningRods: 'rod',
  aetherSurge: 'conduit',
  crumblingFloor: 'cracked',
  rotatingTurntable: 'turntable',
  smog: 'sludge',
}

/**
 * Paints a map grid into one high-resolution texture. The art reads as a top-down industrial district: riveted deck
 * plates, cobbled roads, brass build pads, rooftops with pipes and chimneys, themed special terrain and the vault.
 */
export function bakeTerrain(map: MapDefinition, scale: number): BakedTerrain {
  const cols = map.grid[0].length
  const rows = map.grid.length
  const P = TILE * scale
  const W = cols * P
  const H = rows * P
  const { canvas, ctx } = makeCanvas(W, H)
  const pal = map.palette
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= cols || y >= rows ? '#' : map.grid[y][x])
  const lights: LightSpec[] = []
  const specialKind = map.id === 'glassworks' ? 'lens' : map.id === 'volcanic-forge' ? 'lava' : (SPECIAL_KIND[map.mechanic.kind] ?? 'sludge')
  const seed = hashString(map.id)

  // Ground: soot-stained earth with low-frequency variation, painted at low resolution then smoothly upscaled.
  paintNoise(ctx, W, H, clampLum(pal.ground, 0.3), seed)

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = at(x, y)
      const px = x * P
      const py = y * P
      const h = hash2(x, y, seed)
      switch (c) {
        case '#':
          drawRoof(ctx, px, py, P, pal, h, x, y, seed)
          break
        case '.':
          drawDeck(ctx, px, py, P, pal, h)
          break
        case '=':
          drawCobbles(ctx, px, py, P, pal, x, y, seed)
          break
        case 'B':
          drawDeck(ctx, px, py, P, pal, h)
          drawPad(ctx, px, py, P, pal)
          break
        case 'S':
        case 'E':
          drawDeck(ctx, px, py, P, pal, h)
          drawHatch(ctx, px, py, P, c === 'S')
          lights.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, color: c === 'S' ? 0xff4a1a : 0x4ab0ff, radius: TILE * 2.2, flicker: 0.25 })
          break
        case 'G':
          drawDeck(ctx, px, py, P, pal, h)
          drawGateRails(ctx, px, py, P, at(x - 1, y) === 'G' || at(x + 1, y) === 'G')
          break
        case '~':
          drawSpecial(ctx, specialKind, px, py, P, pal, x, y, seed)
          if (specialKind === 'rod' || specialKind === 'conduit' || specialKind === 'lava' || specialKind === 'lens') {
            const color = specialKind === 'rod' ? 0x9fe0ff : specialKind === 'lava' ? 0xff5a1a : specialKind === 'lens' ? 0xb0fff0 : 0xb070ff
            lights.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, color, radius: TILE * 1.3, flicker: 0.15 })
          }
          break
        case 'C':
          drawDeck(ctx, px, py, P, pal, h)
          break
      }
    }
  }

  // Pipework spans several roof tiles, so it goes down only once every tile is painted.
  drawPipeRuns(ctx, cols, rows, P, at, seed)

  // Ambient occlusion: structures shade the walkways at their feet.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (at(x, y) === '#') continue
      const px = x * P
      const py = y * P
      if (at(x, y - 1) === '#') edgeShadow(ctx, px, py, P, 0, 1)
      if (at(x - 1, y) === '#') edgeShadow(ctx, px, py, P, 1, 0)
      if (at(x + 1, y) === '#') edgeShadow(ctx, px + P, py, P, -1, 0)
    }
  }

  // Structures show a south-facing wall where they meet open ground, selling their height.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (at(x, y) !== '#' || at(x, y + 1) === '#' || y + 1 >= rows) continue
      const px = x * P
      const py = y * P + P * 0.8
      const g = ctx.createLinearGradient(0, py, 0, py + P * 0.2)
      g.addColorStop(0, shadeHex(pal.metal, -0.55))
      g.addColorStop(1, shadeHex(pal.metal, -0.75))
      ctx.fillStyle = g
      ctx.fillRect(px, py, P, P * 0.2)
      ctx.fillStyle = rgba(pal.light, 0.08)
      ctx.fillRect(px, py, P, 1.5 * scale)
      // Occasional lit window on the wall face.
      if (hash2(x, y, seed + 5) > 0.72) {
        const wx = px + P * (0.2 + hash2(x, y, seed + 6) * 0.5)
        ctx.fillStyle = rgba(pal.light, 0.9)
        ctx.fillRect(wx, py + P * 0.05, P * 0.14, P * 0.1)
        lights.push({ x: (wx / P + 0.07) * TILE, y: (y + 1) * TILE, color: parseInt(pal.light.slice(1), 16), radius: TILE * 1.1, flicker: 0.1 })
      }
    }
  }

  // The vault sits over its tile and spills onto neighbours.
  const core = findCell(map, 'C')
  if (core) {
    drawVault(ctx, (core.x + 0.5) * P, (core.y + 0.5) * P, P)
    lights.push({ x: (core.x + 0.5) * TILE, y: (core.y + 0.5) * TILE, color: 0x7fd4ff, radius: TILE * 3, flicker: 0.05 })
  }

  // Street lamps along roofs bordering walkways.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (at(x, y) !== '#' || hash2(x, y, seed + 9) < 0.86) continue
      const openSide = at(x, y + 1) !== '#' ? [0.5, 0.92] : at(x + 1, y) !== '#' ? [0.92, 0.5] : at(x - 1, y) !== '#' ? [0.08, 0.5] : null
      if (!openSide) continue
      const lx = (x + openSide[0]) * P
      const ly = (y + openSide[1]) * P
      drawLamp(ctx, lx, ly, P * 0.1, pal.light)
      lights.push({ x: (x + openSide[0]) * TILE, y: (y + openSide[1]) * TILE, color: parseInt(pal.light.slice(1), 16), radius: TILE * 1.8, flicker: 0.2 })
    }
  }

  grain(ctx, W, H, 0.05, seed)
  return { texture: Texture.from({ resource: canvas, antialias: true }), lights, specialKind }
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h) % 10000
}

function findCell(map: MapDefinition, c: string): { x: number; y: number } | null {
  for (let y = 0; y < map.grid.length; y++) {
    const x = map.grid[y].indexOf(c)
    if (x >= 0) return { x, y }
  }
  return null
}

function paintNoise(ctx: Ctx, W: number, H: number, base: string, seed: number) {
  const lw = Math.ceil(W / 8)
  const lh = Math.ceil(H / 8)
  const { canvas: small, ctx: sctx } = makeCanvas(lw, lh)
  const img = sctx.createImageData(lw, lh)
  const [r, g, b] = [parseInt(base.slice(1, 3), 16), parseInt(base.slice(3, 5), 16), parseInt(base.slice(5, 7), 16)]
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const n = fbm(x / 14, y / 14, seed, 5)
      const f = 0.55 + n * 0.6
      const i = (y * lw + x) * 4
      img.data[i] = r * f
      img.data[i + 1] = g * f
      img.data[i + 2] = b * f
      img.data[i + 3] = 255
    }
  }
  sctx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(small, 0, 0, W, H)
}

/** Caps perceived brightness so pale palettes (snow, glass) never blow out under bloom. */
function clampLum(color: string, max: number): string {
  const r = parseInt(color.slice(1, 3), 16) / 255
  const g = parseInt(color.slice(3, 5), 16) / 255
  const b = parseInt(color.slice(5, 7), 16) / 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum <= max ? color : shadeHex(color, max / lum - 1)
}

function mixHex(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)]
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)]
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t))
  return `#${((1 << 24) | (m[0] << 16) | (m[1] << 8) | m[2]).toString(16).slice(1)}`
}

function drawDeck(ctx: Ctx, px: number, py: number, P: number, pal: MapDefinition['palette'], h: number) {
  const inset = P * 0.03
  // Walkways are the lightest surface so routes read at a glance.
  const base = clampLum(shadeHex(mixHex(pal.ground, '#6a7078', 0.35), 0.2 + h * 0.07), 0.42)
  const g = ctx.createLinearGradient(px, py, px + P, py + P)
  g.addColorStop(0, shadeHex(base, 0.1))
  g.addColorStop(1, shadeHex(base, -0.15))
  ctx.fillStyle = g
  ctx.fillRect(px + inset, py + inset, P - inset * 2, P - inset * 2)
  // Tread pattern on some plates.
  if (h > 0.55) {
    ctx.strokeStyle = rgba(shadeHex(base, 0.25), 0.35)
    ctx.lineWidth = P * 0.025
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const cx = px + P * (0.2 + i * 0.2)
        const cy = py + P * (0.2 + j * 0.2)
        const a = (i + j) % 2 === 0 ? Math.PI / 4 : -Math.PI / 4
        ctx.beginPath()
        ctx.moveTo(cx - Math.cos(a) * P * 0.05, cy - Math.sin(a) * P * 0.05)
        ctx.lineTo(cx + Math.cos(a) * P * 0.05, cy + Math.sin(a) * P * 0.05)
        ctx.stroke()
      }
    }
  }
  if (h < 0.12) {
    // Oil stain with a faint sheen.
    const ox = px + P * (0.3 + h * 3)
    const oy = py + P * 0.55
    const g2 = ctx.createRadialGradient(ox, oy, 0, ox, oy, P * 0.3)
    g2.addColorStop(0, 'rgba(10,8,6,0.55)')
    g2.addColorStop(0.7, 'rgba(10,8,6,0.25)')
    g2.addColorStop(1, 'rgba(10,8,6,0)')
    ctx.fillStyle = g2
    ctx.fillRect(ox - P * 0.3, oy - P * 0.3, P * 0.6, P * 0.6)
    ctx.fillStyle = 'rgba(120,140,200,0.08)'
    ctx.beginPath()
    ctx.ellipse(ox - P * 0.05, oy - P * 0.05, P * 0.12, P * 0.05, -0.5, 0, Math.PI * 2)
    ctx.fill()
  }
  // Bevelled seams.
  ctx.fillStyle = 'rgba(255,240,210,0.08)'
  ctx.fillRect(px + inset, py + inset, P - inset * 2, P * 0.02)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(px + inset, py + P - inset - P * 0.025, P - inset * 2, P * 0.025)
  ctx.fillRect(px + P - inset - P * 0.02, py + inset, P * 0.02, P - inset * 2)
  for (const [ox, oy] of [
    [0.12, 0.12],
    [0.88, 0.12],
    [0.12, 0.88],
    [0.88, 0.88],
  ]) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    circle(ctx, px + P * ox + 0.6, py + P * oy + 0.8, P * 0.028)
    ctx.fill()
    ctx.fillStyle = rgba(shadeHex(base, 0.35), 0.9)
    circle(ctx, px + P * ox, py + P * oy, P * 0.024)
    ctx.fill()
  }
}

function drawCobbles(ctx: Ctx, px: number, py: number, P: number, pal: MapDefinition['palette'], x: number, y: number, seed: number) {
  ctx.fillStyle = shadeHex(pal.ground, -0.35)
  ctx.fillRect(px, py, P, P)
  const n = 4
  const s = P / n
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const hh = hash2(x * 8 + i, y * 8 + j, seed)
      const ox = j % 2 === 0 ? 0 : s * 0.5
      const cx = px + i * s + ox + s * 0.5
      const cy = py + j * s + s * 0.5
      if (cx > px + P + s * 0.4) continue
      const tone = shadeHex(pal.ground, 0.05 + hh * 0.18)
      const g = ctx.createRadialGradient(cx - s * 0.15, cy - s * 0.2, s * 0.05, cx, cy, s * 0.55)
      g.addColorStop(0, shadeHex(tone, 0.2))
      g.addColorStop(1, shadeHex(tone, -0.25))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.roundRect(cx - s * 0.44, cy - s * 0.4, s * 0.88, s * 0.8, s * 0.25)
      ctx.fill()
    }
  }
}

function drawPad(ctx: Ctx, px: number, py: number, P: number, pal: MapDefinition['palette']) {
  const m = P * 0.08
  // Raised brass-trimmed plinth: this is where guns go.
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.beginPath()
  ctx.roundRect(px + m + P * 0.02, py + m + P * 0.04, P - m * 2, P - m * 2, P * 0.12)
  ctx.fill()
  ctx.fillStyle = metalGradient(ctx, px, py, px + P, py + P, BRASS)
  ctx.beginPath()
  ctx.roundRect(px + m, py + m, P - m * 2, P - m * 2, P * 0.12)
  ctx.fill()
  const inner = P * 0.15
  const g = ctx.createLinearGradient(px, py, px + P, py + P)
  g.addColorStop(0, shadeHex(pal.metal, -0.1))
  g.addColorStop(1, shadeHex(pal.metal, -0.5))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(px + inner, py + inner, P - inner * 2, P - inner * 2, P * 0.08)
  ctx.fill()
  ctx.strokeStyle = rgba(BRASS.hi, 0.25)
  ctx.lineWidth = P * 0.015
  circle(ctx, px + P / 2, py + P / 2, P * 0.24)
  ctx.stroke()
  rivetRing(ctx, px + P / 2, py + P / 2, P * 0.37, 8, P * 0.028, Math.PI / 8)
}

function drawRoof(ctx: Ctx, px: number, py: number, P: number, pal: MapDefinition['palette'], h: number, x: number, y: number, seed: number) {
  const base = clampLum(shadeHex(mixHex(pal.metal, '#1a1410', 0.45), -0.35 + h * 0.08), 0.2)
  ctx.fillStyle = base
  ctx.fillRect(px, py, P, P)
  // Corrugated sheet roofing.
  const vertical = hash2(Math.floor(x / 2), Math.floor(y / 2), seed + 3) > 0.5
  for (let i = 0; i < 8; i++) {
    const t = i / 8
    const g = vertical ? ctx.createLinearGradient(px + t * P, 0, px + (t + 1 / 8) * P, 0) : ctx.createLinearGradient(0, py + t * P, 0, py + (t + 1 / 8) * P)
    g.addColorStop(0, shadeHex(base, 0.12))
    g.addColorStop(0.5, shadeHex(base, -0.1))
    g.addColorStop(1, shadeHex(base, 0.05))
    ctx.fillStyle = g
    if (vertical) ctx.fillRect(px + t * P, py, P / 8, P)
    else ctx.fillRect(px, py + t * P, P, P / 8)
  }
  // Soot streaks.
  ctx.fillStyle = 'rgba(10,8,6,0.18)'
  ctx.fillRect(px + P * h * 0.6, py, P * 0.12, P)

  const feature = hash2(x, y, seed + 1)
  if (feature > 0.82) {
    // Chimney stack.
    const cx = px + P * 0.5
    const cy = py + P * 0.45
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    circle(ctx, cx + P * 0.06, cy + P * 0.08, P * 0.24)
    ctx.fill()
    ctx.fillStyle = radialMetal(ctx, cx, cy, P * 0.24, { hi: '#8a5a3a', mid: '#5a3422', lo: '#2a160c' })
    circle(ctx, cx, cy, P * 0.24)
    ctx.fill()
    ctx.fillStyle = '#0b0806'
    circle(ctx, cx, cy, P * 0.15)
    ctx.fill()
    ctx.strokeStyle = rgba(BRASS.mid, 0.8)
    ctx.lineWidth = P * 0.03
    circle(ctx, cx, cy, P * 0.2)
    ctx.stroke()
  } else if (feature > 0.66) {
    // Rooftop vent grille.
    const cx = px + P * 0.5
    const cy = py + P * 0.5
    ctx.fillStyle = radialMetal(ctx, cx, cy, P * 0.3, STEEL)
    circle(ctx, cx, cy, P * 0.3)
    ctx.fill()
    ctx.strokeStyle = 'rgba(20,20,20,0.8)'
    ctx.lineWidth = P * 0.03
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath()
      ctx.moveTo(cx - P * 0.24, cy + i * P * 0.09)
      ctx.lineTo(cx + P * 0.24, cy + i * P * 0.09)
      ctx.stroke()
    }
  } else if (feature > 0.52) {
    // Exposed flywheel.
    drawGear(ctx, px + P * 0.5, py + P * 0.5, P * 0.3, 12, { hi: shadeHex(pal.accent, 0.3), mid: shadeHex(pal.accent, -0.2), lo: shadeHex(pal.accent, -0.6) }, h * 3)
  } else if (feature > 0.4) {
    // Crates.
    for (const [ox, oy, s] of [
      [0.2, 0.2, 0.34],
      [0.52, 0.42, 0.3],
    ]) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.fillRect(px + P * ox + 3, py + P * oy + 4, P * s, P * s)
      ctx.fillStyle = metalGradient(ctx, px + P * ox, py + P * oy, px + P * (ox + s), py + P * (oy + s), { hi: '#9a7448', mid: '#6a4a2a', lo: '#3a2614' })
      ctx.fillRect(px + P * ox, py + P * oy, P * s, P * s)
      ctx.strokeStyle = 'rgba(30,18,8,0.8)'
      ctx.lineWidth = P * 0.02
      ctx.strokeRect(px + P * ox, py + P * oy, P * s, P * s)
      ctx.beginPath()
      ctx.moveTo(px + P * ox, py + P * oy)
      ctx.lineTo(px + P * (ox + s), py + P * (oy + s))
      ctx.stroke()
    }
  }
}

/** Roof tiles without a chimney, vent, flywheel or crates; only these carry pipework. */
function isPlainRoof(at: (x: number, y: number) => string, x: number, y: number, seed: number): boolean {
  return at(x, y) === '#' && hash2(x, y, seed + 1) <= 0.4
}

/**
 * Lays pipework across runs of adjacent plain roof tiles, bracketed at both ends and flanged at every tile joint, so
 * pipes read as continuous plumbing instead of stray lines that stop at tile edges or cut through rooftop features.
 */
function drawPipeRuns(ctx: Ctx, cols: number, rows: number, P: number, at: (x: number, y: number) => string, seed: number) {
  const used = new Set<number>()
  const free = (x: number, y: number) => isPlainRoof(at, x, y, seed) && !used.has(y * cols + x)
  for (const horizontal of [true, false]) {
    const outer = horizontal ? rows : cols
    const inner = horizontal ? cols : rows
    for (let o = 0; o < outer; o++) {
      let i = 0
      while (i < inner) {
        const cell = (k: number): [number, number] => (horizontal ? [k, o] : [o, k])
        if (!free(...cell(i))) {
          i++
          continue
        }
        let end = i
        while (end + 1 < inner && end - i < 5 && free(...cell(end + 1))) end++
        const [sx, sy] = cell(i)
        if (end > i && hash2(sx, sy, seed + (horizontal ? 2 : 12)) > 0.4) {
          for (let k = i; k <= end; k++) {
            const [cx, cy] = cell(k)
            used.add(cy * cols + cx)
          }
          const [ex, ey] = cell(end)
          // Keep clear of lamps (tile edges/centre-line) and the south wall face (bottom fifth of a tile).
          const across = 0.3 + hash2(sx, sy, seed + 4) * 0.1
          const metal = hash2(sx, sy, seed + 8) > 0.5 ? COPPER : BRASS
          if (horizontal) drawPipeRun(ctx, (sx + 0.22) * P, (sy + across) * P, (ex + 0.78) * P, (ey + across) * P, P, metal)
          else drawPipeRun(ctx, (sx + across) * P, (sy + 0.22) * P, (ex + across) * P, (ey + 0.68) * P, P, metal)
        }
        i = end + 1
      }
    }
  }
}

function drawPipeRun(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, P: number, m: Metal) {
  const w = P * 0.11
  const horizontal = y0 === y1
  // Cast shadow offset down-right, matching the rest of the rooftop art.
  ctx.save()
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0 + P * 0.03, y0 + P * 0.05)
  ctx.lineTo(x1 + P * 0.03, y1 + P * 0.05)
  ctx.stroke()
  ctx.restore()
  pipe(ctx, x0, y0, x1, y1, w, m)
  // Flanged couplings at each tile joint along the run.
  const len = horizontal ? x1 - x0 : y1 - y0
  const first = Math.ceil((horizontal ? x0 : y0) / P) * P
  for (let s = first; s < (horizontal ? x1 : y1); s += P) {
    const fx = horizontal ? s : x0
    const fy = horizontal ? y0 : s
    const fw = horizontal ? P * 0.05 : w * 1.5
    const fh = horizontal ? w * 1.5 : P * 0.05
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(fx - fw / 2 + P * 0.02, fy - fh / 2 + P * 0.03, fw, fh)
    ctx.fillStyle = metalGradient(ctx, fx - fw / 2, fy - fh / 2, fx + fw / 2, fy + fh / 2, m)
    ctx.fillRect(fx - fw / 2, fy - fh / 2, fw, fh)
  }
  // Riveted mounting brackets where the pipe drops into the roof.
  if (len > 0) {
    for (const [bx, by] of [
      [x0, y0],
      [x1, y1],
    ]) {
      const s = P * 0.2
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.beginPath()
      ctx.roundRect(bx - s / 2 + P * 0.03, by - s / 2 + P * 0.05, s, s, P * 0.03)
      ctx.fill()
      ctx.fillStyle = metalGradient(ctx, bx - s / 2, by - s / 2, bx + s / 2, by + s / 2, IRON)
      ctx.beginPath()
      ctx.roundRect(bx - s / 2, by - s / 2, s, s, P * 0.03)
      ctx.fill()
      ctx.fillStyle = radialMetal(ctx, bx, by, w * 0.75, m)
      circle(ctx, bx, by, w * 0.75)
      ctx.fill()
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      circle(ctx, bx, by, w * 0.35)
      ctx.fill()
      for (const [rx, ry] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        rivet(ctx, bx + rx * s * 0.32, by + ry * s * 0.32, P * 0.018)
    }
  }
}

function drawHatch(ctx: Ctx, px: number, py: number, P: number, spawn: boolean) {
  const cx = px + P / 2
  const cy = py + P / 2
  // Hazard-striped tunnel mouth.
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(px + P * 0.06, py + P * 0.06, P * 0.88, P * 0.88, P * 0.14)
  ctx.clip()
  for (let i = -4; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#e0b030' : '#1a1410'
    ctx.beginPath()
    ctx.moveTo(px + i * P * 0.16, py)
    ctx.lineTo(px + i * P * 0.16 + P * 0.08, py)
    ctx.lineTo(px + i * P * 0.16 + P * 0.08 + P, py + P)
    ctx.lineTo(px + i * P * 0.16 + P, py + P)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, P * 0.36)
  g.addColorStop(0, '#000000')
  g.addColorStop(0.7, '#0c0806')
  g.addColorStop(1, spawn ? '#5a1a0a' : '#0a2a4a')
  ctx.fillStyle = g
  circle(ctx, cx, cy, P * 0.36)
  ctx.fill()
  ctx.strokeStyle = metalGradient(ctx, px, py, px + P, py + P, IRON)
  ctx.lineWidth = P * 0.06
  circle(ctx, cx, cy, P * 0.36)
  ctx.stroke()
  glow(ctx, cx, cy, P * 0.5, spawn ? '#ff4a1a' : '#4ab0ff', 0.35)
}

function drawGateRails(ctx: Ctx, px: number, py: number, P: number, horizontal: boolean) {
  ctx.save()
  ctx.translate(px + P / 2, py + P / 2)
  if (!horizontal) ctx.rotate(Math.PI / 2)
  for (const off of [-0.22, 0.22]) {
    ctx.fillStyle = metalGradient(ctx, -P / 2, off * P - 3, -P / 2, off * P + 3, STEEL)
    ctx.fillRect(-P / 2, off * P - P * 0.04, P, P * 0.08)
  }
  ctx.fillStyle = 'rgba(40,24,12,0.9)'
  for (let i = 0; i < 4; i++) ctx.fillRect(-P / 2 + i * P * 0.25 + P * 0.06, -P * 0.32, P * 0.1, P * 0.64)
  ctx.restore()
}

function drawSpecial(ctx: Ctx, kind: string, px: number, py: number, P: number, pal: MapDefinition['palette'], x: number, y: number, seed: number) {
  const cx = px + P / 2
  const cy = py + P / 2
  switch (kind) {
    case 'water': {
      const g = ctx.createLinearGradient(px, py, px + P, py + P)
      g.addColorStop(0, shadeHex(pal.accent, -0.35))
      g.addColorStop(1, shadeHex(pal.accent, -0.65))
      ctx.fillStyle = g
      ctx.fillRect(px, py, P, P)
      ctx.strokeStyle = rgba(shadeHex(pal.accent, 0.4), 0.35)
      ctx.lineWidth = P * 0.02
      for (let i = 0; i < 3; i++) {
        const yy = py + P * (0.25 + i * 0.25 + hash2(x, y + i, seed) * 0.08)
        ctx.beginPath()
        ctx.moveTo(px + P * 0.1, yy)
        ctx.quadraticCurveTo(cx, yy - P * 0.06, px + P * 0.9, yy)
        ctx.stroke()
      }
      break
    }
    case 'ice': {
      const g = ctx.createLinearGradient(px, py, px + P, py + P)
      g.addColorStop(0, '#8fb4c8')
      g.addColorStop(1, '#4e7288')
      ctx.fillStyle = g
      ctx.fillRect(px, py, P, P)
      ctx.strokeStyle = 'rgba(220,240,255,0.45)'
      ctx.lineWidth = P * 0.015
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.moveTo(px + hash2(x, y, seed + i) * P, py)
        ctx.lineTo(px + hash2(x, y, seed + i + 9) * P, py + P)
        ctx.stroke()
      }
      break
    }
    case 'conveyor': {
      ctx.fillStyle = '#1a1816'
      ctx.fillRect(px, py, P, P)
      ctx.fillStyle = metalGradient(ctx, px, py, px, py + P * 0.1, STEEL)
      ctx.fillRect(px, py, P, P * 0.08)
      ctx.fillRect(px, py + P * 0.92, P, P * 0.08)
      break
    }
    case 'vent': {
      drawDeck(ctx, px, py, P, pal, 0.3)
      ctx.fillStyle = '#0a0806'
      circle(ctx, cx, cy, P * 0.34)
      ctx.fill()
      ctx.strokeStyle = metalGradient(ctx, px, py, px + P, py + P, IRON)
      ctx.lineWidth = P * 0.05
      circle(ctx, cx, cy, P * 0.34)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(120,110,100,0.8)'
      ctx.lineWidth = P * 0.035
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath()
        ctx.moveTo(cx + i * P * 0.12, cy - P * 0.3)
        ctx.lineTo(cx + i * P * 0.12, cy + P * 0.3)
        ctx.stroke()
      }
      glow(ctx, cx, cy, P * 0.35, '#ff7a2a', 0.25)
      break
    }
    case 'rod': {
      drawDeck(ctx, px, py, P, pal, 0.3)
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      circle(ctx, cx + P * 0.05, cy + P * 0.06, P * 0.22)
      ctx.fill()
      ctx.fillStyle = radialMetal(ctx, cx, cy, P * 0.2, COPPER)
      circle(ctx, cx, cy, P * 0.2)
      ctx.fill()
      ctx.strokeStyle = rgba(BRASS.hi, 0.9)
      ctx.lineWidth = P * 0.03
      for (const r of [0.12, 0.17]) {
        circle(ctx, cx, cy, P * r)
        ctx.stroke()
      }
      glow(ctx, cx, cy, P * 0.45, '#9fe0ff', 0.35)
      break
    }
    case 'conduit':
    case 'lens': {
      drawDeck(ctx, px, py, P, pal, 0.3)
      const color = kind === 'lens' ? '#b0fff0' : '#b070ff'
      ctx.fillStyle = rgba(color, 0.55)
      ctx.beginPath()
      ctx.roundRect(px + P * 0.2, py + P * 0.2, P * 0.6, P * 0.6, P * 0.2)
      ctx.fill()
      ctx.strokeStyle = metalGradient(ctx, px, py, px + P, py + P, BRASS)
      ctx.lineWidth = P * 0.05
      ctx.stroke()
      glow(ctx, cx, cy, P * 0.5, color, 0.5)
      break
    }
    case 'lava': {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, P * 0.7)
      g.addColorStop(0, '#ffd070')
      g.addColorStop(0.4, '#ff6a1a')
      g.addColorStop(1, '#5a1004')
      ctx.fillStyle = g
      ctx.fillRect(px, py, P, P)
      ctx.fillStyle = 'rgba(30,10,6,0.6)'
      for (let i = 0; i < 4; i++) {
        circle(ctx, px + hash2(x, y, seed + i) * P, py + hash2(x, y, seed + i + 4) * P, P * 0.1)
        ctx.fill()
      }
      break
    }
    case 'cracked': {
      drawDeck(ctx, px, py, P, pal, 0.1)
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.lineWidth = P * 0.025
      ctx.beginPath()
      ctx.moveTo(px + P * 0.1, py + P * 0.3)
      ctx.lineTo(cx, cy)
      ctx.lineTo(px + P * 0.8, py + P * 0.2)
      ctx.moveTo(cx, cy)
      ctx.lineTo(px + P * 0.6, py + P * 0.9)
      ctx.stroke()
      break
    }
    case 'turntable': {
      drawDeck(ctx, px, py, P, pal, 0.3)
      ctx.strokeStyle = metalGradient(ctx, px, py, px + P, py + P, BRASS)
      ctx.lineWidth = P * 0.06
      circle(ctx, cx, cy, P * 0.38)
      ctx.stroke()
      rivetRing(ctx, cx, cy, P * 0.38, 6, P * 0.03)
      break
    }
    default: {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, P * 0.7)
      g.addColorStop(0, rgba(shadeHex(pal.accent, -0.2), 0.9))
      g.addColorStop(1, rgba(shadeHex(pal.ground, -0.4), 0.9))
      ctx.fillStyle = g
      ctx.fillRect(px, py, P, P)
    }
  }
}

function drawVault(ctx: Ctx, cx: number, cy: number, P: number) {
  const r = P * 0.82
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  circle(ctx, cx + P * 0.06, cy + P * 0.1, r)
  ctx.fill()
  drawGear(ctx, cx, cy, r, 20, BRASS)
  ctx.fillStyle = radialMetal(ctx, cx, cy, r * 0.66, IRON)
  circle(ctx, cx, cy, r * 0.66)
  ctx.fill()
  ctx.strokeStyle = metalGradient(ctx, cx - r, cy - r, cx + r, cy + r, BRASS)
  ctx.lineWidth = P * 0.05
  circle(ctx, cx, cy, r * 0.66)
  ctx.stroke()
  rivetRing(ctx, cx, cy, r * 0.58, 12, P * 0.03)
  // Locking bars.
  ctx.strokeStyle = metalGradient(ctx, cx - r, cy, cx + r, cy, STEEL)
  ctx.lineWidth = P * 0.07
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI
    ctx.beginPath()
    ctx.moveTo(cx - Math.cos(a) * r * 0.5, cy - Math.sin(a) * r * 0.5)
    ctx.lineTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5)
    ctx.stroke()
  }
  ctx.fillStyle = radialMetal(ctx, cx, cy, r * 0.2, BRASS)
  circle(ctx, cx, cy, r * 0.2)
  ctx.fill()
  rivet(ctx, cx, cy, r * 0.07)
  glow(ctx, cx, cy, r * 1.3, '#7fd4ff', 0.18)
}

function drawLamp(ctx: Ctx, x: number, y: number, r: number, color: string) {
  glow(ctx, x, y, r * 6, color, 0.35)
  ctx.fillStyle = radialMetal(ctx, x, y, r * 1.4, IRON)
  circle(ctx, x, y, r * 1.4)
  ctx.fill()
  ctx.fillStyle = color
  circle(ctx, x, y, r * 0.8)
  ctx.fill()
}

function edgeShadow(ctx: Ctx, px: number, py: number, P: number, dx: number, dy: number) {
  const len = P * 0.35
  const g = dy ? ctx.createLinearGradient(0, py, 0, py + len) : ctx.createLinearGradient(px, 0, px + dx * len, 0)
  g.addColorStop(0, 'rgba(0,0,0,0.5)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  if (dy) ctx.fillRect(px, py, P, len)
  else if (dx > 0) ctx.fillRect(px, py, len, P)
  else ctx.fillRect(px - len, py, len, P)
}
