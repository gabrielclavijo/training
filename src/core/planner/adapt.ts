import { addDays, daysBetween } from '../dates'
import type { Sport, WeekDraft } from './plan'

/**
 * Ajuste automático: compara lo planeado con lo que de verdad se entrenó.
 * El estado de cada sesión se calcula al vuelo (no se guarda), así no quedan
 * cálculos derivados de datos de Strava más allá de sus 7 días.
 */

export type SessionStatus = 'pending' | 'done' | 'partial' | 'harder' | 'missed' | 'rest'

export interface PlannedLike {
  id: string
  date: string
  sport: Sport
  kind: string
  durationMin: number
  plannedLoad: number
}

export interface DoneLike {
  id: string
  day: string
  sport: Sport
  durationS: number
  load: number | null
  plannedSessionId?: string | null
}

export interface MatchResult {
  activityId: string | null
  status: SessionStatus
  ratio: number | null
}

/** Empareja sesiones planeadas con actividades (mismo día y deporte; si no, ±1 día). */
export function matchSessions(sessions: PlannedLike[], activities: DoneLike[], today: string): Map<string, MatchResult> {
  const used = new Set<string>()
  const out = new Map<string, MatchResult>()
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date))
  // 1. Enlaces explícitos
  for (const s of sorted) {
    const a = activities.find((x) => x.plannedSessionId === s.id)
    if (a) {
      used.add(a.id)
      out.set(s.id, evaluate(s, a))
    }
  }
  // 2. Mismo día y deporte; 3. día vecino
  for (const pass of [0, 1]) {
    for (const s of sorted) {
      if (out.has(s.id) || s.kind === 'rest') continue
      const cands = activities.filter((a) => !used.has(a.id) && sameSport(a.sport, s.sport) && Math.abs(daysBetween(s.date, a.day)) === pass)
      if (!cands.length) continue
      const best = cands.sort((x, y) => Math.abs(x.durationS / 60 - s.durationMin) - Math.abs(y.durationS / 60 - s.durationMin))[0]
      used.add(best.id)
      out.set(s.id, evaluate(s, best))
    }
  }
  for (const s of sorted) {
    if (out.has(s.id)) continue
    if (s.kind === 'rest') out.set(s.id, { activityId: null, status: 'rest', ratio: null })
    else out.set(s.id, { activityId: null, status: s.date < today ? 'missed' : 'pending', ratio: null })
  }
  return out
}

const sameSport = (a: Sport, b: Sport) => a === b

function evaluate(s: PlannedLike, a: DoneLike): MatchResult {
  // Con carga se compara la carga; si no, la duración
  const ratio = a.load !== null && s.plannedLoad > 0 ? a.load / s.plannedLoad : s.durationMin > 0 ? a.durationS / 60 / s.durationMin : 1
  const status: SessionStatus = ratio < 0.75 ? 'partial' : ratio > 1.25 ? 'harder' : 'done'
  return { activityId: a.id, status, ratio: Math.round(ratio * 100) / 100 }
}

export type AdjustReason = 'overreached' | 'missed_sessions' | 'harder_than_planned' | 'on_plan'

export interface Adjustment {
  weekFactor: number
  easyDays: number
  reasons: AdjustReason[]
  params: Record<string, number>
}

/** Decide el ajuste a partir de los últimos 7 días. */
export function decideAdjustment(args: {
  today: string
  sessions: PlannedLike[]
  matches: Map<string, MatchResult>
  actualLoadLast7: number
  tsb: number | null
}): Adjustment {
  const from = addDays(args.today, -7)
  const last = args.sessions.filter((s) => s.date >= from && s.date < args.today && s.kind !== 'rest')
  const planned7 = last.reduce((s, x) => s + x.plannedLoad, 0)
  const missed = last.filter((s) => args.matches.get(s.id)?.status === 'missed').length
  const harder = last.filter((s) => args.matches.get(s.id)?.status === 'harder').length
  const reasons: AdjustReason[] = []
  let weekFactor = 1
  let easyDays = 0
  const params: Record<string, number> = { missed, harder, planned7: Math.round(planned7), actual7: Math.round(args.actualLoadLast7) }
  if ((args.tsb !== null && args.tsb < -25) || (planned7 > 0 && args.actualLoadLast7 > planned7 * 1.25)) {
    reasons.push('overreached')
    weekFactor = 0.9
    easyDays = 2
    if (args.tsb !== null) params.tsb = Math.round(args.tsb)
  } else if (harder > 0) {
    reasons.push('harder_than_planned')
    easyDays = 1
  }
  if (missed >= 2) {
    reasons.push('missed_sessions')
    // No se «recupera» lo perdido: la semana no sube más de un 15 % sobre lo real
    if (planned7 > 0) weekFactor = Math.min(weekFactor, Math.max(0.7, args.actualLoadLast7 / planned7 + 0.15))
  }
  if (!reasons.length) reasons.push('on_plan')
  return { weekFactor: Math.round(weekFactor * 100) / 100, easyDays, reasons, params }
}

export type ChangeReason = 'initial' | 'goals_changed' | 'pause' | 'availability' | 'overreached' | 'missed_sessions' | 'harder_than_planned' | 'weekly'

export interface PlanChange {
  reason: ChangeReason
  params: Record<string, number | string>
}

/** ¿Cambió el plan lo suficiente como para guardar una versión nueva? */
export function planDiffers(oldWeeks: Pick<WeekDraft, 'weekStart' | 'targetLoad' | 'sessions'>[], newWeeks: WeekDraft[]) {
  if (oldWeeks.length === 0) return true
  const key = (w: Pick<WeekDraft, 'weekStart' | 'sessions'>) => w.sessions.map((s) => `${s.date}:${s.sport}:${s.kind}:${s.durationMin}`).join('|')
  const byWeek = new Map(oldWeeks.map((w) => [w.weekStart, w]))
  for (const w of newWeeks) {
    const o = byWeek.get(w.weekStart)
    if (!o) return true
    if (Math.abs(o.targetLoad - w.targetLoad) > Math.max(10, w.targetLoad * 0.05)) return true
    if (key(o) !== key(w)) return true
  }
  return newWeeks.length !== oldWeeks.filter((w) => w.weekStart >= newWeeks[0].weekStart).length
}
