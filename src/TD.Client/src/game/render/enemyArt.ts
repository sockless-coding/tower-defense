import { Texture } from 'pixi.js'
import type { EnemyDefinition } from '../../api/types'
import {
  BRASS,
  circle,
  COPPER,
  drawGear,
  glow,
  grain,
  highlight,
  IRON,
  makeCanvas,
  metalGradient,
  pipe,
  radialMetal,
  rgba,
  rivetRing,
  shadow,
  STEEL,
  type Ctx,
  type Metal,
} from './paint'

export interface EnemyTextures {
  body: Texture
  /** Optional spinning part (rotors, orrery rings). */
  spinner: Texture | null
  size: number
}

const cache = new Map<string, EnemyTextures>()

/** Canvas extent in tiles for an enemy of the given radius. */
const extent = (e: EnemyDefinition) => Math.max(0.8, e.size * 2.8)

/** Draws an enemy portrait into a 2D canvas for briefings and the bestiary. */
export function drawEnemyIcon(target: HTMLCanvasElement, def: EnemyDefinition): void {
  const ctx = target.getContext('2d')
  if (!ctx) return
  const S = Math.min(target.width, target.height)
  const size = extent(def)
  const P = (S / size) * 0.95
  ctx.clearRect(0, 0, target.width, target.height)
  ctx.save()
  ctx.translate(target.width / 2, target.height / 2)
  ctx.rotate(-Math.PI / 2)
  paintEnemy(ctx, def, 0, 0, def.size * P, P)
  ctx.restore()
}

export function enemyTextures(def: EnemyDefinition, scale: number): EnemyTextures {
  const key = `${def.id}:${scale}`
  const hit = cache.get(key)
  if (hit) return hit
  const P = 64 * scale
  const size = extent(def)
  const S = Math.ceil(size * P)
  const { canvas, ctx } = makeCanvas(S, S)
  const c = S / 2
  const r = def.size * P
  paintEnemy(ctx, def, c, c, r, P)
  grain(ctx, S, S, 0.04, def.id.length * 3)

  let spinner: Texture | null = null
  if (def.id === 'gyrocopter' || def.id === 'zeppelin-carrier' || def.id === 'grand-orrery' || def.id === 'magnet-drone') {
    const sp = makeCanvas(S, S)
    paintSpinner(sp.ctx, def, c, c, r)
    spinner = Texture.from({ resource: sp.canvas, antialias: true })
  }
  const result = { body: Texture.from({ resource: canvas, antialias: true }), spinner, size }
  cache.set(key, result)
  return result
}

function legs(ctx: Ctx, cx: number, cy: number, r: number, count: number, length: number, m: Metal = IRON) {
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1
    const along = (Math.floor(i / 2) / Math.max(1, count / 2 - 1) - 0.5) * r * 1.1
    const kx = cx + along + r * 0.1
    const ky = cy + side * r * 0.55
    pipe(ctx, cx + along * 0.6, cy + side * r * 0.3, kx, ky + side * length * 0.5, r * 0.14, m)
    pipe(ctx, kx, ky + side * length * 0.5, kx - r * 0.25, ky + side * length, r * 0.11, m)
  }
}

function eye(ctx: Ctx, x: number, y: number, r: number, color: string) {
  glow(ctx, x, y, r * 3, color, 0.8)
  ctx.fillStyle = '#fff8e0'
  circle(ctx, x, y, r)
  ctx.fill()
}

function body(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, m: { hi: string; mid: string; lo: string }) {
  ctx.fillStyle = metalGradient(ctx, cx - rx, cy - ry, cx + rx, cy + ry, m)
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(15,8,4,0.85)'
  ctx.lineWidth = Math.max(1.5, ry * 0.1)
  ctx.stroke()
  highlight(ctx, cx, cy, Math.min(rx, ry), 0.4)
}

