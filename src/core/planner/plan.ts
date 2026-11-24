import { addDays, daysBetween, weekStart } from '../dates'
import { recoveryDays } from '../season'
import { goalDemand, TAPER_DAYS, type GoalDemand, type GoalDemandInput } from './diagnosis'
import { loadPerHour, type Zone } from './zones'

/**
 * Generador del plan semana a semana (reglas reconocidas, sin IA):
 *  - Etapas: base → desarrollo → disminución → evento → recuperación.
 *  - 3 semanas subiendo + 1 de descarga (≈ −35 %).
 *  - Aumento semanal máximo ~10 % y de la forma ≈ 5 pts/semana.
 *  - Mínimo 1 día de descanso por semana.
 *  - Sesiones falladas NO se recuperan doblando otras.
 *  - Pausas: enfermedad/lesión = descanso y regreso gradual; viajes = solo lo
 *    que se pueda hacer, el tiempo que se pueda.
 */

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7 // lunes = 1
export type Sport = 'cycling' | 'running' | 'swimming' | 'strength' | 'other'
export type SessionKind = 'easy' | 'long' | 'tempo' | 'threshold' | 'vo2' | 'climb' | 'recovery' | 'strength' | 'openers' | 'event' | 'rest'
export type Phase = 'base' | 'build' | 'recovery_week' | 'taper' | 'event' | 'recovery' | 'return' | 'pause' | 'maintenance'
export type PauseAvailability = 'bike' | 'run' | 'gym' | 'pool' | 'none'

export interface Availability {
  minutesByDay: Record<Weekday, number>
  longDay: Weekday
}

export interface PlanGoal extends GoalDemandInput {
  id: string
  name: string
  subSport: string | null
  elevationPerKm: number // m de desnivel por km (para sesiones de subida)
}

export interface PlanPause {
  kind: 'illness' | 'injury' | 'travel' | 'vacation' | 'other'
  startsOn: string
  endsOn: string | null
  canTrain: boolean | null
  available: PauseAvailability[]
  minutesPerDay: number | null
}

export interface SportMix {
  cycling: number
  running: number
  swimming: number
  strength: number
}

export interface Block {
  minutes: number
  zone: Zone
  repeat?: number
  restMinutes?: number
}

export interface SessionDraft {
  date: string
  sport: Sport
  kind: SessionKind
  durationMin: number
  load: number
  blocks: Block[]
  goalId: string | null
  phase: Phase
  /** Para sesiones de pausa (ej. gimnasio de hotel) */
  note?: 'hotel_gym' | 'travel' | 'return' | 'stage_day' | 'back_to_back' | 'openers' | 'day_before'
}

export type WeekNote =
  | 'recovery_week'
  | 'taper'
  | 'event_week'
  | 'recovery_after_event'
  | 'pause_illness'
  | 'pause_travel'
  | 'return_gradual'
  | 'back_to_back'
  | 'secondary_as_training'
  | 'capacity_limited'
  | 'adjusted_down'
  | 'no_goals'

export interface WeekDraft {
  weekStart: string
  phase: Phase
  goalId: string | null
  targetLoad: number
  load: number // suma de las sesiones
  notes: WeekNote[]
  sessions: SessionDraft[]
}

export interface PlanInput {
  today: string
  goals: PlanGoal[]
  availability: Availability
  mix: SportMix
  ctl: number
  recentWeeklyLoad: number // promedio de las últimas 3 semanas
  longestRecentMin: number // salida más larga reciente del deporte principal
  pauses: PlanPause[]
  /** Ajuste por lo que de verdad pasó (ver adapt.ts) */
  adjustment?: { weekFactor: number; easyDays: number }
}

export interface PlanOutput {
  weeks: WeekDraft[]
  goalDemands: Record<string, GoalDemand>
}

const MIN_WEEKLY = 90
const K7 = 1 - Math.exp(-7 / 42)
const AVG_LOAD_PER_HOUR = 55

export function isoWeekday(day: string): Weekday {
  const [y, m, d] = day.split('-').map(Number)
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return (w === 0 ? 7 : w) as Weekday
}

