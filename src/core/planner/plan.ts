import { addDays, daysBetween, weekStart } from '../dates'
import { recoveryDays } from '../season'
import { goalDemand, TAPER_DAYS, type GoalDemand, type GoalDemandInput } from './diagnosis'
import { loadPerHour, type Zone } from './zones'
import { easyAfter as easyAfterDays, noStrengthAfter, PLAN_RULES, restAfter as restAfterDays } from './rules'

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
  /** Días con acceso a piscina (para la natación) */
  poolDays?: Weekday[]
}

export interface PlanGoal extends GoalDemandInput {
  id: string
  name: string
  subSport: string | null
  elevationPerKm: number // m de desnivel por km (para sesiones de subida)
  /** Solo triatlón: duración de cada tramo en minutos (objetivo o estimada) */
  triMinutes?: { swim: number; bike: number; run: number }
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
  note?: 'hotel_gym' | 'travel' | 'return' | 'stage_day' | 'back_to_back' | 'openers' | 'day_before' | 'brick' | 'tri_leg' | 'mobility' | 'after_event' | 'core'
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
  | 'no_pool'
  | 'brick'

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
  /**
   * Rutinas de fuerza (activas por defecto). `minutes` es la duración de una
   * sesión normal según la experiencia. Sin este dato se usa el historial.
   */
  strength?: { enabled: boolean; minutes: number }
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
  return blocks.reduce(
    (s, b) =>
      s + ((b.minutes * (b.repeat ?? 1)) / 60) * loadPerHour(b.zone) + (((b.restMinutes ?? 0) * Math.max(0, (b.repeat ?? 1) - 1)) / 60) * loadPerHour(1),
    0,
  )
}
export const blocksMinutes = (blocks: Block[]) =>
  blocks.reduce((s, b) => s + b.minutes * (b.repeat ?? 1) + (b.restMinutes ?? 0) * Math.max(0, (b.repeat ?? 1) - 1), 0)

/** Estructura de cada tipo de sesión para una duración dada. */
/**
 * Calentamiento + bloque de trabajo + vuelta a la calma, sin pasarse de los
 * minutos de la sesión: si no cabe, menos repeticiones o repeticiones más cortas.
 */
function withWarmup(work: Block, m: number): Block[] {
  const w = { ...work }
  while ((w.repeat ?? 1) > 1 && blocksMinutes([w]) + 20 > m) w.repeat = (w.repeat ?? 1) - 1
  if (blocksMinutes([w]) + 20 > m) w.minutes = Math.max(3, m - 20 - (w.restMinutes ?? 0) * ((w.repeat ?? 1) - 1))
  const rest = Math.max(20, m - blocksMinutes([w]))
  return [{ minutes: Math.ceil(rest / 2), zone: 2 }, w, { minutes: Math.floor(rest / 2), zone: 2 }]
}

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
      return withWarmup(work, m)
    }
    case 'threshold': {
      const work: Block = { minutes: 10, zone: 4, repeat: m >= 70 ? 3 : 2, restMinutes: 5 }
      return withWarmup(work, m)
    }
    case 'vo2': {
      const work: Block = { minutes: 3, zone: 5, repeat: 5, restMinutes: 3 }
      return withWarmup(work, m)
    }
    case 'climb': {
      const work: Block = { minutes: 8, zone: 3, repeat: 4, restMinutes: 4 }
      return withWarmup(work, m)
    }
    case 'openers':
      return [
        { minutes: Math.max(15, m - 12), zone: 2 },
        { minutes: 1, zone: 4, repeat: 3, restMinutes: 3 },
      ]
    case 'strength':
      return [{ minutes: m, zone: 3 }]
    case 'event':
      return [{ minutes: m, zone: 3 }]
    case 'rest':
      return []
  }
}

