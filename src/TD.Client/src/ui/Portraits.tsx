import { useEffect, useRef } from 'react'
import type { EnemyDefinition, TowerDefinition } from '../api/types'
import { drawEnemyIcon } from '../game/render/enemyArt'
import { drawTowerIcon } from '../game/render/towerArt'

/** A tower rendered with the same procedural art as the battlefield. */
export function TowerPortrait({ tower, size = 56, tier = 1 }: { tower: TowerDefinition; size?: number; tier?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) drawTowerIcon(ref.current, tower, tier)
  }, [tower, tier])
  const px = Math.round(size * Math.min(2, window.devicePixelRatio || 1))
  return <canvas ref={ref} width={px} height={px} style={{ width: size, height: size }} className="portrait" />
}

export function EnemyPortrait({ enemy, size = 56 }: { enemy: EnemyDefinition; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) drawEnemyIcon(ref.current, enemy)
  }, [enemy])
  const px = Math.round(size * Math.min(2, window.devicePixelRatio || 1))
  return <canvas ref={ref} width={px} height={px} style={{ width: size, height: size }} className="portrait" />
}
