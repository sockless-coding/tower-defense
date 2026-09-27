import type { QualityTier } from '../../state/settings'

export interface QualityProfile {
  tier: Exclude<QualityTier, 'auto'>
  resolution: number
  textureScale: number
  particles: number
  bloom: boolean
  bloomQuality: number
  lighting: boolean
  lightResolution: number
  weather: number
  damageNumbers: boolean
}

export function resolveQuality(tier: QualityTier, renderer: 'webgpu' | 'webgl'): QualityProfile {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const resolved = tier === 'auto' ? autoTier(renderer) : tier
  switch (resolved) {
    case 'low':
      return { tier: 'low', resolution: 1, textureScale: 1, particles: 350, bloom: false, bloomQuality: 2, lighting: true, lightResolution: 0.25, weather: 0.4, damageNumbers: true }
    case 'medium':
      return { tier: 'medium', resolution: Math.min(dpr, 1.5), textureScale: 1.5, particles: 900, bloom: true, bloomQuality: 3, lighting: true, lightResolution: 0.35, weather: 0.7, damageNumbers: true }
    case 'ultra':
      return { tier: 'ultra', resolution: Math.min(dpr, 2), textureScale: 2, particles: 2600, bloom: true, bloomQuality: 6, lighting: true, lightResolution: 0.6, weather: 1, damageNumbers: true }
    default:
      return { tier: 'high', resolution: Math.min(dpr, 2), textureScale: 2, particles: 1600, bloom: true, bloomQuality: 4, lighting: true, lightResolution: 0.5, weather: 1, damageNumbers: true }
  }
}

function autoTier(renderer: 'webgpu' | 'webgl'): Exclude<QualityTier, 'auto'> {
  if (typeof navigator === 'undefined') return 'medium'
  const cores = navigator.hardwareConcurrency ?? 4
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints ?? 0) > 1
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  if (mobile) return cores >= 8 && memory >= 6 ? 'medium' : 'low'
  if (renderer === 'webgpu' && cores >= 8) return 'ultra'
  return cores >= 6 ? 'high' : 'medium'
}

/** Steps quality down when the frame rate stays low, so weak devices converge on something smooth. */
export class FrameGovernor {
  private samples: number[] = []
  private cooldown = 5

  /** Returns true when quality should drop one tier. */
  sample(dt: number): boolean {
    this.cooldown -= dt
    this.samples.push(dt)
    if (this.samples.length > 90) this.samples.shift()
    if (this.cooldown > 0 || this.samples.length < 90) return false
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length
    if (avg > 1 / 40) {
      this.samples = []
      this.cooldown = 8
      return true
    }
    return false
  }
}

export function lowerTier(tier: QualityProfile['tier']): QualityProfile['tier'] | null {
  return tier === 'ultra' ? 'high' : tier === 'high' ? 'medium' : tier === 'medium' ? 'low' : null
}
