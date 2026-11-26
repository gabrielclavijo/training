/**
 * Triatlón: catálogo de distancias, reparto del tiempo objetivo por tramo y
 * duración estimada. Las transiciones no se miden (decisión del producto).
 */

export type TriPreset = 'super_sprint' | 'sprint' | 'olympic' | 'im_5150' | 'im_703' | 'im_full' | 'custom'
export type TriLeg = 'swim' | 'bike' | 'run'
export const TRI_LEGS: TriLeg[] = ['swim', 'bike', 'run']
/** Deporte de cada tramo (como se guardan las actividades) */
export const LEG_SPORT = { swim: 'swimming', bike: 'cycling', run: 'running' } as const

export interface TriLegs {
  swimM: number
  bikeM: number
  runM: number
  /** Objetivos opcionales por tramo, en segundos */
  swimS?: number | null
  bikeS?: number | null
  runS?: number | null
}

export interface TriPresetInfo {
  key: TriPreset
  swimM: number
  bikeM: number
  runM: number
  /** Tiempo de corte típico (segundos); puede variar según la carrera */
  cutoffS: number | null
  ironman: boolean
}

export const TRI_PRESETS: TriPresetInfo[] = [
  { key: 'super_sprint', swimM: 400, bikeM: 10_000, runM: 2_500, cutoffS: null, ironman: false },
  { key: 'sprint', swimM: 750, bikeM: 20_000, runM: 5_000, cutoffS: 2.5 * 3600, ironman: false },
  { key: 'olympic', swimM: 1_500, bikeM: 40_000, runM: 10_000, cutoffS: 4 * 3600, ironman: false },
  { key: 'im_5150', swimM: 1_500, bikeM: 40_000, runM: 10_000, cutoffS: 4 * 3600, ironman: true },
  { key: 'im_703', swimM: 1_900, bikeM: 90_000, runM: 21_100, cutoffS: 8.5 * 3600, ironman: true },
  { key: 'im_full', swimM: 3_800, bikeM: 180_200, runM: 42_200, cutoffS: 17 * 3600, ironman: true },
]

export const presetInfo = (k: TriPreset | null | undefined) => TRI_PRESETS.find((p) => p.key === k) ?? null

/** Velocidades de referencia (km/h) de un triatleta aficionado; más lentas en distancias largas. */
function refSpeeds(totalKm: number) {
  const long = totalKm > 150
  return { swim: long ? 2.7 : 2.85, bike: long ? 26 : 27.7, run: long ? 9.3 : 10.1 }
}

/** Duración de referencia de cada tramo (segundos) solo con las distancias. */
export function referenceLegTimes(l: Pick<TriLegs, 'swimM' | 'bikeM' | 'runM'>) {
  const v = refSpeeds((l.swimM + l.bikeM + l.runM) / 1000)
  return {
    swim: Math.round((l.swimM / 1000 / v.swim) * 3600),
    bike: Math.round((l.bikeM / 1000 / v.bike) * 3600),
    run: Math.round((l.runM / 1000 / v.run) * 3600),
  }
}

/**
 * Reparto sugerido de un tiempo total entre los tres tramos, proporcional a
 * las duraciones de referencia (ej. 70.3 en 6 h → ~40 min / ~3 h 15 / ~2 h 05).
 * Redondea a minutos y respeta los objetivos que la persona ya puso.
 */
export function suggestSplit(l: TriLegs, totalS: number): Record<TriLeg, number> {
  const ref = referenceLegTimes(l)
  const fixed: Partial<Record<TriLeg, number>> = {}
  if (l.swimS) fixed.swim = l.swimS
  if (l.bikeS) fixed.bike = l.bikeS
  if (l.runS) fixed.run = l.runS
  const free = TRI_LEGS.filter((k) => fixed[k] === undefined)
  const left = Math.max(0, totalS - Object.values(fixed).reduce((a, b) => a + (b ?? 0), 0))
  const refFree = free.reduce((a, k) => a + ref[k], 0) || 1
  const out = { ...ref }
  for (const k of TRI_LEGS) out[k] = fixed[k] ?? Math.round((left * (ref[k] / refFree)) / 60) * 60
  // Ajuste del redondeo para que la suma dé exacto el total
  if (free.length) {
    const diff = totalS - TRI_LEGS.reduce((a, k) => a + out[k], 0)
    const k = free.includes('bike') ? 'bike' : free[0]
    out[k] += diff
  }
  return out
}

