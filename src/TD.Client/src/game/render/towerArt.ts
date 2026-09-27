import { Texture } from 'pixi.js'
import type { TowerDefinition } from '../../api/types'
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
  polygon,
  radialMetal,
  rgba,
  rivet,
  rivetRing,
  shadeHex,
  shadow,
  STEEL,
  type Ctx,
  type Metal,
} from './paint'

export const CATEGORY_EMISSIVE: Record<string, string> = {
  ballistic: '#ffb050',
  electrical: '#7fd4ff',
  flame: '#ff7a2a',
  chemical: '#a6e05a',
  support: '#ffe6a0',
  mechanical: '#e8c890',
  experimental: '#b690ff',
}

type Head =
  | 'cannon'
  | 'gatling'
  | 'rails'
  | 'mortar'
  | 'twin'
  | 'harpoon'
  | 'coil'
  | 'electrodes'
  | 'dome'
  | 'hopper'
  | 'nozzle'
  | 'furnace'
  | 'canister'
  | 'catapult'
  | 'sprayer'
  | 'pump'
  | 'vents'
  | 'flask'
  | 'mast'
  | 'lamp'
  | 'manifold'
  | 'forge'
  | 'dish'
  | 'spring'
  | 'hammer'
  | 'saw'
  | 'clock'
  | 'orb'
  | 'singularity'
  | 'prism'
  | 'lance'

/** Visual recipe per tower. `rotates` heads track their target; the rest animate in place. */
export const TOWER_HEADS: Record<string, { head: Head; rotates: boolean }> = {
  'rivet-cannon': { head: 'cannon', rotates: true },
  'gatling-nest': { head: 'gatling', rotates: true },
  'railgun-turret': { head: 'rails', rotates: true },
  'mortar-tower': { head: 'mortar', rotates: true },
  'flak-battery': { head: 'twin', rotates: true },
  'harpoon-launcher': { head: 'harpoon', rotates: true },
  'tesla-coil': { head: 'coil', rotates: false },
  'arc-tower': { head: 'electrodes', rotates: true },
  'storm-generator': { head: 'dome', rotates: false },
  'galvanic-mine-layer': { head: 'hopper', rotates: true },
  incinerator: { head: 'nozzle', rotates: true },
  'furnace-tower': { head: 'furnace', rotates: false },
  'napalm-projector': { head: 'canister', rotates: true },
  'boiler-bomb': { head: 'catapult', rotates: true },
  'acid-sprayer': { head: 'sprayer', rotates: true },
  'corrosion-pump': { head: 'pump', rotates: true },
  'toxic-diffuser': { head: 'vents', rotates: false },
  'alchemical-still': { head: 'flask', rotates: true },
  'amplifier-beacon': { head: 'mast', rotates: false },
  'spotter-tower': { head: 'lamp', rotates: true },
  'steam-pressure-booster': { head: 'manifold', rotates: false },
  'gear-forge': { head: 'forge', rotates: false },
  'signal-relay': { head: 'dish', rotates: true },
  'clockwork-snare': { head: 'spring', rotates: true },
  'steam-hammer': { head: 'hammer', rotates: false },
  'sawblade-launcher': { head: 'saw', rotates: true },
  'time-distortion-tower': { head: 'clock', rotates: false },
  'gravity-manipulator': { head: 'orb', rotates: false },
  'singularium-engine': { head: 'singularity', rotates: true },
  'aether-prism': { head: 'prism', rotates: true },
  'phase-lance': { head: 'lance', rotates: true },
}

export interface TowerTextures {
  base: Texture
  head: Texture
  /** Canvas size in tiles; sprites are scaled by TILE / (pixelsPerTile). */
  size: number
}

const cache = new Map<string, TowerTextures>()
const canvasCache = new Map<string, { base: HTMLCanvasElement; head: HTMLCanvasElement; size: number }>()

