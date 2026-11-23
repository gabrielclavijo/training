import { addDays, daysBetween, weekStart } from '../dates'

/**
 * Forma física a partir de la carga diaria (modelo de impulso-respuesta):
 *   CTL (forma crónica / fitness): promedio exponencial de ~42 días
 *   ATL (fatiga aguda):            promedio exponencial de ~7 días
 *   TSB (estado de forma):         CTL − ATL
 *   Rampa:                         cuánto subió la CTL en los últimos 7 días
 */
export const CTL_DAYS = 42
export const ATL_DAYS = 7

export interface DailyPoint {
  day: string // AAAA-MM-DD (hora local de la persona)
  load: number
  ctl: number
  atl: number
  tsb: number
}

export interface LoadedActivity {
  day: string
  load: number | null // null = no se pudo calcular
}

/** Suma la carga por día. Las actividades sin carga se cuentan aparte. */
export function dailyLoads(activities: LoadedActivity[]) {
  const map = new Map<string, number>()
  let missing = 0
  for (const a of activities) {
    if (a.load === null) {
      missing++
      continue
    }
    map.set(a.day, (map.get(a.day) ?? 0) + a.load)
  }
  return { map, missing }
}

/** Serie diaria de CTL/ATL/TSB desde el primer día con datos hasta `untilDay`. */
export function fitnessSeries(loadsByDay: Map<string, number>, untilDay: string): DailyPoint[] {
  const days = [...loadsByDay.keys()].sort()
  if (days.length === 0) return []
  const kCtl = 1 - Math.exp(-1 / CTL_DAYS)
  const kAtl = 1 - Math.exp(-1 / ATL_DAYS)
  const out: DailyPoint[] = []
  let ctl = 0
  let atl = 0
  const total = daysBetween(days[0], untilDay)
  for (let i = 0; i <= total; i++) {
    const day = addDays(days[0], i)
    const load = loadsByDay.get(day) ?? 0
    ctl += (load - ctl) * kCtl
    atl += (load - atl) * kAtl
    out.push({ day, load, ctl: round1(ctl), atl: round1(atl), tsb: round1(ctl - atl) })
  }
  return out
}

export interface FitnessSnapshot {
  day: string
  ctl: number
  atl: number
  tsb: number
  /** Cambio de CTL en 7 días (puntos por semana). */
  rampPerWeek: number
  /** Días de historial: con menos de 42 la forma crónica todavía está "llenándose". */
  historyDays: number
  warming: boolean
}

export function snapshot(series: DailyPoint[]): FitnessSnapshot | null {
  if (series.length === 0) return null
  const last = series[series.length - 1]
  const weekAgo = series[series.length - 8]
  return {
    day: last.day,
    ctl: last.ctl,
    atl: last.atl,
    tsb: last.tsb,
    rampPerWeek: round1(last.ctl - (weekAgo?.ctl ?? 0)),
    historyDays: series.length,
    warming: series.length < CTL_DAYS,
  }
}

export interface WeekLoad {
  week: string // lunes AAAA-MM-DD
  load: number
}

/** Carga por semana (lunes a domingo) y cambio porcentual frente a la anterior. */
export function weeklyLoads(loadsByDay: Map<string, number>): (WeekLoad & { changePct: number | null })[] {
  const weeks = new Map<string, number>()
  for (const [day, load] of loadsByDay) {
    const w = weekStart(day)
    weeks.set(w, (weeks.get(w) ?? 0) + load)
  }
  const keys = [...weeks.keys()].sort()
  if (keys.length === 0) return []
  // Rellena semanas sin entrenamiento con 0
  const all: string[] = []
  for (let w = keys[0]; w <= keys[keys.length - 1]; w = addDays(w, 7)) all.push(w)
  return all.map((w, i) => {
    const load = round1(weeks.get(w) ?? 0)
    const prev = i > 0 ? weeks.get(all[i - 1]) ?? 0 : null
    return { week: w, load, changePct: prev ? round1(((load - prev) / prev) * 100) : null }
  })
}

const round1 = (x: number) => Math.round(x * 10) / 10
