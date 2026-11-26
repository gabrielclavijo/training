import { addDays, daysBetween, weekStart } from '../dates'

/**
 * Diagnóstico por meta: compara la forma que se puede alcanzar con la que exige
 * la meta, y estima el tiempo cuando hay objetivo de tiempo.
 *
 * Modelo (reglas, sin IA, documentadas en el glosario):
 *  - Carga del evento = horas × intensidad² × 100 (misma escala de la fase 1).
 *    Intensidad según duración y objetivo (terminar vs. hacer un tiempo).
 *  - Forma recomendada (CTL) = carga del evento / factor (4,5 para terminar,
 *    3,5 para hacer tiempo). En etapas pesa además encadenar días.
 *  - Forma alcanzable = la actual + un aumento seguro (≈ 5 pts/semana en semanas
 *    de carga, con 1 de cada 4 de descarga), limitado por el tiempo disponible
 *    y descontando las pausas.
 */

export interface GoalDemandInput {
  sport: string
  goalType: 'single' | 'stage'
  objective: 'finish' | 'time'
  priority: 'primary' | 'secondary'
  eventDate: string
  estimatedHours: number // total del evento (todas las etapas)
  stageDays: number
  targetTimeS: number | null
}

export interface GoalDemand {
  eventLoad: number
  perDayLoad: number
  intensity: number
  targetCtl: number
}

export function eventIntensity(hoursPerDay: number, objective: 'finish' | 'time') {
  const base = hoursPerDay <= 3 ? 0.75 : hoursPerDay <= 6 ? 0.68 : 0.62
  return objective === 'time' ? base + 0.05 : base
}

export function goalDemand(g: GoalDemandInput): GoalDemand {
  const days = Math.max(1, g.stageDays)
  const hours = g.objective === 'time' && g.targetTimeS ? g.targetTimeS / 3600 : g.estimatedHours
  const hoursPerDay = hours / days
  const intensity = eventIntensity(hoursPerDay, g.objective)
  const perDayLoad = hoursPerDay * intensity ** 2 * 100
  const factor = g.objective === 'time' ? 3.5 : 4.5
  const stageBonus = 1 + 0.15 * (days - 1)
  const targetCtl = clamp(Math.round((perDayLoad * stageBonus) / factor), 25, 110)
  return { eventLoad: Math.round(perDayLoad * days), perDayLoad: Math.round(perDayLoad), intensity, targetCtl }
}

export type DiagnosisStatus = 'on_track' | 'tight' | 'behind' | 'past'

export interface Diagnosis {
  status: DiagnosisStatus
  targetCtl: number
  currentCtl: number
  projectedCtl: number
  weeksToEvent: number
  buildWeeks: number
  /** Techo de forma que permite el tiempo disponible */
  availabilityCapCtl: number
  limitedBy: 'time_to_event' | 'availability' | 'pauses' | null
  pauseDays: number
  lowHistory: boolean
  suggestions: ('lower_demand' | 'finish_only' | 'more_time' | 'use_as_training' | 'keep_going')[]
}

export const SAFE_RAMP_PER_WEEK = 5
export const TAPER_DAYS = { primary: 10, secondary: 4 } as const

export function diagnose(args: {
  goal: GoalDemandInput
  today: string
  currentCtl: number
  historyDays: number
  maxWeeklyLoad: number // según la disponibilidad
  pauseDaysBeforeEvent: number
  /** Para metas posteriores: la forma con la que se arranca después de la anterior */
  startCtl?: number
  startDay?: string
}): Diagnosis {
  const { goal, today } = args
  const demand = goalDemand(goal)
  if (goal.eventDate < today) {
    return {
      status: 'past',
      targetCtl: demand.targetCtl,
      currentCtl: args.currentCtl,
      projectedCtl: args.currentCtl,
      weeksToEvent: 0,
      buildWeeks: 0,
      availabilityCapCtl: Math.round(args.maxWeeklyLoad / 7),
      limitedBy: null,
      pauseDays: 0,
      lowHistory: false,
      suggestions: [],
    }
  }
  const from = args.startDay ?? today
  const start = args.startCtl ?? args.currentCtl
  const taper = TAPER_DAYS[goal.priority]
  const buildDays = Math.max(0, daysBetween(from, addDays(goal.eventDate, -taper)) - args.pauseDaysBeforeEvent)
  const buildWeeks = Math.floor(buildDays / 7)
  // 3 semanas de carga + 1 de descarga
  const loadingWeeks = buildWeeks - Math.floor(buildWeeks / 4)
  const byTime = start + loadingWeeks * SAFE_RAMP_PER_WEEK - Math.floor(buildWeeks / 4) * 2
  const availabilityCapCtl = Math.round(args.maxWeeklyLoad / 7)
  // La pausa también hace perder algo de forma (≈ 1 punto por día sin entrenar)
  const projected = Math.max(0, Math.round(Math.min(byTime, Math.max(start, availabilityCapCtl)) - args.pauseDaysBeforeEvent * 0.5))
  let limitedBy: Diagnosis['limitedBy'] = null
  if (projected < demand.targetCtl) {
    limitedBy = availabilityCapCtl < byTime ? 'availability' : args.pauseDaysBeforeEvent > 7 ? 'pauses' : 'time_to_event'
  }
  const ratio = projected / demand.targetCtl
  const status: DiagnosisStatus = ratio >= 1 ? 'on_track' : ratio >= 0.9 ? 'tight' : 'behind'
  const suggestions: Diagnosis['suggestions'] = []
  if (status === 'behind') {
    if (goal.objective === 'time') suggestions.push('finish_only')
    if (limitedBy === 'availability') suggestions.push('more_time')
    if (goal.priority === 'secondary') suggestions.push('use_as_training')
    suggestions.push('lower_demand')
  } else suggestions.push('keep_going')
  return {
    status,
    targetCtl: demand.targetCtl,
    currentCtl: Math.round(args.currentCtl),
    projectedCtl: projected,
    weeksToEvent: Math.floor(daysBetween(today, goal.eventDate) / 7),
    buildWeeks,
    availabilityCapCtl,
    limitedBy,
    pauseDays: args.pauseDaysBeforeEvent,
    lowHistory: args.historyDays < 42,
    suggestions,
  }
}