function session(
  date: string,
  sport: Sport,
  kind: SessionKind,
  minutes: number,
  goalId: string | null,
  phase: Phase,
  note?: SessionDraft['note'],
  fixedLoad?: number,
): SessionDraft {
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
  // La larga parte de lo que la persona ya hace (no de un mínimo fijo)
  let longMin = Math.max(20, input.longestRecentMin || PLAN_RULES.longStartNoHistoryMin)

  // Días parados por enfermedad/lesión (para el regreso gradual)
  const sickPauses = input.pauses.filter((p) => p.kind === 'illness' || p.kind === 'injury')

  const weeks: WeekDraft[] = []
  for (let w = 0; w < nWeeks; w++) {
    const ws = addDays(firstWeek, w * 7)
    const we = addDays(ws, 6)
    const notes: WeekNote[] = []

    // ¿Qué meta y qué etapa?
    // Metas con días de evento en esta semana (puede haber varias)
    const eventWins = wins.filter((x) => x.eventStart <= we && x.eventEnd >= ws)
    let win = wins.find((x) => ws <= x.recoveryEnd) ?? null
    // La recuperación de una meta cede ante la preparación de la siguiente si ya está cerca
    if (win && ws > win.eventEnd) {
      const next = wins[wins.indexOf(win) + 1]
      if (next && we >= next.taperStart) win = next
    }
    if (eventWins.length) win = eventWins.find((x) => x.goal.priority === 'primary') ?? eventWins[0]
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
      if (eventWins.some((x) => x.goal.priority === 'secondary')) notes.push('secondary_as_training')
      target = peak * 0.55 + eventWins.reduce((t, x) => t + x.demand.perDayLoad * Math.max(1, x.goal.stageDays), 0)
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
      strength: input.strength,
      wins,
      fitness: ctl,
    })
    if (sessions.some((s) => s.note === 'back_to_back')) notes.push('back_to_back')
    if (sessions.some((s) => s.note === 'brick')) notes.push('brick')
    if (win?.goal.triMinutes && !(availability.poolDays ?? []).length && phase !== 'pause') notes.push('no_pool')
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
  // Triatlón: la salida larga es de bici, hasta la duración de ese tramo
  if (win.goal.triMinutes) return Math.min(300, Math.max(75, win.goal.triMinutes.bike * (win.goal.priority === 'primary' ? 1 : 0.8)))
  const perDayMin = (win.goal.estimatedHours / Math.max(1, win.goal.stageDays)) * 60
  return Math.min(300, Math.max(90, perDayMin * (win.goal.priority === 'primary' ? 0.75 : 0.65)))
}