/** The raw baked canvases (also used for HUD icons). */
export function towerCanvases(def: TowerDefinition, tier: number, scale: number) {
  const key = `${def.id}:${tier}:${scale}`
  const hit = canvasCache.get(key)
  if (hit) return hit
  const P = 64 * scale
  const size = 1.7
  const S = Math.ceil(P * size)
  const emissive = CATEGORY_EMISSIVE[def.category]
  const base = makeCanvas(S, S)
  paintBase(base.ctx, S / 2, S / 2, P, tier, emissive, def.category)
  grain(base.ctx, S, S, 0.05, def.id.length)
  const head = makeCanvas(S, S)
  paintHead(head.ctx, TOWER_HEADS[def.id]?.head ?? 'cannon', S / 2, S / 2, P, tier, emissive)
  grain(head.ctx, S, S, 0.04, def.id.length + 7)
  const result = { base: base.canvas, head: head.canvas, size }
  canvasCache.set(key, result)
  return result
}

/** Draws a tower portrait (plinth + head angled toward the viewer) into a 2D canvas. */
export function drawTowerIcon(target: HTMLCanvasElement, def: TowerDefinition, tier = 1): void {
  const ctx = target.getContext('2d')
  if (!ctx) return
  const art = towerCanvases(def, tier, 1.5)
  ctx.clearRect(0, 0, target.width, target.height)
  const s = Math.min(target.width, target.height) * 1.15
  const x = (target.width - s) / 2
  const y = (target.height - s) / 2
  ctx.drawImage(art.base, x, y, s, s)
  ctx.save()
  ctx.translate(target.width / 2, target.height / 2)
  if (TOWER_HEADS[def.id]?.rotates) ctx.rotate(-Math.PI / 4)
  ctx.drawImage(art.head, -s / 2, -s / 2, s, s)
  ctx.restore()
}

/** Bakes (and caches) the base plinth and head textures for a tower at a tier. */
export function towerTextures(def: TowerDefinition, tier: number, scale: number): TowerTextures {
  const key = `${def.id}:${tier}:${scale}`
  const hit = cache.get(key)
  if (hit) return hit
  const art = towerCanvases(def, tier, scale)
  const result = {
    base: Texture.from({ resource: art.base, antialias: true }),
    head: Texture.from({ resource: art.head, antialias: true }),
    size: art.size,
  }
  cache.set(key, result)
  return result
}

function paintBase(ctx: Ctx, cx: number, cy: number, P: number, tier: number, emissive: string, category: string) {
  shadow(ctx, cx + P * 0.06, cy + P * 0.12, P * 0.56, P * 0.46, 0.6)
  // Octagonal iron plinth with a brass rim.
  polygon(ctx, cx, cy, P * 0.46, 8, Math.PI / 8)
  ctx.fillStyle = metalGradient(ctx, cx - P / 2, cy - P / 2, cx + P / 2, cy + P / 2, BRASS)
  ctx.fill()
  polygon(ctx, cx, cy, P * 0.41, 8, Math.PI / 8)
  ctx.fillStyle = radialMetal(ctx, cx, cy, P * 0.45, IRON)
  ctx.fill()
  rivetRing(ctx, cx, cy, P * 0.37, 8, P * 0.022, Math.PI / 8)
  // Category trim band.
  ctx.strokeStyle = rgba(emissive, 0.5)
  ctx.lineWidth = P * 0.02
  circle(ctx, cx, cy, P * 0.3)
  ctx.stroke()
  // Side flywheel shows it's a machine.
  drawGear(ctx, cx - P * 0.3, cy + P * 0.28, P * 0.1, 8, category === 'experimental' ? STEEL : BRASS)
  if (tier >= 2) {
    pipe(ctx, cx + P * 0.18, cy + P * 0.36, cx + P * 0.38, cy + P * 0.16, P * 0.05, COPPER)
  }
  if (tier >= 3) {
    ctx.strokeStyle = metalGradient(ctx, cx - P / 2, cy, cx + P / 2, cy, BRASS)
    ctx.lineWidth = P * 0.035
    circle(ctx, cx, cy, P * 0.42)
    ctx.stroke()
    // Pressure gauge.
    ctx.fillStyle = '#efe2c2'
    circle(ctx, cx + P * 0.3, cy - P * 0.3, P * 0.07)
    ctx.fill()
    ctx.strokeStyle = BRASS.lo
    ctx.lineWidth = P * 0.015
    ctx.stroke()
    ctx.strokeStyle = '#a02010'
    ctx.beginPath()
    ctx.moveTo(cx + P * 0.3, cy - P * 0.3)
    ctx.lineTo(cx + P * 0.34, cy - P * 0.34)
    ctx.stroke()
  }
  if (tier >= 4) {
    glow(ctx, cx, cy, P * 0.62, emissive, 0.35)
    ctx.strokeStyle = rgba(emissive, 0.9)
    ctx.lineWidth = P * 0.02
    polygon(ctx, cx, cy, P * 0.47, 8, Math.PI / 8)
    ctx.stroke()
  }
}

