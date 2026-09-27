// Human-readable names and formatting for content stat keys.

const statLabels: Record<string, [label: string, format: 'num' | 'pct' | 'sec' | 'tiles' | 'deg' | 'rate' | 'flag']> = {
  damage: ['Damage', 'num'],
  rate: ['Fire rate', 'rate'],
  range: ['Range', 'tiles'],
  minRange: ['Minimum range', 'tiles'],
  splash: ['Blast radius', 'tiles'],
  pierce: ['Pierce', 'num'],
  chains: ['Chain targets', 'num'],
  chainRange: ['Chain reach', 'tiles'],
  chainFalloff: ['Chain falloff', 'pct'],
  projectileSpeed: ['Projectile speed', 'num'],
  coneAngle: ['Cone angle', 'deg'],
  critChance: ['Critical chance', 'pct'],
  critMul: ['Critical bonus', 'num'],
  armorPierce: ['Armour piercing', 'num'],
  burnDps: ['Burn damage/s', 'num'],
  burnDuration: ['Burn duration', 'sec'],
  poisonDps: ['Poison damage/s', 'num'],
  poisonDuration: ['Poison duration', 'sec'],
  slowPct: ['Slow', 'pct'],
  slowDuration: ['Slow duration', 'sec'],
  stunChance: ['Stun chance', 'pct'],
  stunDuration: ['Stun duration', 'sec'],
  shockChance: ['Shock chance', 'pct'],
  corrodePerHit: ['Corrosion per hit', 'num'],
  corrodeMax: ['Max corrosion', 'num'],
  exposePct: ['Exposes target', 'pct'],
  exposeDuration: ['Expose duration', 'sec'],
  pullDistance: ['Pull', 'tiles'],
  knockback: ['Knockback', 'tiles'],
  beamRamp: ['Beam ramp/s', 'pct'],
  beamRampMax: ['Beam ramp max', 'num'],
  mineCount: ['Max mines', 'num'],
  buffDamage: ['Ally damage', 'pct'],
  buffRate: ['Ally fire rate', 'pct'],
  buffRange: ['Ally range', 'pct'],
  buffProtect: ['Protects allies', 'flag'],
  reveal: ['Reveals cloaked', 'flag'],
  auraExposePct: ['Marks enemies', 'pct'],
  auraSlowPct: ['Field slow', 'pct'],
  auraBounty: ['Bounty aura', 'pct'],
  income: ['Gold per wave', 'num'],
  interestBonus: ['Interest bonus', 'pct'],
  bountyBonus: ['Bounty bonus', 'pct'],
  groundAir: ['Grounds air units', 'flag'],
  hitsPhased: ['Hits phased enemies', 'flag'],
  bossDamageMul: ['Bonus vs bosses', 'pct'],
  airDamageMul: ['Bonus vs air', 'pct'],
}

export function statLabel(key: string): string {
  return statLabels[key]?.[0] ?? key
}

export function formatStat(key: string, value: number): string {
  const format = statLabels[key]?.[1] ?? 'num'
  switch (format) {
    case 'pct':
      return `${Math.round(value * 100)}%`
    case 'sec':
      return `${trim(value)}s`
    case 'tiles':
      return `${trim(value)} tiles`
    case 'deg':
      return `${trim(value)}°`
    case 'rate':
      return `${trim(value)}/s`
    case 'flag':
      return value > 0 ? 'Yes' : 'No'
    default:
      return trim(value)
  }
}

export function formatMod(mod: { stat: string; op: string; value: number }): string {
  const label = statLabel(mod.stat)
  if (mod.op === 'mul') {
    const pct = Math.round((mod.value - 1) * 100)
    return `${label} ${pct >= 0 ? '+' : ''}${pct}%`
  }
  if (mod.op === 'set') {
    return `${label}: ${formatStat(mod.stat, mod.value)}`
  }
  return `${label} ${mod.value >= 0 ? '+' : ''}${formatStat(mod.stat, mod.value)}`
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

export const damageTypeColor: Record<string, string> = {
  ballistic: '#d8b070',
  electric: '#7fd4ff',
  fire: '#ff7a2a',
  chemical: '#a6e05a',
  force: '#c0a890',
  temporal: '#b690ff',
}

export function titleCase(id: string): string {
  return id.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

export function roman(n: number): string {
  return ['I', 'II', 'III', 'IV', 'V'][n] ?? String(n + 1)
}

/** Human wording for level rule keys such as "maxTowers:14". */
export function formatRule(rule: string): string {
  const [key, value] = rule.split(':')
  switch (key) {
    case 'noSell':
      return 'No selling'
    case 'maxTowers':
      return `Max ${value} towers`
    case 'cores':
      return `${value} core${value === '1' ? '' : 's'}`
    case 'startingGoldMul':
      return `${Math.round(Number(value) * 100)}% starting gold`
    case 'maxTier':
      return `Upgrades to tier ${value}`
    case 'noInteraction':
      return 'No map interaction'
    default:
      return rule
  }
}

/** Letter shown for a map entrance, by its index in the map's spawn list. */
export function gateLetter(spawnIndex: number): string {
  return String.fromCharCode(65 + spawnIndex)
}
