// Canvas2D painting toolkit used to bake procedural art into GPU textures.

export type Ctx = CanvasRenderingContext2D

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(w))
  canvas.height = Math.max(1, Math.ceil(h))
  const ctx = canvas.getContext('2d')!
  return { canvas, ctx }
}

/** Deterministic hash noise so baked art is identical on every load. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

export function valueNoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const s = (t: number) => t * t * (3 - 2 * t)
  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf)
}

export function fbm(x: number, y: number, seed = 0, octaves = 4): number {
  let v = 0
  let amp = 0.5
  let f = 1
  for (let i = 0; i < octaves; i++) {
    v += amp * valueNoise(x * f, y * f, seed + i * 17)
    f *= 2
    amp *= 0.5
  }
  return v
}

export function hex(color: string): [number, number, number] {
  const n = parseInt(color.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgba(color: string, a = 1): string {
  const [r, g, b] = hex(color)
  return `rgba(${r},${g},${b},${a})`
}

/** Lighten (amount > 0) or darken (amount < 0) a hex colour. */
export function shadeHex(color: string, amount: number): string {
  const [r, g, b] = hex(color)
  const f = (c: number) => Math.round(Math.max(0, Math.min(255, amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))))
  return `#${((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1)}`
}

export function toNumber(color: string): number {
  return parseInt(color.replace('#', ''), 16)
}

export type Metal = { hi: string; mid: string; lo: string }

export const BRASS = { hi: '#f6d98a', mid: '#c8923e', lo: '#6a4418', deep: '#3a2410' }
export const COPPER = { hi: '#f4b086', mid: '#b8643a', lo: '#5a2a12' }
export const IRON = { hi: '#5a524b', mid: '#3a3430', lo: '#1c1815' }
export const STEEL = { hi: '#d4d9de', mid: '#8a9096', lo: '#3c4046' }

export function metalGradient(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, m: { hi: string; mid: string; lo: string }) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, m.hi)
  g.addColorStop(0.45, m.mid)
  g.addColorStop(1, m.lo)
  return g
}

export function radialMetal(ctx: Ctx, cx: number, cy: number, r: number, m: { hi: string; mid: string; lo: string }) {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r)
  g.addColorStop(0, m.hi)
  g.addColorStop(0.5, m.mid)
  g.addColorStop(1, m.lo)
  return g
}

export function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
}

export function polygon(ctx: Ctx, x: number, y: number, r: number, sides: number, rotation = 0) {
  ctx.beginPath()
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2
    const px = x + Math.cos(a) * r
    const py = y + Math.sin(a) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export function rivet(ctx: Ctx, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r)
  g.addColorStop(0, '#fff3c8')
  g.addColorStop(0.45, BRASS.mid)
  g.addColorStop(1, BRASS.deep)
  ctx.fillStyle = g
  circle(ctx, x, y, r)
  ctx.fill()
}

export function rivetRing(ctx: Ctx, x: number, y: number, radius: number, count: number, r: number, offset = 0) {
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * Math.PI * 2
    rivet(ctx, x + Math.cos(a) * radius, y + Math.sin(a) * radius, r)
  }
}

/** Spur gear outline path (teeth are trapezoids). */
export function gearPath(ctx: Ctx, x: number, y: number, outer: number, inner: number, teeth: number, rotation = 0) {
  ctx.beginPath()
  const steps = teeth * 4
  for (let i = 0; i <= steps; i++) {
    const a = rotation + (i / steps) * Math.PI * 2
    const phase = i % 4
    const r = phase === 1 || phase === 2 ? outer : inner
    const px = x + Math.cos(a) * r
    const py = y + Math.sin(a) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

export function drawGear(ctx: Ctx, x: number, y: number, outer: number, teeth: number, m: Metal = BRASS, rotation = 0) {
  const inner = outer * 0.8
  gearPath(ctx, x, y, outer, inner, teeth, rotation)
  ctx.fillStyle = radialMetal(ctx, x, y, outer, m)
  ctx.fill()
  ctx.strokeStyle = 'rgba(20,10,4,0.8)'
  ctx.lineWidth = Math.max(1, outer * 0.06)
  ctx.stroke()
  // Spokes and hub.
  ctx.fillStyle = 'rgba(20,12,6,0.55)'
  for (let i = 0; i < 4; i++) {
    const a = rotation + Math.PI / 4 + (i / 4) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(x + Math.cos(a) * inner * 0.52, y + Math.sin(a) * inner * 0.52, inner * 0.2, 0, Math.PI * 2)
    ctx.fill()
  }
  circle(ctx, x, y, inner * 0.28)
  ctx.fillStyle = radialMetal(ctx, x, y, inner * 0.28, STEEL)
  ctx.fill()
}

export function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(color, alpha))
  g.addColorStop(0.35, rgba(color, alpha * 0.45))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

/** Soft elliptical contact shadow. */
export function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha = 0.5) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, ry / rx)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
  g.addColorStop(0, `rgba(0,0,0,${alpha})`)
  g.addColorStop(0.6, `rgba(0,0,0,${alpha * 0.5})`)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2)
  ctx.restore()
}

/** Specular highlight arc along the top-left of a round part. */
export function highlight(ctx: Ctx, x: number, y: number, r: number, alpha = 0.45) {
  ctx.save()
  ctx.strokeStyle = `rgba(255,248,225,${alpha})`
  ctx.lineWidth = Math.max(1, r * 0.12)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(x, y, r * 0.78, Math.PI * 1.05, Math.PI * 1.45)
  ctx.stroke()
  ctx.restore()
}

export function pipe(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, width: number, m: Metal = COPPER) {
  const nx = -(y1 - y0)
  const ny = x1 - x0
  const len = Math.hypot(nx, ny) || 1
  const g = ctx.createLinearGradient(x0 + (nx / len) * width, y0 + (ny / len) * width, x0 - (nx / len) * width, y0 - (ny / len) * width)
  g.addColorStop(0, m.lo)
  g.addColorStop(0.35, m.hi)
  g.addColorStop(0.6, m.mid)
  g.addColorStop(1, m.lo)
  ctx.strokeStyle = g
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

/** Adds fine grain so flat fills read as worked metal rather than vector shapes. */
export function grain(ctx: Ctx, w: number, h: number, strength = 0.06, seed = 1) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (d[i + 3] === 0) continue
      const n = (hash2(x, y, seed) - 0.5) * 255 * strength
      d[i] = Math.max(0, Math.min(255, d[i] + n))
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n))
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n))
    }
  }
  ctx.putImageData(img, 0, 0)
}