// ---------------------------------------------------------------------------------------------- Head parts

function housing(ctx: Ctx, cx: number, cy: number, r: number, m: Metal = BRASS) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  circle(ctx, cx + r * 0.12, cy + r * 0.18, r)
  ctx.fill()
  ctx.fillStyle = radialMetal(ctx, cx, cy, r, m)
  circle(ctx, cx, cy, r)
  ctx.fill()
  ctx.strokeStyle = 'rgba(20,10,4,0.8)'
  ctx.lineWidth = r * 0.08
  ctx.stroke()
  highlight(ctx, cx, cy, r)
}

function barrel(ctx: Ctx, x: number, y: number, length: number, width: number, m: Metal = IRON, muzzle: Metal = BRASS) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fillRect(x + width * 0.15, y - width / 2 + width * 0.25, length, width)
  ctx.fillStyle = metalGradient(ctx, x, y - width / 2, x, y + width / 2, { hi: m.hi, mid: m.mid, lo: m.lo })
  ctx.beginPath()
  ctx.roundRect(x, y - width / 2, length, width, width * 0.25)
  ctx.fill()
  ctx.fillStyle = metalGradient(ctx, x, y - width, x, y + width, muzzle)
  ctx.beginPath()
  ctx.roundRect(x + length - width * 0.5, y - width * 0.62, width * 0.55, width * 1.24, width * 0.2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(x + width * 0.3, y - width * 0.35, length - width, width * 0.15)
}

function coilStack(ctx: Ctx, cx: number, cy: number, P: number, rings: number, color: string) {
  for (let i = 0; i < rings; i++) {
    const r = P * (0.3 - i * 0.045)
    ctx.strokeStyle = metalGradient(ctx, cx - r, cy - r, cx + r, cy + r, COPPER)
    ctx.lineWidth = P * 0.05
    circle(ctx, cx, cy - i * P * 0.02, r)
    ctx.stroke()
  }
  glow(ctx, cx, cy, P * 0.35, color, 0.5)
  ctx.fillStyle = radialMetal(ctx, cx, cy - P * 0.06, P * 0.12, BRASS)
  circle(ctx, cx, cy - P * 0.06, P * 0.12)
  ctx.fill()
  highlight(ctx, cx, cy - P * 0.06, P * 0.12, 0.7)
}

function tank(ctx: Ctx, x: number, y: number, w: number, h: number, liquid: string) {
  ctx.fillStyle = metalGradient(ctx, x, y, x + w, y, STEEL)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, w * 0.45)
  ctx.fill()
  ctx.fillStyle = rgba(liquid, 0.85)
  ctx.beginPath()
  ctx.roundRect(x + w * 0.2, y + h * 0.3, w * 0.6, h * 0.55, w * 0.25)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(x + w * 0.25, y + h * 0.12, w * 0.12, h * 0.7)
}

function glassDome(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.05, cx, cy, r)
  g.addColorStop(0, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.3, rgba(color, 0.5))
  g.addColorStop(1, rgba(shadeHex(color, -0.6), 0.85))
  ctx.fillStyle = g
  circle(ctx, cx, cy, r)
  ctx.fill()
  ctx.strokeStyle = metalGradient(ctx, cx - r, cy - r, cx + r, cy + r, BRASS)
  ctx.lineWidth = r * 0.12
  ctx.stroke()
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    ctx.strokeStyle = rgba(BRASS.mid, 0.7)
    ctx.lineWidth = r * 0.05
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    ctx.stroke()
  }
}