// ---------------------------------------------------------------------------
// Tiempo estimado
// ---------------------------------------------------------------------------

export interface PastEffort {
  sport: string
  subSport: string | null
  day: string
  movingS: number
  distanceM: number
  elevationM: number
}

export interface StageSpec {
  distanceM: number
  elevationM: number
  terrain: string | null
}

export interface TimeEstimate {
  seconds: number
  rangeS: [number, number]
  basedOn: number // cuántas actividades se usaron
  confidence: 'medium' | 'low'
}

/** Distancia equivalente: cada 100 m de desnivel «valen» 1 km en bici y 0,6 km corriendo. */
const eqKm = (sport: string, m: number, elev: number) => m / 1000 + (elev / 100) * (sport === 'running' ? 0.6 : 1)

const TERRAIN_FACTOR: Record<string, number> = { paved: 1, mixed: 0.93, unpaved: 0.88, technical: 0.75, track: 1, pool: 1, open_water: 0.95 }

export function estimateTime(args: {
  sport: string
  stages: StageSpec[]
  efforts: PastEffort[]
  today: string
  ctlNow: number
  ctlAtEvent: number
}): TimeEstimate | null {
  const recent = args.efforts.filter((e) => e.sport === args.sport && e.movingS >= 3600 && e.distanceM > 0 && daysBetween(e.day, args.today) <= 120)
  if (recent.length < 2) return null
  // Las salidas más largas reflejan mejor el ritmo de un evento largo
  const longest = [...recent].sort((a, b) => b.movingS - a.movingS).slice(0, 5)
  const speeds = longest
    .map((e) => {
      const isRoad = e.subSport === 'road' || e.subSport === null
      const f = isRoad ? 1 : e.subSport === 'gravel' ? TERRAIN_FACTOR.unpaved : e.subSport === 'mtb' ? TERRAIN_FACTOR.technical : 1
      return eqKm(args.sport, e.distanceM, e.elevationM) / (e.movingS / 3600) / f // velocidad «en asfalto»
    })
    .sort((a, b) => a - b)
  const median = speeds[Math.floor(speeds.length / 2)]
  // Mejora por la forma ganada (moderada y con techo de 8 %)
  const gain = args.ctlNow > 0 ? clamp((args.ctlAtEvent / args.ctlNow) ** 0.15, 0.92, 1.08) : 1
  const longestH = longest[0].movingS / 3600
  let total = 0
  args.stages.forEach((st, i) => {
    const terrain = TERRAIN_FACTOR[st.terrain ?? 'paved'] ?? 1
    let h = eqKm(args.sport, st.distanceM, st.elevationM) / (median * gain * terrain)
    if (h > longestH * 1.5) h *= 1.05 // más largo de lo que se ha hecho: se baja el ritmo
    if (i > 0) h *= 1.03 // fatiga acumulada en etapas
    total += h
  })
  const seconds = Math.round(total * 3600)
  return {
    seconds,
    rangeS: [Math.round(seconds * 0.9), Math.round(seconds * 1.1)],
    basedOn: longest.length,
    confidence: recent.length >= 5 ? 'medium' : 'low',
  }
}

export function weeksUntil(today: string, day: string) {
  return Math.floor(daysBetween(weekStart(today), weekStart(day)) / 7)
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
