import { ageOn, addDays, localDayKey, weekStart } from '../core/dates'
import { dailyLoads, fitnessSeries, snapshot, weeklyLoads } from '../core/fitness'
import { computeLoad, type LoadResult, type Physiology } from '../core/load'
import type { Sport, SubSport } from '../core/activity/types'
import type { Activity, HealthRecord, PhysiologyEntry, Profile, WeightEntry } from './types'

/**
 * Une perfil, umbrales y actividades para producir la carga de cada actividad,
 * la forma física y las métricas por deporte. Funciones puras (sin red).
 */

export const TIMEZONE = 'America/Bogota'

/** Umbrales vigentes en una fecha (antes del primer registro se usa el primero). */
export function physiologyOn(entries: PhysiologyEntry[], day: string): PhysiologyEntry | null {
  if (entries.length === 0) return null
  const sorted = [...entries].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  let current = sorted[0]
  for (const e of sorted) if (e.effectiveFrom <= day) current = e
  return current
}

export function takesHrMedication(health: HealthRecord[]) {
  return health.some((h) => h.category === 'medication' && h.data.affectsHeartRate)
}

export interface ActivityWithLoad {
  activity: Activity
  day: string
  load: LoadResult
}

export function loadsFor(
  activities: Activity[],
  ctx: { physiology: PhysiologyEntry[]; profile: Profile | null; health: HealthRecord[] },
): ActivityWithLoad[] {
  const med = takesHrMedication(ctx.health)
  return activities.map((a) => {
    const day = localDayKey(a.startTime, a.timezone ?? TIMEZONE)
    const ph = physiologyOn(ctx.physiology, day)
    const hrSource = a.sources.find((s) => s.id === a.hrSourceId) ?? a.sources.find((s) => s.hasHr)
    const p: Physiology = {
      ftpW: ph?.ftpW,
      hrThreshold: ph?.hrThreshold,
      hrMax: ph?.hrMax,
      hrMaxSource: ph?.hrMaxSource,
      hrRest: ph?.hrRest,
      sex: ctx.profile?.sexForFormulas,
      ageYears: ctx.profile?.birthDate ? ageOn(ctx.profile.birthDate, day) : null,
      hrAffectingMedication: med,
    }
    const load = computeLoad(
      {
        sport: a.sport,
        durationS: a.movingS || a.elapsedS,
        hasPower: a.hasPower,
        normalizedPowerW: a.normalizedPowerW,
        avgPowerW: a.avgPowerW,
        hrHistogram: hrSource?.hrHistogram ?? null,
        avgHr: a.avgHr,
        rpe: a.rpe,
      },
      p,
    )
    return { activity: a, day, load }
  })
}

export function fitnessOverview(loaded: ActivityWithLoad[], today: string) {
  const recentFrom = addDays(today, -41)
  const { map } = dailyLoads(loaded.map((l) => ({ day: l.day, load: l.load.load })))
  const series = fitnessSeries(map, today)
  const recent = loaded.filter((l) => l.day >= recentFrom && l.day <= today)
  const missingRecent = recent.filter((l) => l.load.method === 'none').length
  const methods = countBy(recent.map((l) => l.load.method))
  const weeks = weeklyLoads(map).filter((w) => w.week <= today)
  return {
    series,
    snapshot: snapshot(series),
    weeks,
    recentCount: recent.length,
    missingRecent,
    methods,
  }
}

function countBy<T extends string>(xs: T[]) {
  const m: Partial<Record<T, number>> = {}
  for (const x of xs) m[x] = (m[x] ?? 0) + 1
  return m
}

// ---------------------------------------------------------------------------
// Métricas por deporte
// ---------------------------------------------------------------------------

export interface PeriodStats {
  period: string // lunes de la semana (AAAA-MM-DD) o mes (AAAA-MM)
  count: number
  durationS: number
  distanceM: number
  elevationM: number
}

export function volumeBy(loaded: ActivityWithLoad[], sport: Sport, unit: 'week' | 'month', subSport?: SubSport | null) {
  const m = new Map<string, PeriodStats>()
  for (const { activity: a, day } of loaded) {
    if (a.sport !== sport) continue
    if (subSport !== undefined && subSport !== null && a.subSport !== subSport) continue
    const key = unit === 'week' ? weekStart(day) : day.slice(0, 7)
    const s = m.get(key) ?? { period: key, count: 0, durationS: 0, distanceM: 0, elevationM: 0 }
    s.count++
    s.durationS += a.movingS || a.elapsedS
    s.distanceM += a.distanceM ?? 0
    s.elevationM += a.elevationGainM ?? 0
    m.set(key, s)
  }
  return [...m.values()].sort((a, b) => a.period.localeCompare(b.period))
}

export interface SportSummary {
  count: number
  durationS: number
  distanceM: number
  elevationM: number
  /** Velocidad media (m/s) ponderada por tiempo en movimiento */
  avgSpeedMs: number | null
  avgPowerW: number | null
  withPower: number
  avgHr: number | null
}

export function sportSummary(loaded: ActivityWithLoad[], sport: Sport, fromDay: string, subSport?: SubSport | null): SportSummary {
  const xs = loaded
    .filter((l) => l.activity.sport === sport && l.day >= fromDay)
    .filter((l) => subSport === undefined || subSport === null || l.activity.subSport === subSport)
    .map((l) => l.activity)
  const dur = xs.reduce((a, x) => a + (x.movingS || x.elapsedS), 0)
  const withDist = xs.filter((x) => x.distanceM)
  const distDur = withDist.reduce((a, x) => a + (x.movingS || x.elapsedS), 0)
  const dist = withDist.reduce((a, x) => a + (x.distanceM ?? 0), 0)
  const withPower = xs.filter((x) => x.hasPower && x.avgPowerW)
  const pDur = withPower.reduce((a, x) => a + (x.movingS || x.elapsedS), 0)
  const withHr = xs.filter((x) => x.avgHr)
  const hDur = withHr.reduce((a, x) => a + (x.movingS || x.elapsedS), 0)
  return {
    count: xs.length,
    durationS: dur,
    distanceM: xs.reduce((a, x) => a + (x.distanceM ?? 0), 0),
    elevationM: xs.reduce((a, x) => a + (x.elevationGainM ?? 0), 0),
    avgSpeedMs: distDur > 0 ? dist / distDur : null,
    avgPowerW: pDur > 0 ? withPower.reduce((a, x) => a + x.avgPowerW! * (x.movingS || x.elapsedS), 0) / pDur : null,
    withPower: withPower.length,
    avgHr: hDur > 0 ? withHr.reduce((a, x) => a + x.avgHr! * (x.movingS || x.elapsedS), 0) / hDur : null,
  }
}

export function latestWeight(weights: WeightEntry[]) {
  return [...weights].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn)).at(-1)?.weightKg ?? null
}