function crystal(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  glow(ctx, cx, cy, r * 1.8, color, 0.55)
  const pts = [
    [0, -1],
    [0.55, -0.35],
    [0.6, 0.4],
    [0, 1],
    [-0.6, 0.4],
    [-0.55, -0.35],
  ]
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(cx + x * r, cy + y * r) : ctx.lineTo(cx + x * r, cy + y * r)))
  ctx.closePath()
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.4, color)
  g.addColorStop(1, shadeHex(color, -0.5))
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = r * 0.06
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx, cy + r)
  ctx.moveTo(cx - r * 0.55, cy - r * 0.35)
  ctx.lineTo(cx + r * 0.6, cy + r * 0.4)
  ctx.stroke()
}

function paintHead(ctx: Ctx, head: Head, cx: number, cy: number, P: number, tier: number, emissive: string) {
  const t = tier
  const big = 1 + (t - 1) * 0.06
  switch (head) {
    case 'cannon': {
      const count = t >= 4 ? 3 : 1
      for (let i = 0; i < count; i++) barrel(ctx, cx, cy + (i - (count - 1) / 2) * P * 0.16, P * 0.5 * big, P * (t >= 2 ? 0.17 : 0.14))
      housing(ctx, cx, cy, P * 0.22 * big)
      rivetRing(ctx, cx, cy, P * 0.15, 6, P * 0.018)
      break
    }
    case 'gatling': {
      for (let i = -1; i <= 1; i++) barrel(ctx, cx, cy + i * P * 0.07, P * 0.46 * big, P * 0.06, STEEL)
      if (t >= 4) for (let i = -1; i <= 1; i++) barrel(ctx, cx - P * 0.05, cy + i * P * 0.07 + P * 0.2, P * 0.4, P * 0.05, STEEL)
      ctx.fillStyle = metalGradient(ctx, cx - P * 0.1, cy - P * 0.14, cx + P * 0.1, cy + P * 0.14, BRASS)
      ctx.beginPath()
      ctx.roundRect(cx + P * 0.08, cy - P * 0.14, P * 0.12, P * 0.28, P * 0.04)
      ctx.fill()
      housing(ctx, cx, cy, P * 0.2)
      // Ammunition drum.
      ctx.fillStyle = radialMetal(ctx, cx - P * 0.1, cy - P * 0.2, P * 0.1, COPPER)
      circle(ctx, cx - P * 0.1, cy - P * 0.2, P * 0.1)
      ctx.fill()
      break
    }
    case 'rails': {
      for (const off of [-0.1, 0.1]) {
        ctx.fillStyle = metalGradient(ctx, cx, cy + off * P - 4, cx, cy + off * P + 4, STEEL)
        ctx.fillRect(cx - P * 0.05, cy + off * P - P * 0.035, P * 0.72 * big, P * 0.07)
      }
      for (let i = 0; i < 4 + t; i++) {
        const x = cx + P * (0.08 + i * 0.11)
        glow(ctx, x, cy, P * 0.1, emissive, 0.7)
        ctx.fillStyle = COPPER.mid
        ctx.fillRect(x - P * 0.02, cy - P * 0.1, P * 0.04, P * 0.2)
      }
      housing(ctx, cx - P * 0.05, cy, P * 0.2, IRON)
      break
    }
    case 'mortar': {
      housing(ctx, cx, cy, P * 0.3, IRON)
      ctx.fillStyle = metalGradient(ctx, cx, cy - P * 0.2, cx, cy + P * 0.2, BRASS)
      circle(ctx, cx + P * 0.06, cy, P * 0.2 * big)
      ctx.fill()
      ctx.fillStyle = '#080604'
      circle(ctx, cx + P * 0.08, cy, P * 0.13 * big)
      ctx.fill()
      rivetRing(ctx, cx + P * 0.06, cy, P * 0.17, 8, P * 0.015)
      if (t >= 4) for (const [ox, oy] of [[-0.2, -0.2], [-0.2, 0.2]]) {
        ctx.fillStyle = '#080604'
        circle(ctx, cx + P * ox, cy + P * oy, P * 0.07)
        ctx.fill()
      }
      break
    }
    case 'twin': {
      barrel(ctx, cx, cy - P * 0.09, P * 0.46 * big, P * 0.09)
      barrel(ctx, cx, cy + P * 0.09, P * 0.46 * big, P * 0.09)
      housing(ctx, cx, cy, P * 0.21, STEEL)
      break
    }
    case 'harpoon': {
      ctx.strokeStyle = metalGradient(ctx, cx, cy - P * 0.3, cx, cy + P * 0.3, BRASS)
      ctx.lineWidth = P * 0.05
      ctx.beginPath()
      ctx.moveTo(cx + P * 0.25, cy - P * 0.32)
      ctx.quadraticCurveTo(cx + P * 0.1, cy, cx + P * 0.25, cy + P * 0.32)
      ctx.stroke()
      barrel(ctx, cx - P * 0.1, cy, P * 0.6 * big, P * 0.06, STEEL, STEEL)
      ctx.fillStyle = STEEL.hi
      ctx.beginPath()
      ctx.moveTo(cx + P * 0.58 * big, cy)
      ctx.lineTo(cx + P * 0.45 * big, cy - P * 0.07)
      ctx.lineTo(cx + P * 0.45 * big, cy + P * 0.07)
      ctx.closePath()
      ctx.fill()
      housing(ctx, cx - P * 0.05, cy, P * 0.17)
      break
    }
    case 'coil': {
      coilStack(ctx, cx, cy, P * big, 3 + Math.min(2, t - 1), emissive)
      break
    }
    case 'electrodes': {
      for (const off of [-0.12, 0.12]) {
        pipe(ctx, cx, cy + off * P, cx + P * 0.45 * big, cy + off * P * 0.5, P * 0.07, COPPER)
        glow(ctx, cx + P * 0.47 * big, cy + off * P * 0.5, P * 0.1, emissive, 0.9)
      }
      housing(ctx, cx, cy, P * 0.2, IRON)
      coilStack(ctx, cx, cy, P * 0.45, 2, emissive)
      break
    }
    case 'dome': {
      housing(ctx, cx, cy, P * 0.32, IRON)
      glassDome(ctx, cx, cy, P * 0.26 * big, emissive)
      break
    }
    case 'hopper': {
      ctx.fillStyle = metalGradient(ctx, cx - P * 0.25, cy - P * 0.25, cx + P * 0.25, cy + P * 0.25, IRON)
      ctx.beginPath()
      ctx.roundRect(cx - P * 0.24, cy - P * 0.22, P * 0.42, P * 0.44, P * 0.06)
      ctx.fill()
      for (let i = 0; i < 4; i++) {
        const x = cx - P * 0.12 + (i % 2) * P * 0.16
        const y = cy - P * 0.08 + Math.floor(i / 2) * P * 0.16
        ctx.fillStyle = radialMetal(ctx, x, y, P * 0.06, COPPER)
        circle(ctx, x, y, P * 0.06)
        ctx.fill()
        glow(ctx, x, y, P * 0.06, emissive, 0.8)
      }
      barrel(ctx, cx + P * 0.15, cy, P * 0.22, P * 0.1)
      break
    }
    case 'nozzle': {
      tank(ctx, cx - P * 0.3, cy - P * 0.28, P * 0.16, P * 0.24, '#ff9a3a')
      tank(ctx, cx - P * 0.3, cy + P * 0.04, P * 0.16, P * 0.24, '#ff9a3a')
      barrel(ctx, cx, cy, P * 0.4 * big, P * 0.11, COPPER, IRON)
      glow(ctx, cx + P * 0.44 * big, cy, P * 0.1, emissive, 0.9)
      housing(ctx, cx, cy, P * 0.16, IRON)
      break
    }
    case 'furnace': {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(cx - P * 0.26, cy - P * 0.22, P * 0.56, P * 0.56)
      ctx.fillStyle = metalGradient(ctx, cx - P * 0.3, cy - P * 0.3, cx + P * 0.3, cy + P * 0.3, { hi: '#6a4a3a', mid: '#4a2e22', lo: '#24140c' })
      ctx.beginPath()
      ctx.roundRect(cx - P * 0.3, cy - P * 0.3, P * 0.6, P * 0.6, P * 0.08)
      ctx.fill()
      const g = ctx.createRadialGradient(cx, cy + P * 0.05, 0, cx, cy + P * 0.05, P * 0.2)
      g.addColorStop(0, '#fff0a0')
      g.addColorStop(0.5, '#ff7a1a')
      g.addColorStop(1, '#5a1004')
      ctx.fillStyle = g
      ctx.fillRect(cx - P * 0.18, cy - P * 0.08, P * 0.36, P * 0.26)
      ctx.strokeStyle = '#1a0c06'
      ctx.lineWidth = P * 0.03
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.moveTo(cx - P * 0.18 + i * P * 0.12, cy - P * 0.08)
        ctx.lineTo(cx - P * 0.18 + i * P * 0.12, cy + P * 0.18)
        ctx.stroke()
      }
      ctx.fillStyle = radialMetal(ctx, cx, cy - P * 0.22, P * 0.09, BRASS)
      circle(ctx, cx, cy - P * 0.22, P * 0.09)
      ctx.fill()
      rivetRing(ctx, cx, cy, P * 0.36, 4, P * 0.025, Math.PI / 4)
      break
    }
    case 'canister': {
      barrel(ctx, cx - P * 0.05, cy, P * 0.5 * big, P * 0.18, IRON)
      tank(ctx, cx - P * 0.18, cy - P * 0.08, P * 0.2, P * 0.16, '#ff7a2a')
      housing(ctx, cx - P * 0.12, cy, P * 0.15, COPPER)
      break
    }
    case 'catapult': {
      pipe(ctx, cx - P * 0.25, cy, cx + P * 0.3, cy, P * 0.07, { hi: '#9a7448', mid: '#6a4a2a', lo: '#3a2614' })
      ctx.fillStyle = radialMetal(ctx, cx + P * 0.32, cy, P * 0.14 * big, COPPER)
      circle(ctx, cx + P * 0.32, cy, P * 0.14 * big)
      ctx.fill()
      rivetRing(ctx, cx + P * 0.32, cy, P * 0.1, 6, P * 0.015)
      housing(ctx, cx - P * 0.12, cy, P * 0.17, IRON)
      break
    }
    case 'sprayer': {
      tank(ctx, cx - P * 0.32, cy - P * 0.24, P * 0.18, P * 0.48, '#8ad040')
      barrel(ctx, cx - P * 0.08, cy, P * 0.44 * big, P * 0.08, COPPER, BRASS)
      glow(ctx, cx + P * 0.4, cy, P * 0.1, emissive, 0.8)
      break
    }
    case 'pump': {
      barrel(ctx, cx, cy, P * 0.46 * big, P * 0.13, IRON, COPPER)
      ctx.fillStyle = metalGradient(ctx, cx - P * 0.2, cy - P * 0.25, cx, cy + P * 0.25, STEEL)
      ctx.beginPath()
      ctx.roundRect(cx - P * 0.28, cy - P * 0.1, P * 0.26, P * 0.2, P * 0.04)
      ctx.fill()
      tank(ctx, cx - P * 0.1, cy - P * 0.32, P * 0.2, P * 0.18, '#c8a040')
      housing(ctx, cx, cy, P * 0.14, COPPER)
      break
    }
    case 'vents': {
      housing(ctx, cx, cy, P * 0.3, IRON)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const x = cx + Math.cos(a) * P * 0.2
        const y = cy + Math.sin(a) * P * 0.2
        ctx.fillStyle = '#0a0806'
        circle(ctx, x, y, P * 0.055)
        ctx.fill()
        glow(ctx, x, y, P * 0.08, emissive, 0.8)
      }
      tank(ctx, cx - P * 0.08, cy - P * 0.1, P * 0.16, P * 0.2, '#a6e05a')
      break
    }
    case 'flask': {
      barrel(ctx, cx + P * 0.05, cy, P * 0.36 * big, P * 0.07, COPPER, BRASS)
      glassDome(ctx, cx - P * 0.05, cy, P * 0.2, '#e0c040')
      ctx.strokeStyle = COPPER.mid
      ctx.lineWidth = P * 0.03
      ctx.beginPath()
      for (let i = 0; i < 16; i++) {
        const a = i * 0.8
        ctx.lineTo(cx - P * 0.05 + Math.cos(a) * P * 0.26, cy + Math.sin(a) * P * 0.26)
      }
      ctx.stroke()
      break
    }
    case 'mast': {
      for (let i = 0; i < 2 + t; i++) {
        ctx.strokeStyle = rgba(i % 2 === 0 ? BRASS.hi : emissive, 0.9)
        ctx.lineWidth = P * 0.03
        circle(ctx, cx, cy, P * (0.1 + i * 0.07))
        ctx.stroke()
      }
      ctx.fillStyle = radialMetal(ctx, cx, cy, P * 0.1, BRASS)
      circle(ctx, cx, cy, P * 0.1)
      ctx.fill()
      glow(ctx, cx, cy, P * 0.3, emissive, 0.6)
      break
    }
    case 'lamp': {
      housing(ctx, cx - P * 0.05, cy, P * 0.18, IRON)
      ctx.fillStyle = metalGradient(ctx, cx, cy - P * 0.14, cx, cy + P * 0.14, BRASS)
      ctx.beginPath()
      ctx.moveTo(cx + P * 0.05, cy - P * 0.1)
      ctx.lineTo(cx + P * 0.34, cy - P * 0.18)
      ctx.lineTo(cx + P * 0.34, cy + P * 0.18)
      ctx.lineTo(cx + P * 0.05, cy + P * 0.1)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#fffbe0'
      ctx.fillRect(cx + P * 0.3, cy - P * 0.15, P * 0.05, P * 0.3)
      glow(ctx, cx + P * 0.36, cy, P * 0.2, '#fff4c0', 0.9)
      break
    }
    case 'manifold': {
      housing(ctx, cx, cy, P * 0.18, COPPER)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        pipe(ctx, cx, cy, cx + Math.cos(a) * P * 0.36, cy + Math.sin(a) * P * 0.36, P * 0.07, i % 2 ? COPPER : BRASS)
        ctx.fillStyle = '#efe2c2'
        circle(ctx, cx + Math.cos(a) * P * 0.36, cy + Math.sin(a) * P * 0.36, P * 0.06)
        ctx.fill()
      }
      rivet(ctx, cx, cy, P * 0.05)
      break
    }
    case 'forge': {
      drawGear(ctx, cx, cy, P * 0.3 * big, 12, BRASS)
      glow(ctx, cx, cy, P * 0.25, '#ffd060', 0.8)
      ctx.fillStyle = radialMetal(ctx, cx, cy, P * 0.1, { hi: '#fff4b0', mid: '#e8b030', lo: '#8a5a10' })
      circle(ctx, cx, cy, P * 0.1)
      ctx.fill()
      break
    }
    case 'dish': {
      pipe(ctx, cx - P * 0.2, cy, cx + P * 0.1, cy, P * 0.06, STEEL)
      ctx.strokeStyle = metalGradient(ctx, cx, cy - P * 0.3, cx, cy + P * 0.3, BRASS)
      ctx.lineWidth = P * 0.06
      ctx.beginPath()
      ctx.arc(cx - P * 0.05, cy, P * 0.3, -Math.PI / 3, Math.PI / 3)
      ctx.stroke()
      glow(ctx, cx + P * 0.22, cy, P * 0.1, emissive, 0.9)
      housing(ctx, cx - P * 0.15, cy, P * 0.13, IRON)
      break
    }
    case 'spring': {
      ctx.strokeStyle = metalGradient(ctx, cx, cy - 5, cx, cy + 5, STEEL)
      ctx.lineWidth = P * 0.03
      ctx.beginPath()
      for (let i = 0; i <= 12; i++) {
        ctx.lineTo(cx - P * 0.1 + i * P * 0.04, cy + (i % 2 ? -1 : 1) * P * 0.08)
      }
      ctx.stroke()
      barrel(ctx, cx + P * 0.2, cy, P * 0.2 * big, P * 0.14, COPPER)
      housing(ctx, cx - P * 0.12, cy, P * 0.15)
      break
    }
    case 'hammer': {
      housing(ctx, cx, cy, P * 0.3, IRON)
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(cx - P * 0.2, cy - P * 0.1, P * 0.44, P * 0.28)
      ctx.fillStyle = metalGradient(ctx, cx - P * 0.22, cy - P * 0.14, cx + P * 0.22, cy + P * 0.14, STEEL)
      ctx.beginPath()
      ctx.roundRect(cx - P * 0.22 * big, cy - P * 0.14, P * 0.44 * big, P * 0.28, P * 0.04)
      ctx.fill()
      rivetRing(ctx, cx, cy, P * 0.12, 4, P * 0.025, Math.PI / 4)
      break
    }
    case 'saw': {
      housing(ctx, cx - P * 0.12, cy, P * 0.17, IRON)
      drawGear(ctx, cx + P * 0.18, cy, P * 0.2 * big, 16, STEEL)
      break
    }
    case 'clock': {
      ctx.fillStyle = '#efe2c2'
      circle(ctx, cx, cy, P * 0.3)
      ctx.fill()
      ctx.strokeStyle = metalGradient(ctx, cx - P * 0.3, cy - P * 0.3, cx + P * 0.3, cy + P * 0.3, BRASS)
      ctx.lineWidth = P * 0.05
      ctx.stroke()
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        ctx.strokeStyle = '#3a2a18'
        ctx.lineWidth = P * 0.015
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * P * 0.22, cy + Math.sin(a) * P * 0.22)
        ctx.lineTo(cx + Math.cos(a) * P * 0.27, cy + Math.sin(a) * P * 0.27)
        ctx.stroke()
      }
      glow(ctx, cx, cy, P * 0.35, emissive, 0.45)
      break
    }
    case 'orb': {
      glow(ctx, cx, cy, P * 0.45, emissive, 0.55)
      const g = ctx.createRadialGradient(cx - P * 0.06, cy - P * 0.06, 0, cx, cy, P * 0.2)
      g.addColorStop(0, '#6a4a9a')
      g.addColorStop(0.6, '#1a0a2a')
      g.addColorStop(1, '#000000')
      ctx.fillStyle = g
      circle(ctx, cx, cy, P * 0.2 * big)
      ctx.fill()
      highlight(ctx, cx, cy, P * 0.2, 0.5)
      break
    }
    case 'singularity': {
      barrel(ctx, cx, cy, P * 0.5 * big, P * 0.16, IRON, { hi: '#d8c0ff', mid: '#8a60d0', lo: '#3a1a6a' })
      ctx.strokeStyle = metalGradient(ctx, cx - P * 0.25, cy - P * 0.25, cx + P * 0.25, cy + P * 0.25, STEEL)
      ctx.lineWidth = P * 0.04
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.ellipse(cx - P * 0.05, cy, P * 0.25, P * 0.12, (i * Math.PI) / 3, 0, Math.PI * 2)
        ctx.stroke()
      }
      glow(ctx, cx - P * 0.05, cy, P * 0.2, emissive, 0.9)
      ctx.fillStyle = '#000'
      circle(ctx, cx - P * 0.05, cy, P * 0.08)
      ctx.fill()
      break
    }
    case 'prism': {
      housing(ctx, cx - P * 0.05, cy, P * 0.22, IRON)
      crystal(ctx, cx + P * 0.05, cy, P * 0.2 * big, emissive)
      break
    }
    case 'lance': {
      ctx.fillStyle = metalGradient(ctx, cx, cy - P * 0.06, cx, cy + P * 0.06, { hi: '#e8d8ff', mid: '#9a78d8', lo: '#3a2a6a' })
      ctx.beginPath()
      ctx.moveTo(cx - P * 0.15, cy - P * 0.07)
      ctx.lineTo(cx + P * 0.68 * big, cy)
      ctx.lineTo(cx - P * 0.15, cy + P * 0.07)
      ctx.closePath()
      ctx.fill()
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = metalGradient(ctx, 0, cy - P * 0.12, 0, cy + P * 0.12, BRASS)
        ctx.lineWidth = P * 0.035
        ctx.beginPath()
        ctx.moveTo(cx + P * (0.05 + i * 0.12), cy - P * 0.12)
        ctx.lineTo(cx + P * (0.05 + i * 0.12), cy + P * 0.12)
        ctx.stroke()
      }
      glow(ctx, cx + P * 0.5, cy, P * 0.12, emissive, 0.8)
      housing(ctx, cx - P * 0.1, cy, P * 0.15, IRON)
      break
    }
  }
  if (t >= 4) glow(ctx, cx, cy, P * 0.25, emissive, 0.35)
}
