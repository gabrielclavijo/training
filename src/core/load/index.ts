import type { Sport } from '../activity/types'

/**
 * Carga de un entrenamiento, con el mejor dato disponible.
 *
 * Todas las cargas se expresan en la misma escala para poder sumarse entre
 * deportes: 1 hora al umbral ≈ 100 puntos (la escala del TSS).
 *
 *   1. power_tss  Potencia + FTP (solo ciclismo)                  confianza alta
 *   2. hr_tss     Pulso + umbral de FC                             confianza media
 *   3. trimp      Pulso + FC máxima + FC en reposo (Banister)       media; baja si la FC máx. es estimada
 *   4. rpe        Duración × esfuerzo percibido (1–10)             confianza baja
 *   5. none       Sin datos: no inventamos un número
 *
 * Ajustes:
 *   - Medicamentos que alteran el pulso (betabloqueantes): los métodos por pulso
 *     bajan a confianza baja y, si hay esfuerzo percibido, se usa ese.
 *   - Natación: el pulso de muñeca en el agua es poco confiable; si hay esfuerzo
 *     percibido se prefiere, y si no, el pulso queda con confianza baja.
 *   - Gimnasio: el pulso subestima el esfuerzo; se prefiere el esfuerzo percibido.
 */

export type LoadMethod = 'power_tss' | 'hr_tss' | 'trimp' | 'rpe' | 'none'
export type Confidence = 'high' | 'medium' | 'low'

/** Claves i18n de sugerencias para mejorar el cálculo (load.hints.*). */
export type LoadHint =
  | 'add_ftp'
  | 'add_hr_threshold'
  | 'add_hr_rest'
  | 'add_rpe'
  | 'measure_hr_max'
  | 'hr_medication'
  | 'swim_wrist_hr'

export interface LoadInput {
  sport: Sport
  durationS: number // tiempo en movimiento si existe; si no, total
  hasPower: boolean
  normalizedPowerW: number | null
  avgPowerW: number | null
  hrHistogram: [number, number][] | null
  avgHr: number | null
  rpe: number | null
}

export interface Physiology {
  ftpW?: number | null
  hrThreshold?: number | null
  hrMax?: number | null
  hrMaxSource?: 'measured' | 'estimated' | null
  hrRest?: number | null
  sex?: 'female' | 'male' | null
  ageYears?: number | null
  hrAffectingMedication?: boolean
}

export interface LoadResult {
  method: LoadMethod
  load: number | null
  confidence: Confidence | null
  inputs: Record<string, number | string | boolean | null>
  hints: LoadHint[]
}

/** Intensidad (fracción de la reserva de pulso) que se asume como umbral para escalar el TRIMP. */
export const TRIMP_THRESHOLD_FRACTION = 0.85
/** Con esta constante, 1 h a RPE 7 (difícil pero sostenible) ≈ 100 puntos. */
export const RPE_FACTOR = 60 * 7 / 100

const round1 = (x: number) => Math.round(x * 10) / 10

/** FC máxima estimada por edad (Tanaka: 208 − 0,7 × edad). */
export function estimateHrMax(ageYears: number) {
  return Math.round(208 - 0.7 * ageYears)
}

export function powerTss(durationS: number, npW: number, ftpW: number) {
  const intensity = npW / ftpW
  return (durationS * npW * intensity) / (ftpW * 3600) * 100
}

/** hrTSS: cada segundo cuenta (FC / umbral)² — 1 h justo al umbral = 100. */
export function hrTss(histogram: [number, number][], hrThreshold: number) {
  let load = 0
  for (const [bpm, secs] of histogram) load += (secs / 3600) * (bpm / hrThreshold) ** 2 * 100
  return load
}

/** TRIMP de Banister escalado a la misma escala (1 h a la intensidad umbral = 100). */
export function trimpLoad(histogram: [number, number][], hrRest: number, hrMax: number, sex?: 'female' | 'male' | null) {
  const b = sex === 'female' ? 1.67 : sex === 'male' ? 1.92 : 1.8
  const trimp = (x: number, minutes: number) => minutes * x * 0.64 * Math.exp(b * x)
  let total = 0
  for (const [bpm, secs] of histogram) {
    const x = Math.min(1, Math.max(0, (bpm - hrRest) / (hrMax - hrRest)))
    total += trimp(x, secs / 60)
  }
  return (total / trimp(TRIMP_THRESHOLD_FRACTION, 60)) * 100
}

