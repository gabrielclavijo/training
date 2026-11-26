/**
 * Plan de alimentación para el día de la carrera (por fórmulas, sin IA).
 * Referencias de nutrición deportiva (consenso habitual):
 *  - Carga de carbohidratos 1-2 días antes si la prueba dura 90 min o más: 8-10 g/kg/día.
 *  - Desayuno 3 h antes: ~2 g/kg de carbohidratos y ~6 ml/kg de líquido.
 *  - Durante: < 45 min nada; 45-75 min poco (≤ 30 g/h); hasta 2,5 h 30-60 g/h; más largo 60-90 g/h.
 *    Líquido 400-800 ml/h (600-1000 con calor). Sodio 300-600 mg/h si dura más de 2 h o hace calor.
 *  - Corriendo el estómago tolera menos: ~80 % de lo de la bici.
 *  - Después: ~0,3 g/kg de proteína y ~1 g/kg de carbohidratos en la primera hora.
 * Es orientativo; no reemplaza a un nutricionista.
 */

export type RaceSport = 'swimming' | 'cycling' | 'running' | 'other'

export interface RaceSegment {
  sport: RaceSport
  minutes: number
}

export interface SegmentFuel {
  sport: RaceSport
  minutes: number
  carbsPerHour: [number, number]
  fluidMlPerHour: [number, number]
  sodiumMgPerHour: [number, number] | null
  /** Totales del tramo (con el punto medio de los rangos) */
  carbsG: number
  gels: number
  fluidMl: number
  bottles: number
  /** Algo que conviene recordar en ese tramo */
  tip: 'swim_nothing' | 'bike_eat_most' | 'run_gels_aid' | 'short_none' | 'steady'
}

export interface RaceFuelPlan {
  totalMinutes: number
  carbLoading: { fromG: number; toG: number } | null
  breakfast: { carbsG: number; fluidMl: number; hoursBefore: number }
  segments: SegmentFuel[]
  after: { proteinG: number; carbsG: number }
  totals: { carbsG: number; gels: number; fluidMl: number; bottles: number; sodiumMg: number }
}

export const GEL_CARBS_G = 25
export const BOTTLE_ML = 750

const round5 = (x: number) => Math.round(x / 5) * 5
const mid = (r: [number, number]) => (r[0] + r[1]) / 2

/** Carbohidratos por hora según cuánto dura toda la prueba. */
export function carbsRate(totalMinutes: number): [number, number] {
  if (totalMinutes < 45) return [0, 0]
  if (totalMinutes < 75) return [0, 30]
  if (totalMinutes <= 150) return [30, 60]
  return [60, 90]
}

export function raceFuelPlan(args: { segments: RaceSegment[]; weightKg: number; hot?: boolean }): RaceFuelPlan {
  const w = args.weightKg
  const total = args.segments.reduce((a, s) => a + s.minutes, 0)
  const base = carbsRate(total)
  const long = total > 120
  const segments: SegmentFuel[] = args.segments.map((s) => {
    const h = s.minutes / 60
    if (s.sport === 'swimming') {
      return {
        sport: s.sport,
        minutes: s.minutes,
        carbsPerHour: [0, 0],
        fluidMlPerHour: [0, 0],
        sodiumMgPerHour: null,
        carbsG: 0,
        gels: 0,
        fluidMl: 0,
        bottles: 0,
        tip: 'swim_nothing',
      }
    }
    const carbs: [number, number] = s.sport === 'running' && args.segments.length > 1 ? [Math.round(base[0] * 0.8), Math.round(base[1] * 0.8)] : base
    const fluid: [number, number] = s.minutes < 45 ? [0, 0] : args.hot ? [600, 1000] : [400, 800]
    const sodium: [number, number] | null = (long || args.hot) && s.minutes >= 45 ? [300, 600] : null
    const carbsG = round5(mid(carbs) * h)
    const fluidMl = round5(mid(fluid) * h)
    const tip: SegmentFuel['tip'] =
      total < 45
        ? 'short_none'
        : s.sport === 'cycling' && args.segments.length > 1
          ? 'bike_eat_most'
          : s.sport === 'running' && long
            ? 'run_gels_aid'
            : 'steady'
    return {
      sport: s.sport,
      minutes: s.minutes,
      carbsPerHour: carbs,
      fluidMlPerHour: fluid,
      sodiumMgPerHour: sodium,
      carbsG,
      gels: Math.ceil(carbsG / GEL_CARBS_G),
      fluidMl,
      bottles: Math.round((fluidMl / BOTTLE_ML) * 2) / 2,
      tip,
    }
  })
  const sodiumMg = segments.reduce((a, s) => a + (s.sodiumMgPerHour ? mid(s.sodiumMgPerHour) * (s.minutes / 60) : 0), 0)
  return {
    totalMinutes: total,
    carbLoading: total >= 90 ? { fromG: round5(8 * w), toG: round5(10 * w) } : null,
    breakfast: { carbsG: round5(2 * w), fluidMl: round5(6 * w), hoursBefore: 3 },
    segments,
    after: { proteinG: round5(0.3 * w), carbsG: round5(1 * w) },
    totals: {
      carbsG: segments.reduce((a, s) => a + s.carbsG, 0),
      gels: segments.reduce((a, s) => a + s.gels, 0),
      fluidMl: segments.reduce((a, s) => a + s.fluidMl, 0),
      bottles: segments.reduce((a, s) => a + s.bottles, 0),
      sodiumMg: round5(sodiumMg / 10) * 10,
    },
  }
}
