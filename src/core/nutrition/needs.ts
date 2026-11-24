import type { SessionKind, Sport } from '../planner/plan'

/**
 * Necesidades del día con fórmulas conocidas (sin IA):
 *  - Gasto en reposo: Mifflin-St Jeor.
 *  - Vida diaria: ×1,4 (trabajo de escritorio con algo de movimiento).
 *  - Entrenamiento: MET de la sesión planeada × peso × horas (menos el reposo ya contado).
 *  - Macronutrientes por kg de peso, con los carbohidratos según la carga del día
 *    (recomendaciones de nutrición deportiva: 3-5 g/kg días suaves, 6-10 g/kg días largos).
 * Todo es orientativo.
 */

export type NutritionGoal = 'maintain' | 'lose' | 'gain' | 'perform'

export interface PersonData {
  weightKg: number
  heightCm: number
  ageYears: number
  sex: 'female' | 'male'
}

export interface DaySession {
  sport: Sport
  kind: SessionKind
  durationMin: number
}

export type DayType = 'rest' | 'light' | 'moderate' | 'hard' | 'long'

export interface DayNeeds {
  dayType: DayType
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  trainingKcal: number
}

export interface Fueling {
  before: { carbsFromG: number; carbsToG: number; hoursBefore: string } | null
  during: { carbsPerHourFrom: number; carbsPerHourTo: number; fluidMlPerHourFrom: number; fluidMlPerHourTo: number; sodium: boolean } | null
  after: { proteinG: number; carbsG: number } | null
}

/** MET aproximados por deporte y tipo de sesión (Compendio de Actividades Físicas). */
const MET: Record<Sport, Partial<Record<SessionKind, number>> & { default: number }> = {
  cycling: { recovery: 4, easy: 6.8, long: 6.8, tempo: 8.5, climb: 9.5, threshold: 10, vo2: 11, openers: 6, event: 8.5, default: 7 },
  running: { recovery: 7, easy: 9, long: 9, tempo: 10.5, climb: 10.5, threshold: 11.5, vo2: 12.5, openers: 8, event: 10.5, default: 9 },
  swimming: { recovery: 5, easy: 6, long: 6, tempo: 8, threshold: 9.5, vo2: 10, openers: 6, event: 8, default: 7 },
  strength: { default: 5 },
  other: { default: 6 },
}

const QUALITY: SessionKind[] = ['tempo', 'threshold', 'vo2', 'climb', 'event']

export function restingKcal(p: PersonData) {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.ageYears + (p.sex === 'male' ? 5 : -161)
}

export function sessionKcal(s: DaySession, weightKg: number) {
  if (s.kind === 'rest' || s.durationMin <= 0) return 0
  const met = MET[s.sport][s.kind] ?? MET[s.sport].default
  return Math.max(0, met - 1) * weightKg * (s.durationMin / 60)
}

export function dayType(sessions: DaySession[]): DayType {
  const active = sessions.filter((s) => s.kind !== 'rest' && s.durationMin > 0)
  if (active.length === 0) return 'rest'
  const minutes = active.reduce((a, s) => a + s.durationMin, 0)
  const quality = active.some((s) => QUALITY.includes(s.kind))
  if (minutes >= 150 || active.some((s) => s.kind === 'event' && s.durationMin >= 120)) return 'long'
  if (quality && minutes >= 45) return 'hard'
  if (minutes >= 60) return 'moderate'
  return 'light'
}

// Carbohidratos (g/kg) por tipo de día
const CARBS: Record<DayType, number> = { rest: 3, light: 4, moderate: 5.5, hard: 6.5, long: 8 }

const round10 = (x: number) => Math.round(x / 10) * 10
const round5 = (x: number) => Math.round(x / 5) * 5

export function dailyNeeds(p: PersonData, sessions: DaySession[], goal: NutritionGoal): DayNeeds {
  const type = dayType(sessions)
  const trainingKcal = sessions.reduce((a, s) => a + sessionKcal(s, p.weightKg), 0)
  let energy = restingKcal(p) * 1.4 + trainingKcal
  // Para bajar de peso, el déficit va en los días suaves; los días largos no se recortan
  if (goal === 'lose') energy *= { rest: 0.82, light: 0.85, moderate: 0.9, hard: 0.95, long: 1 }[type]
  if (goal === 'gain') energy *= 1.1

  const proteinPerKg = goal === 'lose' ? 2 : goal === 'gain' ? 1.8 : 1.6
  const carbsPerKg = Math.max(3, CARBS[type] - (goal === 'lose' && type !== 'long' ? 1 : 0))
  const proteinG = p.weightKg * proteinPerKg
  let carbsG = p.weightKg * carbsPerKg
  // La grasa completa la energía, dentro de 0,8-1,5 g/kg; si aún falta energía, más carbohidratos (hasta 12 g/kg)
  const fatG = Math.min(1.5 * p.weightKg, Math.max(0.8 * p.weightKg, (energy - 4 * proteinG - 4 * carbsG) / 9))
  const missing = energy - (4 * proteinG + 4 * carbsG + 9 * fatG)
  if (missing > 0) carbsG = Math.min(12 * p.weightKg, carbsG + missing / 4)
  const kcal = 4 * proteinG + 4 * carbsG + 9 * fatG
  return {
    dayType: type,
    kcal: round10(kcal),
    proteinG: round5(proteinG),
    carbsG: round5(carbsG),
    fatG: round5(fatG),
    trainingKcal: round10(trainingKcal),
  }
}

/** Qué comer y tomar alrededor de una sesión. */
export function sessionFueling(s: DaySession, weightKg: number): Fueling {
  const quality = QUALITY.includes(s.kind)
  if (s.kind === 'rest' || s.durationMin <= 0) return { before: null, during: null, after: null }
  const hard = s.durationMin >= 60 || quality
  const before = hard ? { carbsFromG: round5(weightKg * 1), carbsToG: round5(weightKg * 2), hoursBefore: '2-3' } : null
  let during: Fueling['during'] = null
  if (s.sport !== 'strength' && s.durationMin >= 60) {
    const [from, to] = s.durationMin >= 150 ? [60, 90] : s.durationMin >= 90 ? [30, 60] : [0, 30]
    during = { carbsPerHourFrom: from, carbsPerHourTo: to, fluidMlPerHourFrom: 400, fluidMlPerHourTo: 800, sodium: s.durationMin >= 120 }
  }
  const after = hard || s.sport === 'strength' ? { proteinG: round5(weightKg * 0.3), carbsG: s.sport === 'strength' ? 0 : round5(weightKg * 1) } : null
  return { before, during, after }
}

export type MissingPersonData = 'weight' | 'height' | 'birthDate' | 'sex'