export function blocksLoad(blocks: Block[]) {
  return blocks.reduce((s, b) => s + ((b.minutes * (b.repeat ?? 1)) / 60) * loadPerHour(b.zone) + (((b.restMinutes ?? 0) * Math.max(0, (b.repeat ?? 1) - 1)) / 60) * loadPerHour(1), 0)
}
export const blocksMinutes = (blocks: Block[]) => blocks.reduce((s, b) => s + b.minutes * (b.repeat ?? 1) + (b.restMinutes ?? 0) * Math.max(0, (b.repeat ?? 1) - 1), 0)

/** Estructura de cada tipo de sesión para una duración dada. */
export function structureFor(kind: SessionKind, minutes: number): Block[] {
  const m = Math.max(20, Math.round(minutes))
  switch (kind) {
    case 'recovery':
      return [{ minutes: m, zone: 1 }]
    case 'easy':
    case 'long':
      return [{ minutes: m, zone: 2 }]
    case 'tempo': {
      const work: Block = { minutes: m >= 75 ? 20 : 15, zone: 3, repeat: 2, restMinutes: 5 }
      const rest = m - blocksMinutes([work])
      return [{ minutes: Math.max(10, Math.ceil(rest / 2)), zone: 2 }, work, { minutes: Math.max(10, Math.floor(rest / 2)), zone: 2 }]
    }
    case 'threshold': {
      const work: Block = { minutes: 10, zone: 4, repeat: m >= 70 ? 3 : 2, restMinutes: 5 }
      const rest = m - blocksMinutes([work])
      return [{ minutes: Math.max(10, Math.ceil(rest / 2)), zone: 2 }, work, { minutes: Math.max(10, Math.floor(rest / 2)), zone: 2 }]
    }
    case 'vo2': {
      const work: Block = { minutes: 3, zone: 5, repeat: 5, restMinutes: 3 }
      const rest = m - blocksMinutes([work])
      return [{ minutes: Math.max(10, Math.ceil(rest / 2)), zone: 2 }, work, { minutes: Math.max(10, Math.floor(rest / 2)), zone: 2 }]
    }
    case 'climb': {
      const work: Block = { minutes: 8, zone: 3, repeat: 4, restMinutes: 4 }
      const rest = m - blocksMinutes([work])
      return [{ minutes: Math.max(10, Math.ceil(rest / 2)), zone: 2 }, work, { minutes: Math.max(10, Math.floor(rest / 2)), zone: 2 }]
    }
    case 'openers':
      return [{ minutes: Math.max(15, m - 12), zone: 2 }, { minutes: 1, zone: 4, repeat: 3, restMinutes: 3 }]
    case 'strength':
      return [{ minutes: m, zone: 3 }]
    case 'event':
      return [{ minutes: m, zone: 3 }]
    case 'rest':
      return []
  }
}

function session(date: string, sport: Sport, kind: SessionKind, minutes: number, goalId: string | null, phase: Phase, note?: SessionDraft['note'], fixedLoad?: number): SessionDraft {
  const blocks = structureFor(kind, minutes)
  const durationMin = kind === 'rest' ? 0 : blocksMinutes(blocks)
  return { date, sport, kind, durationMin, load: Math.round(fixedLoad ?? blocksLoad(blocks)), blocks, goalId, phase, note }
}

interface GoalWindow {
  goal: PlanGoal
  demand: GoalDemand
  taperStart: string
  eventStart: string
  eventEnd: string
  recoveryEnd: string
}

function windows(goals: PlanGoal[], today: string): GoalWindow[] {
  return [...goals]
    .filter((g) => g.eventDate >= today)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
    .map((g) => {
      const eventEnd = addDays(g.eventDate, Math.max(1, g.stageDays) - 1)
      return {
        goal: g,
        demand: goalDemand(g),
        taperStart: addDays(g.eventDate, -TAPER_DAYS[g.priority]),
        eventStart: g.eventDate,
        eventEnd,
        recoveryEnd: addDays(eventEnd, recoveryDays({ goalType: g.goalType, stageDays: g.stageDays, estimatedHours: g.estimatedHours })),
      }
    })
}

/** Días de una pausa dentro de una semana y cómo afectan cada día. */
function dayPause(day: string, pauses: PlanPause[]) {
  return pauses.find((p) => day >= p.startsOn && day <= (p.endsOn ?? p.startsOn))
}