function paintEnemy(ctx: Ctx, def: EnemyDefinition, cx: number, cy: number, r: number, P: number) {
  const air = def.movement === 'air'
  shadow(ctx, cx + r * (air ? 0.6 : 0.15), cy + r * (air ? 0.9 : 0.25), r * 1.2, r * 0.9, air ? 0.3 : 0.55)
  switch (def.id) {
    case 'automaton-scout':
      legs(ctx, cx, cy, r, 4, r * 0.8, STEEL)
      body(ctx, cx, cy, r * 0.8, r * 0.55, BRASS)
      eye(ctx, cx + r * 0.6, cy, r * 0.16, '#ffd070')
      break
    case 'clockwork-swarm':
      legs(ctx, cx, cy, r, 6, r * 0.6, IRON)
      body(ctx, cx, cy, r * 0.9, r * 0.7, COPPER)
      ctx.strokeStyle = BRASS.hi
      ctx.lineWidth = r * 0.12
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.9, cy)
      ctx.lineTo(cx - r * 1.3, cy)
      ctx.moveTo(cx - r * 1.3, cy - r * 0.3)
      ctx.lineTo(cx - r * 1.3, cy + r * 0.3)
      ctx.stroke()
      break
    case 'rivet-rat':
      ctx.strokeStyle = STEEL.mid
      ctx.lineWidth = r * 0.12
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.7, cy)
      ctx.quadraticCurveTo(cx - r * 1.4, cy - r * 0.6, cx - r * 1.6, cy + r * 0.2)
      ctx.stroke()
      legs(ctx, cx, cy, r, 4, r * 0.5, IRON)
      body(ctx, cx, cy, r * 0.85, r * 0.5, STEEL)
      eye(ctx, cx + r * 0.65, cy - r * 0.18, r * 0.1, '#ff3a2a')
      eye(ctx, cx + r * 0.65, cy + r * 0.18, r * 0.1, '#ff3a2a')
      break
    case 'steam-golem':
      legs(ctx, cx, cy, r, 4, r * 0.5, IRON)
      body(ctx, cx, cy, r * 0.85, r * 0.8, IRON)
      rivetRing(ctx, cx, cy, r * 0.65, 10, r * 0.06)
      glow(ctx, cx + r * 0.45, cy, r * 0.5, '#ff7a1a', 0.9)
      ctx.fillStyle = '#ffb040'
      ctx.fillRect(cx + r * 0.35, cy - r * 0.2, r * 0.25, r * 0.4)
      ctx.fillStyle = radialMetal(ctx, cx - r * 0.3, cy - r * 0.3, r * 0.22, COPPER)
      circle(ctx, cx - r * 0.3, cy - r * 0.3, r * 0.22)
      ctx.fill()
      ctx.fillStyle = '#0a0604'
      circle(ctx, cx - r * 0.3, cy - r * 0.3, r * 0.12)
      ctx.fill()
      break
    case 'tesla-wraith': {
      glow(ctx, cx, cy, r * 1.6, '#7fd4ff', 0.7)
      ctx.fillStyle = 'rgba(200,240,255,0.85)'
      ctx.beginPath()
      ctx.moveTo(cx + r, cy)
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI / 2 + (i / 10) * Math.PI
        const rr = r * (0.7 + (i % 2) * 0.3)
        ctx.lineTo(cx + Math.cos(a) * rr - r * 0.2, cy + Math.sin(a) * rr)
      }
      ctx.closePath()
      ctx.fill()
      eye(ctx, cx + r * 0.4, cy - r * 0.15, r * 0.1, '#ffffff')
      eye(ctx, cx + r * 0.4, cy + r * 0.15, r * 0.1, '#ffffff')
      break
    }
    case 'brass-juggernaut':
      legs(ctx, cx, cy, r, 6, r * 0.45, IRON)
      for (let i = 3; i >= 0; i--) body(ctx, cx - i * r * 0.12, cy, r * (0.95 - i * 0.12), r * (0.85 - i * 0.1), i % 2 ? BRASS : { hi: '#c9a060', mid: '#8a6a30', lo: '#3a2a10' })
      rivetRing(ctx, cx, cy, r * 0.55, 12, r * 0.05)
      eye(ctx, cx + r * 0.75, cy, r * 0.1, '#ff6a2a')
      break
    case 'smog-phantom':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2
        const g = ctx.createRadialGradient(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, 0, cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, r * 0.7)
        g.addColorStop(0, 'rgba(40,36,34,0.9)')
        g.addColorStop(1, 'rgba(40,36,34,0)')
        ctx.fillStyle = g
        ctx.fillRect(cx - r * 1.5, cy - r * 1.5, r * 3, r * 3)
      }
      drawGear(ctx, cx, cy, r * 0.35, 8, COPPER)
      glow(ctx, cx, cy, r * 0.6, '#ff2a1a', 0.8)
      break
    case 'boiler-walker':
      legs(ctx, cx, cy, r, 4, r * 0.9, STEEL)
      body(ctx, cx, cy, r * 0.8, r * 0.6, COPPER)
      ctx.strokeStyle = BRASS.mid
      ctx.lineWidth = r * 0.08
      for (const off of [-0.4, 0, 0.4]) {
        ctx.beginPath()
        ctx.moveTo(cx + off * r, cy - r * 0.55)
        ctx.lineTo(cx + off * r, cy + r * 0.55)
        ctx.stroke()
      }
      glow(ctx, cx, cy, r * 0.4, '#ffa040', 0.5)
      ctx.fillStyle = '#efe2c2'
      circle(ctx, cx + r * 0.2, cy - r * 0.2, r * 0.15)
      ctx.fill()
      break
    case 'gyrocopter':
      body(ctx, cx, cy, r * 0.9, r * 0.35, BRASS)
      ctx.fillStyle = COPPER.mid
      ctx.fillRect(cx - r * 1.2, cy - r * 0.08, r * 0.6, r * 0.16)
      eye(ctx, cx + r * 0.75, cy, r * 0.1, '#ffd070')
      break
    case 'zeppelin-carrier': {
      body(ctx, cx, cy, r * 1.05, r * 0.55, { hi: '#c8b89a', mid: '#8a7a60', lo: '#3a3024' })
      ctx.strokeStyle = 'rgba(60,40,20,0.5)'
      ctx.lineWidth = r * 0.03
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath()
        ctx.ellipse(cx, cy, Math.abs(i) * r * 0.15 + 0.01, r * 0.52, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.fillStyle = metalGradient(ctx, cx - r * 0.3, cy - r * 0.12, cx + r * 0.3, cy + r * 0.12, BRASS)
      ctx.fillRect(cx - r * 0.3, cy - r * 0.12, r * 0.6, r * 0.24)
      for (const s of [-1, 1]) {
        ctx.fillStyle = COPPER.mid
        ctx.beginPath()
        ctx.moveTo(cx - r * 0.8, cy)
        ctx.lineTo(cx - r * 1.15, cy + s * r * 0.45)
        ctx.lineTo(cx - r * 0.95, cy)
        ctx.closePath()
        ctx.fill()
      }
      break
    }
    case 'magnet-drone':
      glow(ctx, cx, cy, r * 1.4, '#ff4a4a', 0.25)
      ctx.lineWidth = r * 0.4
      ctx.lineCap = 'butt'
      ctx.strokeStyle = '#c0302a'
      ctx.beginPath()
      ctx.arc(cx - r * 0.1, cy, r * 0.55, Math.PI * 0.5, Math.PI * 1.5)
      ctx.stroke()
      ctx.strokeStyle = STEEL.hi
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.1, cy - r * 0.55)
      ctx.lineTo(cx + r * 0.5, cy - r * 0.55)
      ctx.moveTo(cx - r * 0.1, cy + r * 0.55)
      ctx.lineTo(cx + r * 0.5, cy + r * 0.55)
      ctx.stroke()
      break
    case 'shield-bearer':
      legs(ctx, cx, cy, r, 4, r * 0.55, IRON)
      body(ctx, cx, cy, r * 0.75, r * 0.6, STEEL)
      glow(ctx, cx + r * 0.4, cy, r * 0.9, '#6ab0ff', 0.6)
      ctx.strokeStyle = metalGradient(ctx, cx, cy - r, cx, cy + r, BRASS)
      ctx.lineWidth = r * 0.15
      ctx.beginPath()
      ctx.arc(cx + r * 0.1, cy, r * 0.7, -Math.PI / 3, Math.PI / 3)
      ctx.stroke()
      break
    case 'mender-automaton':
      legs(ctx, cx, cy, r, 4, r * 0.55, IRON)
      for (const s of [-1, 1]) {
        pipe(ctx, cx, cy + s * r * 0.3, cx + r * 0.8, cy + s * r * 0.55, r * 0.12, STEEL)
        glow(ctx, cx + r * 0.85, cy + s * r * 0.55, r * 0.25, '#ffb040', 0.9)
      }
      body(ctx, cx, cy, r * 0.7, r * 0.55, { hi: '#e0d0a0', mid: '#a09060', lo: '#4a4024' })
      ctx.fillStyle = '#3aa040'
      ctx.fillRect(cx - r * 0.1, cy - r * 0.3, r * 0.2, r * 0.6)
      ctx.fillRect(cx - r * 0.3, cy - r * 0.1, r * 0.6, r * 0.2)
      break
    case 'chimney-stalker':
      legs(ctx, cx, cy, r, 4, r * 0.9, IRON)
      ctx.fillStyle = radialMetal(ctx, cx, cy, r * 0.6, { hi: '#8a5a3a', mid: '#5a3422', lo: '#2a160c' })
      circle(ctx, cx, cy, r * 0.6)
      ctx.fill()
      ctx.fillStyle = '#080604'
      circle(ctx, cx, cy, r * 0.38)
      ctx.fill()
      ctx.strokeStyle = BRASS.mid
      ctx.lineWidth = r * 0.08
      circle(ctx, cx, cy, r * 0.5)
      ctx.stroke()
      break
    case 'iron-beetle':
      legs(ctx, cx, cy, r, 6, r * 0.5, IRON)
      body(ctx, cx, cy, r * 0.95, r * 0.75, IRON)
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.lineWidth = r * 0.06
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.9, cy)
      ctx.lineTo(cx + r * 0.6, cy)
      ctx.stroke()
      for (const s of [-1, 1]) pipe(ctx, cx + r * 0.7, cy + s * r * 0.2, cx + r * 1.15, cy + s * r * 0.4, r * 0.12, STEEL)
      highlight(ctx, cx, cy - r * 0.2, r * 0.6, 0.35)
      break
    case 'copper-centipede':
      for (let i = 4; i >= 0; i--) {
        const x = cx - i * r * 0.38 + r * 0.4
        legs(ctx, x, cy, r * 0.4, 2, r * 0.3, IRON)
        body(ctx, x, cy, r * 0.28, r * 0.32, COPPER)
      }
      eye(ctx, cx + r * 0.6, cy, r * 0.08, '#ffd070')
      break
    case 'centipede-segment':
      legs(ctx, cx, cy, r, 2, r * 0.6, IRON)
      body(ctx, cx, cy, r * 0.75, r * 0.8, COPPER)
      break
    case 'aether-leech':
      glow(ctx, cx, cy, r * 1.5, '#b690ff', 0.6)
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * 0.6 + (i / 5) * Math.PI * 0.8
        ctx.strokeStyle = 'rgba(190,150,255,0.8)'
        ctx.lineWidth = r * 0.1
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.quadraticCurveTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.4, cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 1.1)
        ctx.stroke()
      }
      body(ctx, cx, cy, r * 0.65, r * 0.5, { hi: '#e8d8ff', mid: '#8a60d0', lo: '#2a1050' })
      break
    case 'sapper':
      legs(ctx, cx, cy, r, 4, r * 0.5, IRON)
      body(ctx, cx, cy, r * 0.7, r * 0.6, { hi: '#a0a870', mid: '#6a7040', lo: '#2a2e14' })
      pipe(ctx, cx + r * 0.2, cy + r * 0.2, cx + r * 0.95, cy + r * 0.5, r * 0.14, STEEL)
      eye(ctx, cx + r * 0.5, cy - r * 0.1, r * 0.1, '#ff5a2a')
      break
    case 'vapor-djinn':
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(240,240,240,${0.5 - i * 0.12})`
        ctx.lineWidth = r * (0.35 - i * 0.08)
        ctx.beginPath()
        ctx.arc(cx - r * 0.2, cy, r * (0.4 + i * 0.25), i, i + Math.PI * 1.4)
        ctx.stroke()
      }
      ctx.fillStyle = metalGradient(ctx, cx, cy - r * 0.2, cx + r * 0.6, cy + r * 0.2, BRASS)
      ctx.beginPath()
      ctx.ellipse(cx + r * 0.35, cy, r * 0.35, r * 0.2, 0, 0, Math.PI * 2)
      ctx.fill()
      eye(ctx, cx + r * 0.1, cy, r * 0.12, '#80e0ff')
      break
    case 'pressure-titan':
      legs(ctx, cx, cy, r, 4, r * 0.45, IRON)
      body(ctx, cx, cy, r * 0.9, r * 0.8, IRON)
      rivetRing(ctx, cx, cy, r * 0.72, 16, r * 0.035)
      for (const [ox, oy] of [[-0.4, -0.4], [-0.4, 0.4], [0.1, -0.5], [0.1, 0.5]]) {
        ctx.fillStyle = radialMetal(ctx, cx + ox * r, cy + oy * r, r * 0.16, COPPER)
        circle(ctx, cx + ox * r, cy + oy * r, r * 0.16)
        ctx.fill()
        ctx.fillStyle = '#0a0604'
        circle(ctx, cx + ox * r, cy + oy * r, r * 0.09)
        ctx.fill()
      }
      glow(ctx, cx + r * 0.5, cy, r * 0.5, '#ff5a1a', 0.9)
      ctx.fillStyle = '#efe2c2'
      circle(ctx, cx - r * 0.05, cy, r * 0.2)
      ctx.fill()
      ctx.strokeStyle = BRASS.lo
      ctx.lineWidth = r * 0.04
      ctx.stroke()
      break
    case 'ironclad-behemoth':
      for (const s of [-1, 1]) {
        ctx.fillStyle = metalGradient(ctx, cx - r, cy + s * r * 0.8, cx + r, cy + s * r * 0.8, IRON)
        ctx.fillRect(cx - r * 0.95, cy + s * r * 0.62 - r * 0.15, r * 1.9, r * 0.3)
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)'
          ctx.fillRect(cx - r * 0.9 + i * r * 0.24, cy + s * r * 0.62 - r * 0.15, r * 0.05, r * 0.3)
        }
      }
      body(ctx, cx, cy, r * 0.9, r * 0.6, IRON)
      rivetRing(ctx, cx, cy, r * 0.5, 14, r * 0.03)
      glassDome(ctx, cx, cy, r * 0.32)
      break
    case 'grand-orrery':
      glow(ctx, cx, cy, r * 1.3, '#ffd070', 0.5)
      ctx.fillStyle = radialMetal(ctx, cx, cy, r * 0.35, { hi: '#fff4b0', mid: '#e8a030', lo: '#6a3a08' })
      circle(ctx, cx, cy, r * 0.35)
      ctx.fill()
      rivetRing(ctx, cx, cy, r * 0.28, 12, r * 0.02)
      break
    default:
      body(ctx, cx, cy, r, r * 0.7, BRASS)
  }
  void P
}

function glassDome(ctx: Ctx, cx: number, cy: number, r: number) {
  glow(ctx, cx, cy, r * 1.8, '#7fd4ff', 0.6)
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.4, 'rgba(127,212,255,0.7)')
  g.addColorStop(1, 'rgba(20,60,100,0.9)')
  ctx.fillStyle = g
  circle(ctx, cx, cy, r)
  ctx.fill()
  ctx.strokeStyle = metalGradient(ctx, cx - r, cy - r, cx + r, cy + r, BRASS)
  ctx.lineWidth = r * 0.15
  ctx.stroke()
}

function paintSpinner(ctx: Ctx, def: EnemyDefinition, cx: number, cy: number, r: number) {
  if (def.id === 'grand-orrery') {
    for (let i = 0; i < 3; i++) {
      const rr = r * (0.55 + i * 0.22)
      ctx.strokeStyle = metalGradient(ctx, cx - rr, cy - rr, cx + rr, cy + rr, BRASS)
      ctx.lineWidth = r * 0.05
      ctx.beginPath()
      ctx.ellipse(cx, cy, rr, rr * 0.92, i * 0.6, 0, Math.PI * 2)
      ctx.stroke()
      const a = i * 2.1
      const px = cx + Math.cos(a) * rr
      const py = cy + Math.sin(a) * rr * 0.92
      ctx.fillStyle = radialMetal(ctx, px, py, r * 0.1, i === 1 ? COPPER : STEEL)
      circle(ctx, px, py, r * 0.1)
      ctx.fill()
    }
    return
  }
  if (def.id === 'magnet-drone') {
    ctx.strokeStyle = rgba('#ff8a8a', 0.35)
    ctx.lineWidth = r * 0.06
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.arc(cx, cy, r * (0.9 + i * 0.25), -0.8, 0.8)
      ctx.stroke()
    }
    return
  }
  // Rotor discs: translucent blurred blades.
  const rotors = def.id === 'zeppelin-carrier' ? [[-0.9, 0], [0.2, -0.65], [0.2, 0.65]] : [[0.1, -0.55], [0.1, 0.55]]
  for (const [ox, oy] of rotors) {
    const x = cx + ox * r
    const y = cy + oy * r
    const rr = r * (def.id === 'zeppelin-carrier' ? 0.28 : 0.5)
    ctx.fillStyle = 'rgba(220,220,220,0.12)'
    circle(ctx, x, y, rr)
    ctx.fill()
    ctx.strokeStyle = 'rgba(40,30,20,0.85)'
    ctx.lineWidth = rr * 0.16
    for (let b = 0; b < 3; b++) {
      const a = (b / 3) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
      ctx.stroke()
    }
    ctx.fillStyle = BRASS.mid
    circle(ctx, x, y, rr * 0.18)
    ctx.fill()
  }
}
