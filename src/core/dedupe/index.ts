import type { OriginHint, Provider, SourceFormat, Sport, SubSport } from '../activity/types'

/**
 * Detección y fusión de duplicados.
 *
 * La misma salida puede llegar varias veces: el .FIT del reloj, la exportación de
 * Strava, la exportación de Garmin… Se consideran la misma actividad si:
 *   1. Tienen el mismo identificador externo, o el mismo dispositivo (serial) y
 *      empiezan con menos de 60 s de diferencia; o
 *   2. Coinciden el deporte, la hora de inicio (±5 min), la duración (±5 %) y la
 *      distancia (±3 %). Si ninguna tiene distancia (gimnasio), basta con lo demás.
 * Nunca se fusionan los pares que la persona marcó como «No son la misma actividad».
 */

export const TOLERANCE = {
  startS: 5 * 60,
  durationPct: 5,
  distancePct: 3,
  sameDeviceStartS: 60,
} as const

export interface SourceLike {
  id: string
  provider: Provider
  format: SourceFormat
  originHint?: OriginHint | null
  retentionClass?: 'owned' | 'strava_cache'
  sport: Sport
  subSport: SubSport | null
  title: string | null
  startTime: string
  timezone?: string | null
  elapsedS: number
  movingS: number | null
  distanceM: number | null
  elevationGainM: number | null
  avgHr: number | null
  maxHr: number | null
  avgPowerW: number | null
  normalizedPowerW: number | null
  avgCadence: number | null
  hasPower: boolean
  hasHr: boolean
  hasGps: boolean
  hasCadence: boolean
  hrSamples: number
  powerSamples: number
  gpsPoints: number
  deviceSerial: string | null
  externalId: string | null
  rpe: number | null
}

export interface ActivityLike {
  id: string
  sources: SourceLike[]
}

export type MatchedBy = 'device_and_time' | 'tolerance'

export interface MatchDeltas {
  startMin: number
  durationPct: number
  distancePct: number | null
}

export interface MatchResult {
  matchedBy: MatchedBy
  deltas: MatchDeltas
}

const pct = (a: number, b: number) => (Math.max(a, b) === 0 ? 0 : (Math.abs(a - b) / Math.max(a, b)) * 100)
const round1 = (x: number) => Math.round(x * 10) / 10
const hasDistance = (d: number | null) => d !== null && d > 0

export function deltas(a: SourceLike, b: SourceLike): MatchDeltas {
  const startS = Math.abs(Date.parse(a.startTime) - Date.parse(b.startTime)) / 1000
  return {
    startMin: round1(startS / 60),
    durationPct: round1(Math.min(pct(a.elapsedS, b.elapsedS), movingPct(a, b))),
    distancePct: hasDistance(a.distanceM) && hasDistance(b.distanceM) ? round1(pct(a.distanceM!, b.distanceM!)) : null,
  }
}

// Algunas fuentes guardan el tiempo total y otras solo el de movimiento: si los
// tiempos en movimiento coinciden, también cuenta como duración igual.
function movingPct(a: SourceLike, b: SourceLike) {
  return a.movingS && b.movingS ? pct(a.movingS, b.movingS) : Infinity
}

