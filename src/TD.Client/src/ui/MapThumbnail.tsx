import { useEffect, useRef } from 'react'
import type { MapDefinition } from '../api/types'

/** Renders a map's grid as a small lit schematic, used on level cards and briefings. */
export function MapThumbnail({ map, width = 240, activeSpawns }: { map: MapDefinition; width?: number; activeSpawns?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cols = map.grid[0].length
  const rows = map.grid.length
  const height = Math.round((width * rows) / cols)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    const cw = width / cols
    const ch = height / rows
    const p = map.palette

    const bg = ctx.createLinearGradient(0, 0, 0, height)
    bg.addColorStop(0, shade(p.ground, -0.35))
    bg.addColorStop(1, shade(p.ground, -0.6))
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)

    let spawnIndex = 0
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c = map.grid[y][x]
        const px = x * cw
        const py = y * ch
        switch (c) {
          case '#':
            ctx.fillStyle = shade(p.metal, -0.55)
            ctx.fillRect(px, py, cw + 0.5, ch + 0.5)
            break
          case '.':
            ctx.fillStyle = shade(p.ground, 0.12)
            ctx.fillRect(px + 0.4, py + 0.4, cw - 0.8, ch - 0.8)
            break
          case '=':
            ctx.fillStyle = shade(p.ground, 0.3)
            ctx.fillRect(px, py, cw + 0.5, ch + 0.5)
            break
          case 'B':
            ctx.fillStyle = shade(p.metal, 0.1)
            ctx.fillRect(px + 0.8, py + 0.8, cw - 1.6, ch - 1.6)
            break
          case '~':
            ctx.fillStyle = withAlpha(p.accent, 0.55)
            ctx.fillRect(px, py, cw + 0.5, ch + 0.5)
            break
          case 'G':
            ctx.fillStyle = p.metal
            ctx.fillRect(px + cw * 0.2, py, cw * 0.6, ch)
            break
          default:
            ctx.fillStyle = shade(p.ground, 0.12)
            ctx.fillRect(px, py, cw, ch)
        }
      }
    }

    // Spawns glow ember-red (dimmed when inactive), the core glows with the map's light colour.
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c = map.grid[y][x]
        if (c !== 'S' && c !== 'C') continue
        const cx = (x + 0.5) * cw
        const cy = (y + 0.5) * ch
        const active = c === 'C' || activeSpawns === undefined || spawnIndex < activeSpawns
        if (c === 'S') spawnIndex++
        const color = c === 'C' ? p.light : active ? '#ff5a2a' : '#6a4a3a'
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw * 2.4)
        glow.addColorStop(0, withAlpha(color, 0.9))
        glow.addColorStop(1, withAlpha(color, 0))
        ctx.fillStyle = glow
        ctx.fillRect(cx - cw * 2.4, cy - cw * 2.4, cw * 4.8, cw * 4.8)
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(cx, cy, Math.min(cw, ch) * 0.38, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.3, width / 2, height / 2, width * 0.7)
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, width, height)
  }, [map, width, height, cols, rows, activeSpawns])

  return <canvas ref={ref} className="map-thumb" style={{ width, height }} />
}

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `rgb(${r},${g},${b})`
}

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