/** Multiplicadores de regreso gradual tras enfermedad o lesión, según días parados. */
export function returnProtocol(daysOff: number): number[] {
  if (daysOff <= 0) return []
  if (daysOff <= 3) return [0.8]
  if (daysOff <= 14) return [0.5, 0.75, 0.9].slice(0, daysOff <= 7 ? 2 : 3)
  return [0.4, 0.6, 0.75, 0.9]
}

export function generatePlan(input: PlanInput): PlanOutput {
  const { today, availability, mix } = input
  const wins = windows(input.goals, today)
  const firstWeek = weekStart(today)
  const lastDay = wins.length ? wins[wins.length - 1].recoveryEnd : addDays(today, 27)
  const nWeeks = Math.max(1, Math.ceil((daysBetween(firstWeek, lastDay) + 1) / 7))

  const capacityLoad = (Object.values(availability.minutesByDay).reduce((a, b) => a + b, 0) / 60) * AVG_LOAD_PER_HOUR
  let ctl = input.ctl
  let lastLoading = Math.max(MIN_WEEKLY, input.recentWeeklyLoad || 0, Math.min(capacityLoad * 0.5, ctl * 7 || capacityLoad * 0.5))
  let peak = lastLoading
  let loadingStreak = 0
  let longMin = Math.max(45, input.longestRecentMin || 60)

  // Días parados por enfermedad/lesión (para el regreso gradual)
  const sickPauses = input.pauses.filter((p) => p.kind === 'illness' || p.kind === 'injury')

  const weeks: WeekDraft[] = []
  for (let w = 0; w < nWeeks; w++) {
    const ws = addDays(firstWeek, w * 7)
    const we = addDays(ws, 6)
    const notes: WeekNote[] = []

    // ¿Qué meta y qué etapa?
    const win = wins.find((x) => ws <= x.recoveryEnd) ?? null
    let phase: Phase = 'maintenance'
    if (!wins.length) notes.push('no_goals')
    if (win) {
      if (we >= win.eventStart && ws <= win.eventEnd) phase = 'event'
      else if (ws > win.eventEnd) phase = 'recovery'
      else if (we >= win.taperStart) phase = 'taper'
      else {
        const prevEnd = wins[wins.indexOf(win) - 1]?.recoveryEnd ?? firstWeek
        const span = Math.max(1, daysBetween(prevEnd, win.taperStart) / 7)
        const pos = daysBetween(prevEnd, ws) / 7
        phase = span >= 6 && pos < span * 0.35 ? 'base' : 'build'
      }
    }

    // Pausas de esta semana
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
    const pauseDays = days.map((d) => dayPause(d, input.pauses))
    const sickDays = pauseDays.filter((p) => p && (p.kind === 'illness' || p.kind === 'injury')).length
    const travelDays = pauseDays.filter((p) => p && p.kind !== 'illness' && p.kind !== 'injury').length
    if (sickDays >= 4) phase = 'pause'
    if (sickDays > 0) notes.push('pause_illness')
    if (travelDays > 0) notes.push('pause_travel')

    // ¿Semana de regreso tras enfermedad/lesión?
    let returnFactor = 1
    for (const p of sickPauses) {
      const end = p.endsOn ?? p.startsOn
      if (end >= ws) continue
      const daysOff = daysBetween(p.startsOn, end) + 1
      const proto = returnProtocol(daysOff)
      const idx = Math.floor(daysBetween(addDays(end, 1), ws) / 7)
      if (idx >= 0 && idx < proto.length) {
        returnFactor = Math.min(returnFactor, proto[idx])
        if (phase !== 'event' && phase !== 'taper') phase = 'return'
        notes.push('return_gradual')
      }
    }

    // Carga objetivo de la semana
    let target: number
    const isRecoveryWeek = (phase === 'build' || phase === 'base') && loadingStreak === 3
    if (isRecoveryWeek) {
      phase = 'recovery_week'
      notes.push('recovery_week')
      target = lastLoading * 0.65
      loadingStreak = 0
    } else if (phase === 'base' || phase === 'build' || phase === 'maintenance' || phase === 'return') {
      const maxByRamp = 7 * (ctl + 5 / K7) // la forma no sube más de ~5 pts/semana
      const grow = phase === 'maintenance' ? 1 : phase === 'base' ? 1.06 : 1.1
      target = Math.min(lastLoading * grow, maxByRamp, Math.max(capacityLoad, MIN_WEEKLY))
      if (target >= capacityLoad * 0.98) notes.push('capacity_limited')
      if (phase !== 'return') {
        lastLoading = target
        peak = Math.max(peak, target)
        loadingStreak++
      }
    } else if (phase === 'taper') {
      notes.push('taper')
      const toEvent = daysBetween(ws, win!.eventStart)
      target = peak * (win!.goal.priority === 'primary' ? (toEvent > 7 ? 0.75 : 0.55) : 0.7)
    } else if (phase === 'event') {
      notes.push('event_week')
      if (win!.goal.priority === 'secondary') notes.push('secondary_as_training')
      target = peak * 0.55 + win!.demand.perDayLoad * Math.max(1, win!.goal.stageDays)
    } else if (phase === 'recovery') {
      notes.push('recovery_after_event')
      const wAfter = Math.floor(daysBetween(win!.eventEnd, ws) / 7)
      target = peak * (wAfter <= 0 ? 0.5 : 0.75)
      loadingStreak = 0
      lastLoading = Math.max(lastLoading * 0.85, MIN_WEEKLY)
    } else {
      target = 0
    }
    target *= returnFactor
    if (w === 0 && input.adjustment && input.adjustment.weekFactor < 1) {
      target *= input.adjustment.weekFactor
      notes.push('adjusted_down')
    }

    // Sesiones
    const sessions = buildWeekSessions({
      days,
      pauseDays,
      phase,
      target,
      win,
      availability,
      mix,
      longMin,
      easyFirstDays: w === 0 ? (input.adjustment?.easyDays ?? 0) : 0,
      today,
      weekIndex: w,
    })
    if (sessions.some((s) => s.note === 'back_to_back')) notes.push('back_to_back')
    const load = Math.round(sessions.reduce((s, x) => s + x.load, 0))
    if (phase === 'build' || phase === 'base') longMin = Math.min(longMin * 1.1, longCap(win))

    // Evolución aproximada de la forma con la carga planeada
    ctl += (load / 7 - ctl) * K7
    weeks.push({ weekStart: ws, phase, goalId: win?.goal.id ?? null, targetLoad: Math.round(target), load, notes: [...new Set(notes)], sessions })
  }
  return { weeks, goalDemands: Object.fromEntries(wins.map((x) => [x.goal.id, x.demand])) }
}