/** ¿Son la misma actividad? Devuelve cómo coincidieron o null. */
export function compareSources(a: SourceLike, b: SourceLike): MatchResult | null {
  const d = deltas(a, b)
  if (a.externalId && a.externalId === b.externalId) return { matchedBy: 'device_and_time', deltas: d }
  if (a.deviceSerial && a.deviceSerial === b.deviceSerial && d.startMin * 60 <= TOLERANCE.sameDeviceStartS) {
    return { matchedBy: 'device_and_time', deltas: d }
  }
  if (a.sport !== b.sport) return null
  if (d.startMin * 60 > TOLERANCE.startS) return null
  if (d.durationPct > TOLERANCE.durationPct) return null
  const aHas = hasDistance(a.distanceM)
  const bHas = hasDistance(b.distanceM)
  if (aHas !== bHas) return null // una con distancia y otra sin ella: mejor no adivinar
  if (d.distancePct !== null && d.distancePct > TOLERANCE.distancePct) return null
  return { matchedBy: 'tolerance', deltas: d }
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * Busca, entre las actividades existentes, la que corresponde a una fuente nueva.
 * Si varias coinciden, elige la más cercana (dispositivo > hora > duración).
 */
export function findDuplicate(
  candidate: SourceLike,
  activities: ActivityLike[],
  notDuplicatePairs: Set<string> = new Set(),
): (MatchResult & { activityId: string }) | null {
  let best: (MatchResult & { activityId: string; score: number }) | null = null
  for (const act of activities) {
    if (act.sources.some((s) => notDuplicatePairs.has(pairKey(s.id, candidate.id)))) continue
    for (const s of act.sources) {
      if (s.id === candidate.id) continue
      const m = compareSources(candidate, s)
      if (!m) continue
      const score =
        (m.matchedBy === 'device_and_time' ? 0 : 1000) + m.deltas.startMin * 10 + m.deltas.durationPct + (m.deltas.distancePct ?? 0)
      if (!best || score < best.score) best = { ...m, activityId: act.id, score }
    }
  }
  if (!best) return null
  const { score: _score, ...rest } = best
  void _score
  return rest
}

// ---------------------------------------------------------------------------
// Fusión: una sola actividad con la mejor versión de cada dato
// ---------------------------------------------------------------------------

export interface MergedActivity {
  sport: Sport
  subSport: SubSport | null
  title: string | null
  startTime: string
  timezone: string | null
  elapsedS: number
  movingS: number | null
  distanceM: number | null
  elevationGainM: number | null
  avgHr: number | null
  maxHr: number | null
  avgPowerW: number | null
  normalizedPowerW: number | null
  avgCadence: number | null
  avgSpeedMs: number | null
  hasPower: boolean
  hasHr: boolean
  hasGps: boolean
  hasCadence: boolean
  rpe: number | null
  primarySourceId: string
  powerSourceId: string | null
  hrSourceId: string | null
  gpsSourceId: string | null
  cadenceSourceId: string | null
}

const FORMAT_RANK: Record<SourceFormat, number> = { fit: 5, garmin_api: 4, tcx: 3, gpx: 2, strava_api: 1, manual: 0 }

/** Lo propio (archivos) va antes que lo de Strava API, que se borra a los 7 días. */
const owned = (s: SourceLike) => (s.retentionClass ?? 'owned') === 'owned'

function bestBy(sources: SourceLike[], has: (s: SourceLike) => boolean, amount: (s: SourceLike) => number) {
  return (
    sources
      .filter(has)
      .sort((a, b) => Number(owned(b)) - Number(owned(a)) || amount(b) - amount(a) || FORMAT_RANK[b.format] - FORMAT_RANK[a.format])[0] ??
    null
  )
}

export function mergeSources(sources: SourceLike[]): MergedActivity {
  if (sources.length === 0) throw new Error('mergeSources necesita al menos una fuente')
  const primary = [...sources].sort(
    (a, b) =>
      Number(owned(b)) - Number(owned(a)) ||
      FORMAT_RANK[b.format] - FORMAT_RANK[a.format] ||
      b.hrSamples + b.powerSamples + b.gpsPoints - (a.hrSamples + a.powerSamples + a.gpsPoints),
  )[0]
  const power = bestBy(sources, (s) => s.hasPower, (s) => s.powerSamples)
  const hr = bestBy(sources, (s) => s.hasHr, (s) => s.hrSamples)
  const gps = bestBy(sources, (s) => s.hasGps, (s) => s.gpsPoints)
  const cadence = bestBy(sources, (s) => s.hasCadence, () => 1)

  // Modalidad y nombre: la exportación de Strava suele traer lo que la persona
  // eligió a mano (ej. "Gravel Ride" y un título propio).
  // Se prefiere lo propio: lo que viene de la API de Strava se borra a los 7 días
  const labeled =
    sources.find((s) => owned(s) && s.originHint === 'strava_export' && s.subSport) ??
    sources.find((s) => owned(s) && s.subSport) ??
    sources.find((s) => s.subSport)
  const titled =
    sources.find((s) => owned(s) && s.originHint === 'strava_export' && s.title) ??
    sources.find((s) => owned(s) && s.title) ??
    sources.find((s) => s.title)
  const distanceM = primary.distanceM ?? sources.find((s) => hasDistance(s.distanceM))?.distanceM ?? null
  const movingS = primary.movingS ?? sources.find((s) => s.movingS)?.movingS ?? null
  const dur = movingS || primary.elapsedS

  return {
    sport: primary.sport,
    subSport: labeled?.sport === primary.sport ? labeled.subSport : primary.subSport,
    title: titled?.title ?? null,
    startTime: primary.startTime,
    timezone: primary.timezone ?? sources.find((s) => s.timezone)?.timezone ?? null,
    elapsedS: primary.elapsedS,
    movingS,
    distanceM,
    elevationGainM: primary.elevationGainM ?? sources.find((s) => s.elevationGainM !== null)?.elevationGainM ?? null,
    avgHr: hr?.avgHr ?? null,
    maxHr: hr?.maxHr ?? null,
    avgPowerW: power?.avgPowerW ?? null,
    normalizedPowerW: power?.normalizedPowerW ?? null,
    avgCadence: cadence?.avgCadence ?? null,
    avgSpeedMs: distanceM && dur ? Math.round((distanceM / dur) * 1000) / 1000 : null,
    hasPower: Boolean(power),
    hasHr: Boolean(hr),
    hasGps: Boolean(gps),
    hasCadence: Boolean(cadence),
    rpe: sources.find((s) => s.rpe !== null)?.rpe ?? null,
    primarySourceId: primary.id,
    powerSourceId: power?.id ?? null,
    hrSourceId: hr?.id ?? null,
    gpsSourceId: gps?.id ?? null,
    cadenceSourceId: cadence?.id ?? null,
  }
}

/**
 * «No son la misma actividad»: separa una fuente. Devuelve cómo quedan las dos
 * actividades y el par que hay que recordar para no volver a fusionarlas.
 */
export function splitSource(activity: ActivityLike, sourceId: string) {
  const detached = activity.sources.find((s) => s.id === sourceId)
  if (!detached) throw new Error('La fuente no pertenece a la actividad')
  const remaining = activity.sources.filter((s) => s.id !== sourceId)
  if (remaining.length === 0) throw new Error('No se puede separar la única fuente')
  return {
    remaining: mergeSources(remaining),
    detached: mergeSources([detached]),
    notDuplicatePairs: remaining.map((s) => pairKey(s.id, sourceId)),
  }
}
