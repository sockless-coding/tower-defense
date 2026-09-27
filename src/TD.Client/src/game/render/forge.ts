import { Texture } from 'pixi.js'
import { circle, fbm, makeCanvas, rgba } from './paint'

/** Shared effect textures, generated once per session. */
export class TextureForge {
  readonly glow: Texture
  readonly softDot: Texture
  readonly smoke: Texture
  readonly spark: Texture
  readonly ember: Texture
  readonly ring: Texture
  readonly shard: Texture
  readonly raindrop: Texture
  readonly snowflake: Texture
  readonly fog: Texture
  readonly beam: Texture
  readonly cone: Texture
  readonly core: Texture
  readonly light: Texture
  readonly bubble: Texture

  constructor() {
    this.glow = this.radial(128, [
      [0, 'rgba(255,255,255,1)'],
      [0.25, 'rgba(255,255,255,0.55)'],
      [0.6, 'rgba(255,255,255,0.12)'],
      [1, 'rgba(255,255,255,0)'],
    ])
    this.light = this.radial(256, [
      [0, 'rgba(255,255,255,1)'],
      [0.4, 'rgba(255,255,255,0.5)'],
      [1, 'rgba(255,255,255,0)'],
    ])
    this.softDot = this.radial(32, [
      [0, 'rgba(255,255,255,1)'],
      [0.5, 'rgba(255,255,255,0.8)'],
      [1, 'rgba(255,255,255,0)'],
    ])
    this.smoke = this.smokePuff(128)
    this.spark = this.streak(64, 10)
    this.ember = this.radial(24, [
      [0, 'rgba(255,255,230,1)'],
      [0.4, 'rgba(255,200,120,0.9)'],
      [1, 'rgba(255,120,40,0)'],
    ])
    this.ring = this.ringTexture(256)
    this.shard = this.shardTexture()
    this.raindrop = this.streak(40, 3)
    this.snowflake = this.radial(16, [
      [0, 'rgba(255,255,255,1)'],
      [0.6, 'rgba(240,248,255,0.8)'],
      [1, 'rgba(255,255,255,0)'],
    ])
    this.fog = this.fogTexture(512)
    this.beam = this.beamTexture()
    this.cone = this.coneTexture()
    this.core = this.coreTexture()
    this.bubble = this.bubbleTexture()
  }

  private tex(canvas: HTMLCanvasElement): Texture {
    return Texture.from({ resource: canvas, antialias: true })
  }

  private radial(size: number, stops: [number, string][]): Texture {
    const { canvas, ctx } = makeCanvas(size, size)
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    for (const [o, c] of stops) g.addColorStop(o, c)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    return this.tex(canvas)
  }

  private smokePuff(size: number): Texture {
    const { canvas, ctx } = makeCanvas(size, size)
    const img = ctx.createImageData(size, size)
    const c = size / 2
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - c, y - c) / c
        const n = fbm(x / 22, y / 22, 7, 4)
        const a = Math.max(0, 1 - d * (1.1 - n * 0.5)) ** 1.6 * (0.55 + n * 0.6)
        const i = (y * size + x) * 4
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
        img.data[i + 3] = Math.min(255, a * 255)
      }
    }
    ctx.putImageData(img, 0, 0)
    return this.tex(canvas)
  }

  private streak(length: number, width: number): Texture {
    const { canvas, ctx } = makeCanvas(length, width)
    const g = ctx.createLinearGradient(0, 0, length, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.7, 'rgba(255,255,255,0.8)')
    g.addColorStop(1, 'rgba(255,255,255,1)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(length / 2, width / 2, length / 2, width / 2, 0, 0, Math.PI * 2)
    ctx.fill()
    return this.tex(canvas)
  }

  private ringTexture(size: number): Texture {
    const { canvas, ctx } = makeCanvas(size, size)
    const c = size / 2
    const g = ctx.createRadialGradient(c, c, c * 0.6, c, c, c)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.75, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.85, 'rgba(255,255,255,0.5)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    return this.tex(canvas)
  }

  private shardTexture(): Texture {
    const { canvas, ctx } = makeCanvas(24, 24)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(12, 1)
    ctx.lineTo(18, 12)
    ctx.lineTo(12, 23)
    ctx.lineTo(7, 12)
    ctx.closePath()
    ctx.fill()
    return this.tex(canvas)
  }

  private fogTexture(size: number): Texture {
    const { canvas, ctx } = makeCanvas(size, size)
    const img = ctx.createImageData(size, size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Tileable fbm by sampling on a torus.
        const u = x / size
        const v = y / size
        const n =
          fbm(Math.cos(u * Math.PI * 2) * 2 + 5, Math.sin(u * Math.PI * 2) * 2 + Math.cos(v * Math.PI * 2) * 2, 3, 5) * 0.6 +
          fbm(Math.sin(v * Math.PI * 2) * 3 + 11, Math.cos(u * Math.PI * 2) * 3, 9, 4) * 0.4
        const a = Math.max(0, Math.min(1, (n - 0.35) * 2.2))
        const i = (y * size + x) * 4
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
        img.data[i + 3] = a * 255
      }
    }
    ctx.putImageData(img, 0, 0)
    return this.tex(canvas)
  }

  private beamTexture(): Texture {
    const { canvas, ctx } = makeCanvas(8, 32)
    const g = ctx.createLinearGradient(0, 0, 0, 32)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.6)')
    g.addColorStop(0.5, 'rgba(255,255,255,1)')
    g.addColorStop(0.65, 'rgba(255,255,255,0.6)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 8, 32)
    return this.tex(canvas)
  }

  private coneTexture(): Texture {
    const { canvas, ctx } = makeCanvas(256, 256)
    const g = ctx.createRadialGradient(0, 128, 0, 0, 128, 256)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.45)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(0, 128)
    ctx.lineTo(256, 0)
    ctx.lineTo(256, 256)
    ctx.closePath()
    ctx.fill()
    return this.tex(canvas)
  }

  private coreTexture(): Texture {
    const { canvas, ctx } = makeCanvas(48, 48)
    const g = ctx.createRadialGradient(20, 18, 2, 24, 24, 20)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.3, '#b8ecff')
    g.addColorStop(0.7, '#3aa6e0')
    g.addColorStop(1, 'rgba(20,60,120,0)')
    ctx.fillStyle = g
    circle(ctx, 24, 24, 20)
    ctx.fill()
    ctx.strokeStyle = rgba('#e0f8ff', 0.8)
    ctx.lineWidth = 1.5
    circle(ctx, 24, 24, 11)
    ctx.stroke()
    return this.tex(canvas)
  }

  private bubbleTexture(): Texture {
    const { canvas, ctx } = makeCanvas(24, 24)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 2
    circle(ctx, 12, 12, 9)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fill()
    return this.tex(canvas)
  }
}