/** Salida larga máxima: 60–75 % de la duración del día de evento (tope 5 h). */
function longCap(win: GoalWindow | null) {
  if (!win) return 150
  const perDayMin = (win.goal.estimatedHours / Math.max(1, win.goal.stageDays)) * 60
  return Math.min(300, Math.max(90, perDayMin * (win.goal.priority === 'primary' ? 0.75 : 0.65)))
}

function mainSport(win: GoalWindow | null, mix: SportMix): Sport {
  if (win && ['cycling', 'running', 'swimming'].includes(win.goal.sport)) return win.goal.sport as Sport
  const [best] = (Object.entries(mix) as [Sport, number][]).filter(([s]) => s !== 'strength').sort((a, b) => b[1] - a[1])
  return best && best[1] > 0 ? best[0] : 'cycling'
}

function buildWeekSessions(a: {
  days: string[]
  pauseDays: (PlanPause | undefined)[]
  phase: Phase
  target: number
  win: GoalWindow | null
  availability: Availability
  mix: SportMix
  longMin: number
  easyFirstDays: number
  today: string
  weekIndex: number
}): SessionDraft[] {
  const { days, pauseDays, phase, win, availability, mix } = a
  const goalId = win?.goal.id ?? null
  const sport = mainSport(win, mix)
  const out: SessionDraft[] = []

  // Minutos disponibles por día (las pausas mandan)
  const cap = days.map((d, i) => {
    const p = pauseDays[i]
    if (p) {
      if (p.kind === 'illness' || p.kind === 'injury') return 0
      if (p.canTrain === false || p.available.includes('none') || p.available.length === 0) return 0
      return p.minutesPerDay ?? 45
    }
    return availability.minutesByDay[isoWeekday(d)] ?? 0
  })

  // Al menos un día de descanso (sin contar pausas)
  if (cap.every((c) => c > 0)) {
    const after = days.findIndex((d) => isoWeekday(d) === ((availability.longDay % 7) + 1))
    const restIdx = after >= 0 && !pauseDays[after] ? after : cap.indexOf(Math.min(...cap))
    cap[restIdx] = 0
  }

  // Días de pausa con entrenamiento posible: sesiones según lo disponible
  const normalIdx: number[] = []
  days.forEach((d, i) => {
    const p = pauseDays[i]
    if (cap[i] === 0) return
    if (p) {
      const s = p.available.includes('gym')
        ? session(d, 'strength', 'strength', Math.min(cap[i], 60), goalId, a.phase, 'hotel_gym')
        : p.available.includes('run')
          ? session(d, 'running', 'easy', Math.min(cap[i], 45), goalId, a.phase, 'travel')
          : p.available.includes('bike')
            ? session(d, 'cycling', 'easy', Math.min(cap[i], 60), goalId, a.phase, 'travel')
            : session(d, 'swimming', 'easy', Math.min(cap[i], 45), goalId, a.phase, 'travel')
      out.push(s)
    } else normalIdx.push(i)
  })

  if (phase === 'pause' || a.target <= 0) return out.sort((x, y) => x.date.localeCompare(y.date))

  // Evento: sesiones del evento, la víspera suave, dos días antes activación
  const eventIdx = new Set<number>()
  if (phase === 'event' && win) {
    days.forEach((d, i) => {
      if (d >= win.eventStart && d <= win.eventEnd) {
        eventIdx.add(i)
        out.push(
          session(d, sport, 'event', (win.goal.estimatedHours / Math.max(1, win.goal.stageDays)) * 60, goalId, phase, win.goal.goalType === 'stage' ? 'stage_day' : undefined, win.demand.perDayLoad),
        )
      }
    })
  }

  // Días libres para sesiones normales (excluye días de evento)
  const free = normalIdx.filter((i) => !eventIdx.has(i) && !(phase === 'event' && win && days[i] > win.eventEnd && daysBetween(win.eventEnd, days[i]) <= 1))
  if (free.length === 0) return out.sort((x, y) => x.date.localeCompare(y.date))

  // Reparto de deportes complementarios
  const extra: { sport: Sport; kind: SessionKind; minutes: number }[] = []
  const lightPhase = phase === 'taper' || phase === 'event' || phase === 'recovery' || phase === 'recovery_week' || phase === 'return'
  if (mix.strength >= 0.08 && phase !== 'event' && !(phase === 'taper' && win && daysBetween(days[0], win.eventStart) <= 7)) {
    extra.push({ sport: 'strength', kind: 'strength', minutes: 50 })
    if (mix.strength >= 0.2 && !lightPhase) extra.push({ sport: 'strength', kind: 'strength', minutes: 45 })
  }
  if (sport !== 'running' && mix.running >= 0.08) extra.push({ sport: 'running', kind: 'easy', minutes: 40 })
  if (sport !== 'swimming' && mix.swimming >= 0.08) extra.push({ sport: 'swimming', kind: 'easy', minutes: 40 })

  // Día de la salida larga
  const byCap = [...free].sort((x, y) => cap[y] - cap[x])
  const longIdx = free.find((i) => isoWeekday(days[i]) === availability.longDay) ?? byCap[0]
  const remaining = free.filter((i) => i !== longIdx)

  // Sesiones clave del deporte principal según la etapa
  const keys: SessionKind[] =
    phase === 'build'
      ? [win?.goal.objective === 'time' ? 'threshold' : 'tempo', win && win.goal.elevationPerKm >= 12 ? 'climb' : 'tempo']
      : phase === 'base'
        ? ['tempo']
        : phase === 'taper'
          ? ['openers']
          : phase === 'maintenance'
            ? ['tempo']
            : []

  // Asignar: días más cortos a complementarios, el resto al deporte principal
  const sortedByCap = [...remaining].sort((x, y) => cap[x] - cap[y])
  const plan: { i: number; sport: Sport; kind: SessionKind; minutes: number; note?: SessionDraft['note'] }[] = []
  for (const e of extra) {
    const i = sortedByCap.shift()
    if (i === undefined) break
    plan.push({ i, sport: e.sport, kind: e.kind, minutes: Math.min(e.minutes, cap[i]) })
  }
  const mainDays = sortedByCap.sort((x, y) => x - y)
  mainDays.forEach((i, k) => {
    const kind: SessionKind = k < keys.length ? keys[k] : phase === 'recovery' || phase === 'return' ? 'recovery' : 'easy'
    plan.push({ i, sport, kind, minutes: Math.min(cap[i], kind === 'easy' || kind === 'recovery' ? 60 : 75) })
  })

  // Salida larga (y días seguidos para metas por etapas)
  if (longIdx !== undefined && phase !== 'event') {
    const longMinutes = Math.min(cap[longIdx], lightPhase ? a.longMin * (phase === 'taper' ? 0.6 : 0.5) : a.longMin)
    plan.push({ i: longIdx, sport, kind: lightPhase ? 'easy' : 'long', minutes: longMinutes })
    const weeksToEvent = win ? daysBetween(days[0], win.eventStart) / 7 : 99
    const b2b = win?.goal.goalType === 'stage' && phase === 'build' && weeksToEvent <= 9 && weeksToEvent >= 3 && a.weekIndex % 2 === 0
    if (b2b) {
      const nextIdx = longIdx + 1
      const existing = plan.find((p) => p.i === nextIdx)
      if (nextIdx < 7 && cap[nextIdx] > 0 && !pauseDays[nextIdx]) {
        const mins = Math.min(cap[nextIdx], longMinutes * 0.7)
        if (existing) Object.assign(existing, { sport, kind: 'long' as SessionKind, minutes: mins, note: 'back_to_back' as const })
        else plan.push({ i: nextIdx, sport, kind: 'long', minutes: mins, note: 'back_to_back' })
      }
    }
  }

  // Antes del evento (aunque caiga en la semana anterior): activación dos días
  // antes y víspera muy suave
  if (win) {
    for (const p of plan) {
      const toEvent = daysBetween(days[p.i], win.eventStart)
      if (toEvent === 1) Object.assign(p, { kind: 'recovery', minutes: Math.min(30, cap[p.i]), note: 'day_before' })
      else if (toEvent === 2 && p.sport === sport) Object.assign(p, { kind: 'openers', minutes: Math.min(50, cap[p.i]), note: 'openers' })
    }
  }

  // Ajuste: los primeros días suaves si hubo exceso de fatiga
  if (a.easyFirstDays > 0) {
    plan
      .filter((p) => days[p.i] >= a.today && p.kind !== 'strength')
      .sort((x, y) => x.i - y.i)
      .slice(0, a.easyFirstDays)
      .forEach((p) => Object.assign(p, { kind: 'recovery', minutes: Math.min(p.minutes, 45) }))
  }

  // Escalar duraciones flexibles para acercarse a la carga objetivo
  const fixed = out.reduce((s, x) => s + x.load, 0)
  const drafts = plan.map((p) => session(days[p.i], p.sport, p.kind, p.minutes, goalId, phase, p.note))
  const flexible = drafts.filter((d) => d.kind === 'easy' || d.kind === 'long' || d.kind === 'recovery')
  const rigid = drafts.filter((d) => !flexible.includes(d))
  const rigidLoad = rigid.reduce((s, x) => s + x.load, 0)
  const flexLoad = flexible.reduce((s, x) => s + x.load, 0)
  const wanted = a.target - fixed - rigidLoad
  const factor = flexLoad > 0 ? Math.min(1.6, Math.max(0.5, wanted / flexLoad)) : 1
  const scaled = flexible.map((d) => {
    const i = days.indexOf(d.date)
    const minutes = Math.max(30, Math.min(cap[i], d.durationMin * factor))
    return session(d.date, d.sport, d.kind, minutes, goalId, phase, d.note)
  })

  return [...out, ...rigid, ...scaled].sort((x, y) => x.date.localeCompare(y.date) || (x.sport === 'strength' ? 1 : -1))
}