function mainSport(win: GoalWindow | null, mix: SportMix): Sport {
  if (win?.goal.sport === 'triathlon') return 'cycling'
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
  strength?: PlanInput['strength']
  /** Todas las metas (para eventos de varias metas en la misma semana) */
  wins?: GoalWindow[]
  /** Forma estimada al empezar la semana (para principiantes) */
  fitness?: number
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
    const after = days.findIndex((d) => isoWeekday(d) === (availability.longDay % 7) + 1)
    const restIdx = after >= 0 && !pauseDays[after] ? after : cap.indexOf(Math.min(...cap))
    cap[restIdx] = 0
  }

  // Evento: sesiones de cada meta con evento esta semana (puede haber varias)
  const allWins = a.wins ?? (win ? [win] : [])
  const weekEvents = allWins.filter((x) => x.eventStart <= days[6] && x.eventEnd >= days[0])
  const eventIdx = new Set<number>()
  for (const ew of weekEvents) {
    const gid = ew.goal.id
    const evSport = mainSport(ew, mix)
    days.forEach((d, i) => {
      if (d < ew.eventStart || d > ew.eventEnd) return
      eventIdx.add(i)
      if (ew.goal.triMinutes) {
        // Triatlón: tres sesiones de evento (natación, bici, running), sin transiciones
        const tm = ew.goal.triMinutes
        const tot = tm.swim + tm.bike + tm.run || 1
        for (const [sp, min] of [
          ['swimming', tm.swim],
          ['cycling', tm.bike],
          ['running', tm.run],
        ] as const)
          out.push(session(d, sp, 'event', min, gid, 'event', 'tri_leg', (ew.demand.perDayLoad * min) / tot))
      } else {
        out.push(
          session(
            d,
            evSport,
            'event',
            (ew.goal.estimatedHours / Math.max(1, ew.goal.stageDays)) * 60,
            gid,
            'event',
            ew.goal.goalType === 'stage' ? 'stage_day' : undefined,
            ew.demand.perDayLoad,
          ),
        )
      }
    })
  }

  // Días de pausa con entrenamiento posible: sesiones según lo disponible
  const normalIdx: number[] = []
  days.forEach((d, i) => {
    const p = pauseDays[i]
    if (cap[i] === 0 || eventIdx.has(i)) return
    if (p) {
      // También en pausa: descanso y recuperación después de un evento
      const after = allWins
        .filter((x) => d > x.eventEnd && daysBetween(x.eventEnd, d) <= noStrengthAfter(x.goal.stageDays))
        .sort((x, y) => y.eventEnd.localeCompare(x.eventEnd))[0]
      if (after && daysBetween(after.eventEnd, d) <= restAfter(after)) return
      if (after) {
        const sp: Sport | null = p.available.includes('run')
          ? 'running'
          : p.available.includes('bike')
            ? 'cycling'
            : p.available.includes('pool')
              ? 'swimming'
              : null
        if (sp) out.push(session(d, sp, 'recovery', Math.min(cap[i], PLAN_RULES.recoveryMaxMin), goalId, a.phase, 'after_event'))
        return
      }
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

  // Días libres para sesiones normales (excluye días de evento)
  // …ni los días de descanso después de un evento: 1 (o 2 si fue de varios días)
  const free = normalIdx.filter((i) => !eventIdx.has(i) && !allWins.some((x) => days[i] > x.eventEnd && daysBetween(x.eventEnd, days[i]) <= restAfter(x)))
  if (free.length === 0) return out.sort((x, y) => x.date.localeCompare(y.date))

  const lightPhase = phase === 'taper' || phase === 'event' || phase === 'recovery' || phase === 'recovery_week' || phase === 'return'
  const plan: PlanSlot[] = win?.goal.triMinutes
    ? triathlonSlots({ days, free, cap, phase, win, availability, mix, longMin: a.longMin, weekIndex: a.weekIndex, lightPhase, fitness: a.fitness ?? 50 })
    : normalSlots({
        days,
        free,
        cap,
        phase,
        win,
        availability,
        mix,
        longMin: a.longMin,
        weekIndex: a.weekIndex,
        lightPhase,
        pauseDays,
        sport,
        strengthOn: !!a.strength,
        fitness: a.fitness ?? 50,
      })
  if (a.strength?.enabled)
    addStrength({ plan, days, free: free.filter((i) => days[i] >= a.today), cap, phase, win, wins: allWins, minutes: a.strength.minutes })
  return finishWeek({ plan, out, days, cap, phase, win, wins: allWins, goalId, sport, a })
}

type PlanSlot = { i: number; sport: Sport; kind: SessionKind; minutes: number; note?: SessionDraft['note'] }

interface SlotArgs {
  days: string[]
  free: number[]
  cap: number[]
  phase: Phase
  win: GoalWindow | null
  availability: Availability
  mix: SportMix
  longMin: number
  weekIndex: number
  lightPhase: boolean
  /** Forma estimada (para la regla de principiantes) */
  fitness: number
}

/**
 * Cuántas sesiones de calidad caben: ninguna las primeras semanas de un
 * principiante; una sola con pocos días de entreno o si aún es principiante.
 */
function qualityLimit(args: SlotArgs) {
  const novice = args.fitness < PLAN_RULES.noviceCtl
  if (novice && args.weekIndex < PLAN_RULES.noviceEasyWeeks) return 0
  if (novice || args.free.length <= PLAN_RULES.lowDaysOneQuality) return 1
  return 99
}

function normalSlots(args: SlotArgs & { pauseDays: (PlanPause | undefined)[]; sport: Sport; strengthOn: boolean }): PlanSlot[] {
  const { days, free, cap, phase, win, availability, mix, lightPhase, pauseDays, sport, strengthOn } = args
  const a = { longMin: args.longMin, weekIndex: args.weekIndex }
  // Reparto de deportes complementarios
  const extra: { sport: Sport; kind: SessionKind; minutes: number }[] = []
  // (con «Tu fuerza» la fuerza se agrega aparte, ver addStrength)
  if (!strengthOn && mix.strength >= 0.08 && phase !== 'event' && !(phase === 'taper' && win && daysBetween(days[0], win.eventStart) <= 7)) {
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
  const allKeys: SessionKind[] =
    phase === 'build'
      ? [win?.goal.objective === 'time' ? 'threshold' : 'tempo', win && win.goal.elevationPerKm >= 12 ? 'climb' : 'tempo']
      : phase === 'base'
        ? ['tempo']
        : phase === 'taper'
          ? ['openers']
          : phase === 'maintenance'
            ? ['tempo']
            : []

  // La activación previa al evento no cuenta como sesión fuerte
  const keys = allKeys.filter((k, n) => k === 'openers' || n < qualityLimit(args))

  // Asignar: días más cortos a complementarios, el resto al deporte principal
  const sortedByCap = [...remaining].sort((x, y) => cap[x] - cap[y])
  const plan: PlanSlot[] = []
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
    const longMinutes = Math.min(cap[longIdx], PLAN_RULES.longMaxMin[sport] ?? 300, lightPhase ? a.longMin * (phase === 'taper' ? 0.6 : 0.5) : a.longMin)
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

  // Natación solo en días con piscina (si la persona los marcó): los demás días,
  // otro deporte suave que practique, o descanso
  const pool = new Set(availability.poolDays ?? [])
  if (pool.size) {
    const alt = (['running', 'cycling'] as Sport[])
      .filter((x) => mix[x as 'running' | 'cycling'] >= 0.05)
      .sort((x, y) => mix[y as 'running'] - mix[x as 'running'])[0]
    for (let k = plan.length - 1; k >= 0; k--) {
      const p = plan[k]
      if (p.sport !== 'swimming' || pool.has(isoWeekday(days[p.i]))) continue
      if (alt) Object.assign(p, { sport: alt, kind: 'easy' as SessionKind, minutes: Math.min(p.minutes, 45) })
      else plan.splice(k, 1)
    }
  }

  return plan
}

/**
 * Semana de triatlón: natación solo los días con piscina, salida larga de bici
 * (con trote corto después: sesión combinada), carrera larga, y el resto
 * alternando bici y running. La disciplina más floja recibe una sesión extra.
 */
function triathlonSlots(args: SlotArgs): PlanSlot[] {
  const { days, free, cap, phase, win, availability, mix, lightPhase } = args
  const tm = win!.goal.triMinutes!
  // Principiante o pocos días: menos sesiones fuertes (la de bici va primero)
  const limit = qualityLimit(args)
  const pool = new Set(availability.poolDays ?? [])
  const plan: PlanSlot[] = []
  const used = new Set<number>()
  const tot = tm.swim + tm.bike + tm.run || 1
  // Déficit de cada disciplina: peso en la carrera menos lo que de verdad entrena
  const mixTri = mix.swimming + mix.cycling + mix.running || 1
  const deficit = {
    swimming: tm.swim / tot - mix.swimming / mixTri,
    cycling: tm.bike / tot - mix.cycling / mixTri,
    running: tm.run / tot - mix.running / mixTri,
  }
  const weakest = (Object.entries(deficit) as [Sport, number][]).sort((x, y) => y[1] - x[1])[0][0]

  // 1) Salida larga de bici el día largo (no en día de piscina si se puede)
  const byCap = [...free].sort((x, y) => cap[y] - cap[x])
  const longIdx = free.find((i) => isoWeekday(days[i]) === availability.longDay) ?? byCap.find((i) => !pool.has(isoWeekday(days[i]))) ?? byCap[0]
  if (longIdx !== undefined && phase !== 'event') {
    const longMinutes = Math.min(cap[longIdx], lightPhase ? args.longMin * (phase === 'taper' ? 0.6 : 0.5) : args.longMin)
    plan.push({ i: longIdx, sport: 'cycling', kind: lightPhase ? 'easy' : 'long', minutes: longMinutes })
    used.add(longIdx)
    // Sesión combinada: trote corto justo después de la bici
    const brick = !lightPhase && (phase === 'build' || args.weekIndex % 2 === 0)
    if (brick && cap[longIdx] - longMinutes >= 15)
      plan.push({ i: longIdx, sport: 'running', kind: 'easy', minutes: Math.min(phase === 'build' ? 25 : 15, cap[longIdx] - longMinutes), note: 'brick' })
  }

  // 2) Natación los días con piscina (hasta 3; 2 en semanas suaves)
  const swimDays = free.filter((i) => pool.has(isoWeekday(days[i])) && !used.has(i))
  const nSwim = Math.min(swimDays.length, lightPhase ? 2 : weakest === 'swimming' ? 3 : 2 + (swimDays.length >= 3 ? 1 : 0))
  swimDays.slice(0, nSwim).forEach((i, k) => {
    const kind: SessionKind = phase === 'build' && k === 0 && limit >= 3 ? 'threshold' : phase === 'taper' && k === 0 ? 'openers' : 'easy'
    plan.push({ i, sport: 'swimming', kind, minutes: Math.min(cap[i], kind === 'easy' ? 45 : 60) })
    used.add(i)
  })

  // 3) Carrera larga: el día libre con más tiempo, lejos de la bici larga
  const rest = free.filter((i) => !used.has(i)).sort((x, y) => cap[y] - cap[x])
  const runLongIdx = rest.find((i) => longIdx === undefined || Math.abs(i - longIdx) > 1) ?? rest[0]
  if (runLongIdx !== undefined) {
    const runMin = Math.min(cap[runLongIdx], lightPhase ? 45 : Math.min(120, Math.max(50, tm.run * 0.75)))
    plan.push({ i: runLongIdx, sport: 'running', kind: lightPhase ? 'easy' : 'long', minutes: runMin })
    used.add(runLongIdx)
  }

  // 4) Resto de días: alternar bici y running con calidad; extra para la más floja
  const keys: Record<'cycling' | 'running', SessionKind[]> = {
    cycling:
      phase === 'taper'
        ? ['openers']
        : limit === 0
          ? []
          : phase === 'build'
            ? [win!.goal.objective === 'time' ? 'threshold' : 'tempo']
            : phase === 'base'
              ? ['tempo']
              : [],
    running: phase === 'build' && limit >= 2 ? ['tempo'] : [],
  }
  const order: ('cycling' | 'running')[] = weakest === 'running' ? ['running', 'cycling'] : ['cycling', 'running']
  free
    .filter((i) => !used.has(i))
    .sort((x, y) => x - y)
    .forEach((i, k) => {
      const sp = order[k % 2]
      const kind = keys[sp].shift() ?? (phase === 'recovery' || phase === 'return' ? 'recovery' : 'easy')
      plan.push({ i, sport: sp, kind, minutes: Math.min(cap[i], kind === 'easy' || kind === 'recovery' ? 50 : 70) })
      used.add(i)
    })

  // 5) Doble sesión en días de piscina con tiempo: trote suave después de nadar
  const runs = plan.filter((p) => p.sport === 'running').length
  if (!lightPhase && runs < 3) {
    const swimDay = plan.find((p) => p.sport === 'swimming' && cap[p.i] - p.minutes >= 35 && !plan.some((q) => q.i === p.i && q.sport === 'running'))
    if (swimDay) plan.push({ i: swimDay.i, sport: 'running', kind: 'easy', minutes: Math.min(40, cap[swimDay.i] - swimDay.minutes) })
  }
  return plan
}

/** Sesiones de fuerza por semana según la etapa. */
export function strengthPerWeek(phase: Phase) {
  return PLAN_RULES.strengthPerWeek[phase]
}

const KEY_KINDS: SessionKind[] = ['long', 'tempo', 'threshold', 'vo2', 'climb', 'openers', 'event']

/**
 * Agrega la fuerza a la semana: en un día suave (o después de la bici de
 * calidad), nunca la víspera de la sesión larga o de una clave, ni el día
 * siguiente a la larga, y con al menos un día entre una y otra. En la
 * puesta a punto, nada en los últimos 5 días antes del evento.
 */
/** Días de descanso total y de recuperación corta después de un evento (ver rules.ts). */
const restAfter = (x: GoalWindow) => restAfterDays(x.goal.stageDays)
const easyAfter = (x: GoalWindow) => easyAfterDays(x.goal.stageDays)

function addStrength(f: {
  plan: PlanSlot[]
  days: string[]
  free: number[]
  cap: number[]
  phase: Phase
  win: GoalWindow | null
  wins: GoalWindow[]
  minutes: number
}) {
  const { plan, days, free, cap, phase, wins } = f
  const light = phase === 'recovery' || phase === 'return'
  const n = strengthPerWeek(phase)
  if (n === 0) return
  const minutes = light ? 25 : phase === 'taper' || phase === 'recovery_week' ? Math.min(30, f.minutes) : f.minutes
  const at = (i: number) => plan.filter((p) => p.i === i)
  const isLong = (i: number) => at(i).some((p) => p.kind === 'long')
  const isKey = (i: number) => at(i).some((p) => KEY_KINDS.includes(p.kind) && !(p.sport === 'cycling' && p.kind !== 'long' && p.kind !== 'event'))
  const used = (i: number) => at(i).reduce((s, p) => s + p.minutes, 0)
  // La sesión larga principal de la semana (48 h de margen después de ella)
  const mainLong = plan.filter((p) => p.kind === 'long').sort((x, y) => y.minutes - x.minutes)[0]?.i
  const easyOf = (i: number) => at(i).filter((p) => p.kind === 'easy' || p.kind === 'recovery')

  // Cuánto cabe: tal cual, recortando un suave (mínimo 30 min), o en lugar de un suave corto (no natación)
  function fit(i: number): { how: 'free' | 'trim' | 'replace'; min: number } | null {
    const left = cap[i] - used(i)
    if (left >= minutes) return { how: 'free', min: minutes }
    const trimmable = Math.max(0, ...easyOf(i).map((p) => p.minutes - 30))
    if (left + trimmable >= minutes) return { how: 'trim', min: minutes }
    const one = at(i)
    // Reemplazar un suave solo si quedan al menos 4 sesiones de resistencia en la semana
    const endurance = plan.filter((p) => p.sport !== 'strength').length
    if (one.length === 1 && easyOf(i).length === 1 && one[0].sport !== 'swimming' && cap[i] >= minutes && endurance > 3) return { how: 'replace', min: minutes }
    // Versión corta (mínimo 20 min) si el día está justo
    if (left + trimmable >= 20) return { how: 'trim', min: left + trimmable }
    return null
  }

  const cand: { i: number; cost: number }[] = []
  for (const i of free) {
    // Nada en los 5 días antes de ningún evento, ni en días de evento
    if (wins.some((x) => days[i] < x.eventStart && daysBetween(days[i], x.eventStart) <= PLAN_RULES.noStrengthBeforeEvent)) continue
    if (wins.some((x) => days[i] >= x.eventStart && days[i] <= x.eventEnd)) continue
    // Ni en la semana siguiente a un evento (10 días si fue de varios días): toca recuperar
    if (wins.some((x) => days[i] > x.eventEnd && daysBetween(x.eventEnd, days[i]) <= noStrengthAfter(x.goal.stageDays))) continue
    if (isKey(i) || isLong(i)) continue
    if (i > 0 && i - 1 === mainLong) continue
    // Nunca la víspera de la larga, del evento ni de una clave de running o natación;
    // la víspera de una calidad de bici solo como segunda opción
    const next = i + 1 < 7 ? at(i + 1).filter((p) => KEY_KINDS.includes(p.kind)) : []
    if (next.some((p) => p.kind === 'long' || p.kind === 'event' || p.sport !== 'cycling')) continue
    const f = fit(i)
    if (!f) continue
    const afterLong = i > 0 && isLong(i - 1)
    cand.push({ i, cost: (next.length ? 10 : 0) + (afterLong ? 5 : 0) + (f.min < minutes ? 4 : 0) + { free: 0, trim: 1, replace: 2 }[f.how] })
  }

  // La mejor combinación: el mayor número de sesiones (con un día entre ellas) y el menor costo
  let chosen: number[] = []
  let best = Infinity
  const pick = (from: number, set: { i: number; cost: number }[]) => {
    if (set.length > 0) {
      const score = (n - set.length) * 1000 + set.reduce((t, c) => t + c.cost, 0)
      if (score < best) [best, chosen] = [score, set.map((c) => c.i)]
    }
    if (set.length === n) return
    for (let k = from; k < cand.length; k++) if (set.every((c) => Math.abs(c.i - cand[k].i) >= 2)) pick(k + 1, [...set, cand[k]])
  }
  pick(0, [])

  for (const i of chosen) {
    // (puede que ya no quepa: un reemplazo anterior bajó las sesiones de resistencia)
    const f = fit(i)
    if (!f) continue
    const short = f.min - (cap[i] - used(i))
    if (f.how === 'trim' && short > 0) {
      const easy = easyOf(i).sort((x, y) => y.minutes - x.minutes)[0]
      easy.minutes -= short
    } else if (f.how === 'replace') plan.splice(plan.indexOf(at(i)[0]), 1)
    plan.push({ i, sport: 'strength', kind: 'strength', minutes: f.min, note: light ? 'mobility' : undefined })
  }

  // Core corto (~20 min) en días suaves: complementa sin cansar las piernas
  let nCore = PLAN_RULES.corePerWeek[phase] ?? 0
  const coreDays = free
    .filter((i) => !chosen.includes(i) && !at(i).some((p) => p.sport === 'strength'))
    .filter(
      (i) => !wins.some((x) => days[i] >= addDays(x.eventStart, -PLAN_RULES.noCoreBeforeEvent) && days[i] <= addDays(x.eventEnd, restAfter(x) + easyAfter(x))),
    )
    .filter((i) => !isLong(i) && !at(i).some((p) => KEY_KINDS.includes(p.kind) && p.sport !== 'cycling'))
    .filter((i) => !(i + 1 < 7 && at(i + 1).some((p) => p.kind === 'long' || p.kind === 'event')))
    .filter((i) => cap[i] - used(i) >= PLAN_RULES.coreMin || easyOf(i).some((p) => p.minutes >= 25 + PLAN_RULES.coreMin))
    .sort(
      (x, y) =>
        Number(at(y).some((p) => p.kind === 'easy' || p.kind === 'recovery')) - Number(at(x).some((p) => p.kind === 'easy' || p.kind === 'recovery')) || x - y,
    )
  for (const i of coreDays) {
    if (nCore <= 0) break
    if (plan.some((p) => p.note === 'core' && Math.abs(p.i - i) < 2)) continue
    if (cap[i] - used(i) < PLAN_RULES.coreMin) easyOf(i).sort((x, y) => y.minutes - x.minutes)[0].minutes -= PLAN_RULES.coreMin
    plan.push({ i, sport: 'strength', kind: 'strength', minutes: PLAN_RULES.coreMin, note: 'core' })
    nCore--
  }
}

function finishWeek(f: {
  plan: PlanSlot[]
  out: SessionDraft[]
  days: string[]
  cap: number[]
  phase: Phase
  win: GoalWindow | null
  wins: GoalWindow[]
  goalId: string | null
  sport: Sport
  a: { target: number; easyFirstDays: number; today: string }
}): SessionDraft[] {
  const { plan, out, days, cap, phase, wins, goalId, sport, a } = f
  // Antes del evento (aunque caiga en la semana anterior): activación dos días
  // antes y víspera muy suave
  // (de cualquier meta: la más cercana después de ese día)
  if (wins.length) {
    for (const p of plan) {
      const ahead = wins.map((x) => daysBetween(days[p.i], x.eventStart)).filter((n) => n > 0)
      const toEvent = ahead.length ? Math.min(...ahead) : 99
      const others = plan.filter((q) => q !== p && q.i === p.i).reduce((t, q) => t + q.minutes, 0)
      const room = Math.max(20, cap[p.i] - others)
      if (toEvent === 1) Object.assign(p, { kind: 'recovery', minutes: Math.min(30, room), note: 'day_before' })
      else if (toEvent === 2 && p.sport === sport) Object.assign(p, { kind: 'openers', minutes: Math.min(50, room), note: 'openers' })
    }
  }

  // Después de un evento: unos días de recuperación corta (no se alarga con el volumen)
  for (const p of plan) {
    const after = wins.find((x) => days[p.i] > x.eventEnd && daysBetween(x.eventEnd, days[p.i]) <= restAfter(x) + easyAfter(x))
    if (after && p.kind !== 'event')
      Object.assign(p, { kind: 'recovery', minutes: Math.min(PLAN_RULES.recoveryMaxMin, p.minutes, cap[p.i]), note: 'after_event' })
  }
  // Si entre dos metas la recuperación se llevó la activación, se recupera más adelante en la semana
  if (phase === 'taper' && !plan.some((p) => p.kind === 'openers' || p.kind === 'tempo' || p.kind === 'threshold')) {
    const next = plan.filter((p) => p.kind === 'easy' && p.sport === sport && !p.note).sort((x, y) => x.i - y.i)[0]
    if (next) Object.assign(next, { kind: 'openers', minutes: Math.min(60, cap[next.i]) })
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
  // La fuerza cansa menos que pedalear o correr al mismo tiempo: ~0,5 puntos de carga por minuto
  const drafts = plan.map((p) =>
    session(days[p.i], p.sport, p.kind, p.minutes, goalId, phase, p.note, p.kind === 'strength' ? p.minutes * PLAN_RULES.strengthLoadPerMin : undefined),
  )
  const flexible = drafts.filter((d) => (d.kind === 'easy' || d.kind === 'long' || d.kind === 'recovery') && d.note !== 'brick' && d.note !== 'after_event')
  const rigid = drafts.filter((d) => !flexible.includes(d))
  const rigidLoad = rigid.reduce((s, x) => s + x.load, 0)
  const flexLoad = flexible.reduce((s, x) => s + x.load, 0)
  const wanted = a.target - fixed - rigidLoad
  const factor = flexLoad > 0 ? Math.min(1.6, Math.max(0.5, wanted / flexLoad)) : 1
  const scaled = flexible.map((d) => {
    const i = days.indexOf(d.date)
    // Lo que queda del día después de las demás sesiones (p. ej. la fuerza)
    const others = drafts.filter((x) => x !== d && x.date === d.date).reduce((s, x) => s + x.durationMin, 0)
    // La larga no se estira para completar carga: solo crece con su progresión, y tiene tope por deporte
    if (d.kind === 'long') {
      const max = Math.min(d.durationMin, PLAN_RULES.longMaxMin[d.sport] ?? 300, cap[i] - others)
      return session(d.date, d.sport, d.kind, Math.max(20, Math.min(max, d.durationMin * Math.min(1, factor))), goalId, phase, d.note)
    }
    const minutes = Math.max(30, Math.min(Math.max(30, cap[i] - others), d.durationMin * factor))
    return session(d.date, d.sport, d.kind, minutes, goalId, phase, d.note)
  })

  // Nunca más que el tiempo del día: si dos sesiones flexibles se alargaron, se recortan
  for (const d of new Set(scaled.map((x) => x.date))) {
    const i = days.indexOf(d)
    if (cap[i] <= 0) continue
    const dayAll = [...rigid, ...scaled].filter((x) => x.date === d)
    let excess = dayAll.reduce((t, x) => t + x.durationMin, 0) - cap[i]
    for (const x of scaled.filter((y) => y.date === d).sort((u, v) => v.durationMin - u.durationMin)) {
      if (excess <= 0) break
      const cut = Math.min(excess, x.durationMin - 15)
      if (cut <= 0) continue
      const k = scaled.indexOf(x)
      scaled[k] = session(x.date, x.sport, x.kind, x.durationMin - cut, goalId, phase, x.note)
      excess -= x.durationMin - scaled[k].durationMin
    }
  }

  // Último control: si aún se pasa del tiempo del día, se quita primero el core corto
  const finalRigid = rigid.filter((x) => {
    if (x.note !== 'core') return true
    const i = days.indexOf(x.date)
    const tot = [...rigid, ...scaled].filter((y) => y.date === x.date).reduce((t, y) => t + y.durationMin, 0)
    return tot <= cap[i]
  })

  // Orden del día: natación → bici → running (como en carrera y en las combinadas); gimnasio al final
  const rank = (x: SessionDraft) =>
    x.sport === 'strength' ? 9 : x.note === 'brick' ? 5 : (({ swimming: 1, cycling: 2, running: 3 } as Record<string, number>)[x.sport] ?? 4)
  return [...out, ...finalRigid, ...scaled].sort((x, y) => x.date.localeCompare(y.date) || rank(x) - rank(y))
}