export function rpeLoad(durationS: number, rpe: number) {
  return (durationS / 60) * rpe / RPE_FACTOR
}

function histogramFrom(input: LoadInput): [number, number][] | null {
  if (input.hrHistogram && input.hrHistogram.length > 0) return input.hrHistogram
  // Sin histograma (ej. actividad manual con pulso promedio): aproximación con el promedio
  if (input.avgHr) return [[input.avgHr, input.durationS]]
  return null
}

export function computeLoad(input: LoadInput, p: Physiology = {}): LoadResult {
  const hints: LoadHint[] = []
  const dur = Math.max(0, input.durationS)
  const hasRpe = input.rpe !== null && input.rpe >= 1 && input.rpe <= 10
  const hist = histogramFrom(input)
  const hasHr = hist !== null
  const med = Boolean(p.hrAffectingMedication)

  // 1. Potencia (ciclismo)
  const np = input.normalizedPowerW ?? input.avgPowerW
  if (input.sport === 'cycling' && input.hasPower && np) {
    if (p.ftpW) {
      return {
        method: 'power_tss',
        load: round1(powerTss(dur, np, p.ftpW)),
        confidence: 'high',
        inputs: { durationS: dur, normalizedPowerW: np, ftpW: p.ftpW },
        hints: [],
      }
    }
    hints.push('add_ftp')
  }

  // Casos en que el esfuerzo percibido es mejor que el pulso
  const preferRpe = hasRpe && (med || input.sport === 'swimming' || input.sport === 'strength')
  if (preferRpe) {
    if (med) hints.push('hr_medication')
    if (input.sport === 'swimming' && hasHr) hints.push('swim_wrist_hr')
    return rpeResult(dur, input.rpe!, hints)
  }

  // 2 y 3. Pulso
  if (hist) {
    const lowerConfidence = med || input.sport === 'swimming' || input.sport === 'strength'
    if (med) hints.push('hr_medication')
    if (input.sport === 'swimming') hints.push('swim_wrist_hr')
    if (input.sport === 'strength' || input.sport === 'swimming') hints.push('add_rpe')

    if (p.hrThreshold) {
      return {
        method: 'hr_tss',
        load: round1(hrTss(hist, p.hrThreshold)),
        confidence: lowerConfidence ? 'low' : 'medium',
        inputs: { durationS: dur, hrThreshold: p.hrThreshold, avgHr: input.avgHr },
        hints: unique(hints),
      }
    }
    hints.push('add_hr_threshold')

    let hrMax = p.hrMax ?? null
    let hrMaxEstimated = p.hrMaxSource === 'estimated'
    if (!hrMax && p.ageYears) {
      hrMax = estimateHrMax(p.ageYears)
      hrMaxEstimated = true
    }
    if (hrMax && p.hrRest && hrMax > p.hrRest) {
      if (hrMaxEstimated) hints.push('measure_hr_max')
      return {
        method: 'trimp',
        load: round1(trimpLoad(hist, p.hrRest, hrMax, p.sex)),
        confidence: lowerConfidence || hrMaxEstimated ? 'low' : 'medium',
        inputs: { durationS: dur, hrRest: p.hrRest, hrMax, hrMaxEstimated, avgHr: input.avgHr },
        hints: unique(hints),
      }
    }
    if (!p.hrRest) hints.push('add_hr_rest')
  }

  // 4. Esfuerzo percibido
  if (hasRpe) return rpeResult(dur, input.rpe!, hints)

  // 5. Nada con qué calcular
  hints.push('add_rpe')
  return { method: 'none', load: null, confidence: null, inputs: { durationS: dur }, hints: unique(hints) }
}

function rpeResult(dur: number, rpe: number, hints: LoadHint[]): LoadResult {
  return {
    method: 'rpe',
    load: round1(rpeLoad(dur, rpe)),
    confidence: 'low',
    inputs: { durationS: dur, rpe },
    hints: unique(hints),
  }
}

const unique = <T,>(xs: T[]) => [...new Set(xs)]