/** Duración total estimada (horas) sin historial, para el plan y la temporada. */
export function triEstimatedHours(l: Pick<TriLegs, 'swimM' | 'bikeM' | 'runM'>) {
  const r = referenceLegTimes(l)
  return (r.swim + r.bike + r.run) / 3600
}

/** Peso de cada disciplina en la carrera (por tiempo): sirve para repartir el plan. */
export function legShares(l: Pick<TriLegs, 'swimM' | 'bikeM' | 'runM'>): Record<TriLeg, number> {
  const r = referenceLegTimes(l)
  const t = r.swim + r.bike + r.run || 1
  return { swim: r.swim / t, bike: r.bike / t, run: r.run / t }
}

export const totalDistanceM = (l: Pick<TriLegs, 'swimM' | 'bikeM' | 'runM'>) => l.swimM + l.bikeM + l.runM

// ---------------------------------------------------------------------------
// Diagnóstico por disciplina y tiempo estimado por tramo
// ---------------------------------------------------------------------------

export interface LegEffort {
  sport: string
  day: string
  movingS: number
  distanceM: number
}

/** Duración mínima para que una actividad sirva de referencia de ritmo */
const MIN_EFFORT_S = { swimming: 10 * 60, cycling: 45 * 60, running: 20 * 60 } as const

/**
 * Tiempo estimado de un tramo con las actividades de esa disciplina (últimos
 * 120 días, las más largas). La carrera a pie después de la bici es más lenta
 * (≈ 7 %) y nadar en aguas abiertas también (≈ 5 %). Null si hay menos de 2.
 */
export function estimateLeg(args: {
  leg: TriLeg
  distanceM: number
  efforts: LegEffort[]
  today: string
  /** Mejora esperada por la forma ganada (1 = igual) */
  gain?: number
}): { seconds: number; basedOn: number } | null {
  const sport = LEG_SPORT[args.leg]
  const from = new Date(Date.parse(`${args.today}T12:00:00Z`) - 120 * 86_400_000).toISOString().slice(0, 10)
  const recent = args.efforts.filter((e) => e.sport === sport && e.day >= from && e.movingS >= MIN_EFFORT_S[sport] && e.distanceM > 0)
  if (recent.length < 2) return null
  const longest = [...recent].sort((a, b) => b.movingS - a.movingS).slice(0, 5)
  const speeds = longest.map((e) => e.distanceM / e.movingS).sort((a, b) => a - b)
  const median = speeds[Math.floor(speeds.length / 2)]
  const factor = args.leg === 'run' ? 1.07 : args.leg === 'swim' ? 1.05 : 1
  const gain = Math.min(1.08, Math.max(0.92, args.gain ?? 1))
  return { seconds: Math.round((args.distanceM / (median * gain)) * factor), basedOn: longest.length }
}

export type LegStatus = 'on_track' | 'tight' | 'behind' | 'no_data'

export interface LegDiagnosis {
  leg: TriLeg
  /** Forma de la disciplina hoy y la prevista para el evento */
  ctl: number
  projectedCtl: number
  /** Forma recomendada para ese tramo (parte de la general según su peso en la carrera) */
  targetCtl: number
  pct: number
  status: LegStatus
  estimateS: number | null
  targetS: number | null
}

/** Una disciplina «sin datos» si casi no la entrena; si no, según la forma prevista. */
export function legStatus(pct: number, ctl: number): LegStatus {
  if (ctl < 1) return 'no_data'
  return pct >= 100 ? 'on_track' : pct >= 85 ? 'tight' : 'behind'
}
