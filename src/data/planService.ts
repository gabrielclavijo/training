import { DEFAULT_STRENGTH, type StrengthPrefs } from '../core/strength/library'
import { addDays, daysBetween, localDayKey, weekStart } from '../core/dates'
import { estimateLeg, LEG_SPORT, legShares, legStatus, presetInfo, TRI_LEGS, type LegDiagnosis, type TriLeg } from '../core/triathlon'
import { referenceLegTimes, type TriLegs } from '../core/triathlon'
import { dailyLoads, fitnessSeries, snapshot } from '../core/fitness'
import { decideAdjustment, matchSessions, planDiffers, type ChangeReason, type DoneLike, type MatchResult, type PlanChange } from '../core/planner/adapt'
import { diagnose, estimateTime, goalDemand, type Diagnosis, type PastEffort, type TimeEstimate } from '../core/planner/diagnosis'
import { generatePlan, isoWeekday, type Availability, type PlanGoal, type PlanPause, type SportMix, type Weekday } from '../core/planner/plan'
import { zoneSet, type ZoneSet } from '../core/planner/zones'
import { goalEstimatedHours, goalTotals } from '../features/goals/goalUtils'
import { loadsFor, physiologyOn, TIMEZONE, type ActivityWithLoad, takesHrMedication } from './analysis'
import type { Repo } from './repo'
import type { Activity, CurrentPlan, Goal, HealthRecord, Pause, PhysiologyEntry, Profile, StoredSession } from './types'
import { ageOn } from '../core/dates'

/**
 * Une los datos de la persona con el planificador: genera o ajusta el plan,
 * lo guarda solo cuando cambia (con la explicación) y calcula el diagnóstico
 * de cada meta. Todo con reglas; nada se envía a IA.
 */

export const DEFAULT_AVAILABILITY: Availability = {
  minutesByDay: { 1: 0, 2: 60, 3: 60, 4: 60, 5: 0, 6: 150, 7: 90 },
  longDay: 6,
}

export interface PlanContext {
  today: string
  activities: Activity[]
  loaded: ActivityWithLoad[]
  goals: Goal[]
  pauses: Pause[]
  physiology: PhysiologyEntry[]
  profile: Profile | null
  health: HealthRecord[]
  availability: Availability
  availabilityIsDefault: boolean
  /** «Tu fuerza» (valores por defecto si no ha respondido) */
  strength: StrengthPrefs
  strengthIsDefault: boolean
}

export async function loadContext(repo: Repo, health: HealthRecord[] = []): Promise<PlanContext> {
  const [activities, goals, pauses, physiology, profile, availability, strength] = await Promise.all([
    repo.listActivities(),
    repo.listGoals(),
    repo.listPauses(),
    repo.listPhysiology(),
    repo.getProfile(),
    repo.getAvailability(),
    repo.getStrengthPrefs(),
  ])
  const loaded = loadsFor(activities, { physiology, profile, health })
  const today = localDayKey(new Date())
  return {
    today,
    activities,
    loaded,
    goals,
    pauses,
    physiology,
    profile,
    health,
    availability: availability ?? suggestAvailability(loaded, today),
    availabilityIsDefault: !availability,
    strength: strength ?? DEFAULT_STRENGTH,
    strengthIsDefault: !strength,
  }
}

/** Disponibilidad sugerida a partir de las últimas 8 semanas (o una por defecto). */
export function suggestAvailability(loaded: ActivityWithLoad[], today: string): Availability {
  const from = addDays(today, -56)
  const recent = loaded.filter((l) => l.day >= from && l.day < today)
  if (recent.length < 6) return DEFAULT_AVAILABILITY
  const minutes: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }
  const byDay = new Map<string, number>()
  for (const l of recent) byDay.set(l.day, (byDay.get(l.day) ?? 0) + (l.activity.movingS || l.activity.elapsedS) / 60)
  for (let i = 0; i < 56; i++) {
    const d = addDays(from, i)
    minutes[isoWeekday(d)].push(byDay.get(d) ?? 0)
  }
  const minutesByDay = Object.fromEntries(
    Object.entries(minutes).map(([k, v]) => {
      const trained = v.filter((x) => x > 0)
      // Se considera día de entreno si se usó al menos 3 de las 8 semanas
      const val = trained.length >= 3 ? Math.ceil(Math.max(...trained) / 15) * 15 : 0
      return [k, Math.min(300, val)]
    }),
  ) as Availability['minutesByDay']
  const longDay = (Object.entries(minutesByDay).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '6') as unknown as Weekday
  return { minutesByDay, longDay: Number(longDay) as Weekday }
}

export function toPlanGoal(g: Goal): PlanGoal {
  const tot = goalTotals(g)
  return {
    id: g.id,
    name: g.name,
    sport: g.sport,
    subSport: g.subSport,
    goalType: g.goalType,
    objective: g.objective,
    priority: g.priority,
    eventDate: g.eventDate,
    estimatedHours: goalEstimatedHours(g),
    stageDays: g.goalType === 'stage' ? Math.max(1, ...g.stages.map((s) => s.dayOffset + 1)) : 1,
    targetTimeS: g.targetTimeS,
    elevationPerKm: tot.distanceM > 0 ? tot.elevationGainM / (tot.distanceM / 1000) : 0,
    triMinutes: g.sport === 'triathlon' && g.legs ? triLegMinutes(g.legs) : undefined,
  }
}

/** Minutos de cada tramo: el objetivo si lo hay; si no, la duración de referencia. */
export function triLegMinutes(l: TriLegs) {
  const ref = referenceLegTimes(l)
  return { swim: (l.swimS ?? ref.swim) / 60, bike: (l.bikeS ?? ref.bike) / 60, run: (l.runS ?? ref.run) / 60 }
}

export function toPlanPause(p: Pause): PlanPause {
  return { kind: p.kind, startsOn: p.startsOn, endsOn: p.endsOn, canTrain: p.canTrain, available: p.available, minutesPerDay: p.minutesPerDay }
}

function sportMix(loaded: ActivityWithLoad[], today: string): SportMix {
  const from = addDays(today, -56)
  const t = { cycling: 0, running: 0, swimming: 0, strength: 0 }
  for (const l of loaded) {
    if (l.day < from || l.day >= today) continue
    const s = l.activity.sport
    if (s in t) t[s as keyof typeof t] += l.activity.movingS || l.activity.elapsedS
  }
  const total = Object.values(t).reduce((a, b) => a + b, 0)
  if (total === 0) return { cycling: 0.7, running: 0.1, swimming: 0, strength: 0.2 }
  return { cycling: t.cycling / total, running: t.running / total, swimming: t.swimming / total, strength: t.strength / total }
}

function fitnessNow(loaded: ActivityWithLoad[], today: string) {
  const { map } = dailyLoads(loaded.map((l) => ({ day: l.day, load: l.load.load })))
  const series = fitnessSeries(map, today)
  const snap = snapshot(series)
  const last21 = [...map.entries()].filter(([d]) => d >= addDays(today, -21) && d < today).reduce((s, [, v]) => s + v, 0)
  const last7 = [...map.entries()].filter(([d]) => d >= addDays(today, -7) && d < today).reduce((s, [, v]) => s + v, 0)
  return { ctl: snap?.ctl ?? 0, tsb: snap ? snap.tsb : null, historyDays: snap?.historyDays ?? 0, weekly: last21 / 3, last7 }
}

export function capacityLoad(a: Availability) {
  return (Object.values(a.minutesByDay).reduce((x, y) => x + y, 0) / 60) * 55
}

/** Huella de lo que, si cambia, obliga a rehacer el plan: «metas.pausas.disponibilidad». */
/** Sube cuando cambian las reglas del plan: así se recalcula el plan de todos. */
const PLANNER_VERSION = 'p4'

function inputsHash(ctx: PlanContext) {
  const h = (v: unknown) => {
    const s = JSON.stringify(v)
    let x = 0
    for (let i = 0; i < s.length; i++) x = (Math.imul(31, x) + s.charCodeAt(i)) | 0
    return (x >>> 0).toString(36)
  }
  const goals = ctx.goals
    .filter((g) => g.status === 'active')
    .map((g) => [g.id, g.eventDate, g.priority, g.goalType, g.objective, g.targetTimeS, g.distanceM, g.elevationGainM, g.stages.length, g.legs ?? null])
  const pauses = ctx.pauses.map((p) => [p.kind, p.startsOn, p.endsOn, p.canTrain, p.available, p.minutesPerDay])
  return `${h(goals)}.${h(pauses)}.${h(ctx.availability)}.${h(strengthInput(ctx.strength))}.${PLANNER_VERSION}`
}

/** Lo que el plan necesita de «Tu fuerza»: si va y cuánto dura una sesión. */
export function strengthInput(p: StrengthPrefs) {
  return { enabled: p.enabled, minutes: p.experience === 'new' ? 30 : p.experience === 'some' ? 40 : 45 }
}

export function doneLike(loaded: ActivityWithLoad[]): DoneLike[] {
  return loaded.map((l) => ({
    id: l.activity.id,
    day: l.day,
    sport: l.activity.sport,
    durationS: l.activity.movingS || l.activity.elapsedS,
    load: l.load.load,
  }))
}

export function sessionMatches(plan: CurrentPlan, loaded: ActivityWithLoad[], today: string): Map<string, MatchResult> {
  return matchSessions(
    plan.sessions.map((s) => ({ id: s.id, date: s.date, sport: s.sport, kind: s.kind, durationMin: s.durationMin, plannedLoad: s.plannedLoad })),
    doneLike(loaded),
    today,
  )
}

/**
 * Recalcula el plan y lo guarda si cambió. Devuelve el plan vigente.
 * Se llama al abrir el plan, tras importar actividades o al cambiar metas,
 * pausas o disponibilidad.
 */
export async function refreshPlan(
  repo: Repo,
  opts: { health?: HealthRecord[]; isDemo?: boolean; reason?: ChangeReason } = {},
): Promise<{ plan: CurrentPlan; ctx: PlanContext; changed: boolean }> {
  const ctx = await loadContext(repo, opts.health)
  const current = await repo.getCurrentPlan()
  const today = ctx.today
  const fit = fitnessNow(ctx.loaded, today)
  const activeGoals = ctx.goals.filter((g) => g.status === 'active')

  // Ajuste por lo que pasó los últimos 7 días (solo si ya había un plan)
  const matches = sessionMatches(current, ctx.loaded, today)
  const adjustment = current.plan
    ? decideAdjustment({
        today,
        sessions: current.sessions.map((s) => ({
          id: s.id,
          date: s.date,
          sport: s.sport,
          kind: s.kind,
          durationMin: s.durationMin,
          plannedLoad: s.plannedLoad,
        })),
        matches,
        actualLoadLast7: fit.last7,
        tsb: fit.tsb,
      })
    : null

  const mainSport = activeGoals[0]?.sport === 'triathlon' ? 'cycling' : (activeGoals[0]?.sport ?? 'cycling')
  const longestRecentMin = Math.max(
    0,
    ...ctx.loaded.filter((l) => l.activity.sport === mainSport && l.day >= addDays(today, -56)).map((l) => (l.activity.movingS || l.activity.elapsedS) / 60),
  )

  const out = generatePlan({
    today,
    goals: activeGoals.map(toPlanGoal),
    availability: ctx.availability,
    mix: sportMix(ctx.loaded, today),
    ctl: fit.ctl,
    recentWeeklyLoad: fit.weekly,
    longestRecentMin,
    pauses: ctx.pauses.map(toPlanPause),
    adjustment: adjustment && adjustment.reasons[0] !== 'on_plan' ? adjustment : undefined,
    strength: strengthInput(ctx.strength),
  })

  const hash = inputsHash(ctx)
  const futureOld = current.weeks
    .filter((w) => w.weekStart >= weekStart(today))
    .map((w) => ({
      weekStart: w.weekStart,
      targetLoad: w.targetLoad,
      sessions: current.sessions
        .filter((s) => s.date >= w.weekStart && s.date <= addDays(w.weekStart, 6) && s.date >= today)
        .map((s) => ({ date: s.date, sport: s.sport, kind: s.kind, durationMin: s.durationMin })),
    }))
  const newFuture = out.weeks.map((w) => ({ ...w, sessions: w.sessions.filter((s) => s.date >= today) }))
  const inputsChanged = current.plan?.inputsHash !== hash
  const differs = planDiffers(futureOld as never, newFuture)

  if (!current.plan || (differs && (inputsChanged || adjustment?.reasons[0] !== 'on_plan' || isNewWeek(current, today)))) {
    const reason: ChangeReason = !current.plan
      ? 'initial'
      : (opts.reason ?? (inputsChanged ? whatChanged(current, hash) : adjustment && adjustment.reasons[0] !== 'on_plan' ? adjustment.reasons[0] : 'weekly'))
    const changes: PlanChange[] = [{ reason, params: { ...(adjustment?.params ?? {}), weekLoad: out.weeks[0]?.targetLoad ?? 0 } }]
    if (adjustment && reason !== adjustment.reasons[0])
      for (const r of adjustment.reasons) if (r !== 'on_plan') changes.push({ reason: r, params: adjustment.params })
    await repo.savePlan({ reason, inputsHash: hash, weeks: out.weeks, fromDay: today, changes, isDemo: Boolean(opts.isDemo) })
    return { plan: await repo.getCurrentPlan(), ctx, changed: true }
  }
  return { plan: current, ctx, changed: false }
}

function isNewWeek(current: CurrentPlan, today: string) {
  return current.plan ? weekStart(current.plan.createdAt.slice(0, 10)) < weekStart(today) : true
}

function whatChanged(current: CurrentPlan, hash: string): ChangeReason {
  const [g0, p0, a0] = (current.plan?.inputsHash ?? '..').split('.')
  const [g1, p1, a1] = hash.split('.')
  if (p0 !== p1) return 'pause'
  if (g0 !== g1) return 'goals_changed'
  if (a0 !== a1) return 'availability'
  return 'weekly'
}

// ---------------------------------------------------------------------------
// Diagnóstico por meta (para mostrar; no se guarda)
// ---------------------------------------------------------------------------

export interface GoalDiagnosis {
  goalId: string
  diagnosis: Diagnosis
  estimate: TimeEstimate | null
  targetTimeS: number | null
  /** Solo con objetivo de tiempo: cómo va el tiempo estimado frente al objetivo */
  timeStatus: 'on_track' | 'tight' | 'behind' | null
  /** Solo triatlón: diagnóstico y tiempo estimado por disciplina */
  tri?: { legs: LegDiagnosis[]; weakest: TriLeg | null; estimateS: number | null; cutoffS: number | null }
}

const ORDER = { on_track: 0, tight: 1, behind: 2, past: 3 } as const

export function diagnoseGoals(ctx: PlanContext): GoalDiagnosis[] {
  const today = ctx.today
  const fit = fitnessNow(ctx.loaded, today)
  const maxWeekly = capacityLoad(ctx.availability)
  const efforts: PastEffort[] = ctx.loaded.map((l) => ({
    sport: l.activity.sport,
    subSport: l.activity.subSport,
    day: l.day,
    movingS: l.activity.movingS || l.activity.elapsedS,
    distanceM: l.activity.distanceM ?? 0,
    elevationM: l.activity.elevationGainM ?? 0,
  }))
  return ctx.goals
    .filter((g) => g.status === 'active')
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
    .map((g) => {
      const pg = toPlanGoal(g)
      const pauseDays = ctx.pauses
        .filter((p) => p.kind === 'illness' || p.kind === 'injury' || p.canTrain === false)
        .reduce((s, p) => {
          const end = p.endsOn ?? p.startsOn
          if (p.startsOn > g.eventDate || end < today) return s
          const from = p.startsOn < today ? today : p.startsOn
          const to = end > g.eventDate ? g.eventDate : end
          return s + Math.max(0, daysBetween(from, to) + 1)
        }, 0)
      // La forma recomendada se mide con el criterio de «terminar» (aguantar el
      // evento); si hay objetivo de tiempo, eso se evalúa con el tiempo estimado.
      const base = { today, currentCtl: fit.ctl, historyDays: fit.historyDays, maxWeeklyLoad: maxWeekly, pauseDaysBeforeEvent: pauseDays }
      let diagnosis = diagnose({ ...base, goal: { ...pg, objective: 'finish' } })
      const stages =
        g.goalType === 'stage' && g.stages.length
          ? g.stages.map((s) => ({ distanceM: s.distanceM, elevationM: s.elevationGainM, terrain: s.terrain ?? g.terrain }))
          : [{ distanceM: g.distanceM ?? 0, elevationM: g.elevationGainM ?? 0, terrain: g.terrain }]
      const estimate =
        g.objective === 'time' && stages.every((s) => s.distanceM > 0)
          ? estimateTime({ sport: g.sport, stages, efforts, today, ctlNow: fit.ctl, ctlAtEvent: diagnosis.projectedCtl })
          : null
      let timeStatus: GoalDiagnosis['timeStatus'] = null
      if (g.objective === 'time' && g.targetTimeS) {
        if (estimate) {
          const r = estimate.seconds / g.targetTimeS
          timeStatus = r <= 1 ? 'on_track' : r <= 1.05 ? 'tight' : 'behind'
          if (diagnosis.status !== 'past' && ORDER[timeStatus] > ORDER[diagnosis.status]) {
            const suggestions = [
              ...new Set<Diagnosis['suggestions'][number]>(['finish_only', ...diagnosis.suggestions.filter((x) => x !== 'keep_going'), 'lower_demand']),
            ]
            diagnosis = { ...diagnosis, status: timeStatus, suggestions }
          }
        } else {
          // Sin salidas parecidas no se puede estimar el tiempo: se usa el criterio más exigente
          diagnosis = diagnose({ ...base, goal: pg })
        }
      }
      if (g.sport === 'triathlon' && g.legs) {
        const tri = diagnoseTriathlon(g.legs, diagnosis, ctx, efforts, today)
        tri.cutoffS = presetInfo(g.triPreset)?.cutoffS ?? null
        let ts: GoalDiagnosis['timeStatus'] = null
        if (g.objective === 'time' && g.targetTimeS && tri.estimateS) {
          const r = tri.estimateS / g.targetTimeS
          ts = r <= 1 ? 'on_track' : r <= 1.05 ? 'tight' : 'behind'
        }
        // El estado general no puede ser mejor que el de la disciplina más atrasada
        const worst = tri.legs.reduce<'on_track' | 'tight' | 'behind'>(
          (w, l) => (l.status === 'behind' ? 'behind' : l.status === 'tight' && w === 'on_track' ? 'tight' : w),
          'on_track',
        )
        let d2 = diagnosis
        for (const st of [ts, worst]) if (st && d2.status !== 'past' && ORDER[st] > ORDER[d2.status]) d2 = { ...d2, status: st }
        return { goalId: g.id, diagnosis: d2, estimate: null, targetTimeS: g.targetTimeS, timeStatus: ts, tri }
      }
      return { goalId: g.id, diagnosis, estimate, targetTimeS: g.targetTimeS, timeStatus }
    })
}

/**
 * Triatlón: forma de cada disciplina (CTL solo con sus actividades) frente a su
 * parte de la forma recomendada (según el peso del tramo en la carrera), y el
 * tiempo estimado de cada tramo con sus actividades de referencia.
 */
function diagnoseTriathlon(legs: TriLegs, d: Diagnosis, ctx: PlanContext, efforts: PastEffort[], today: string) {
  const shares = legShares(legs)
  const grow = d.currentCtl > 0 ? d.projectedCtl / d.currentCtl : 1
  const gain = d.currentCtl > 0 ? (d.projectedCtl / d.currentCtl) ** 0.15 : 1
  const out: LegDiagnosis[] = TRI_LEGS.map((leg) => {
    const sport = LEG_SPORT[leg]
    const ctl = fitnessNow(
      ctx.loaded.filter((l) => l.activity.sport === sport),
      today,
    ).ctl
    const targetCtl = Math.max(5, Math.round(d.targetCtl * shares[leg]))
    const projectedCtl = Math.round(ctl * grow)
    const pct = Math.round((projectedCtl / targetCtl) * 100)
    const dist = leg === 'swim' ? legs.swimM : leg === 'bike' ? legs.bikeM : legs.runM
    const est = estimateLeg({ leg, distanceM: dist, efforts, today, gain })
    return {
      leg,
      ctl: Math.round(ctl),
      projectedCtl,
      targetCtl,
      pct,
      status: legStatus(pct, ctl),
      estimateS: est?.seconds ?? null,
      targetS: (leg === 'swim' ? legs.swimS : leg === 'bike' ? legs.bikeS : legs.runS) ?? null,
    }
  })
  const weakest = [...out].sort((a, b) => (a.status === 'no_data' ? -1 : b.status === 'no_data' ? 1 : a.pct - b.pct))[0]
  const estimateS = out.every((l) => l.estimateS) ? out.reduce((a, l) => a + (l.estimateS ?? 0), 0) : null
  return { legs: out, weakest: weakest && (weakest.status !== 'on_track' ? weakest.leg : null), estimateS, cutoffS: null as number | null }
}

export { goalDemand }

/** Zonas de la persona para mostrar las sesiones. */
export function zonesFor(ctx: Pick<PlanContext, 'physiology' | 'profile' | 'activities'> & { health?: PlanContext['health'] }, today: string): ZoneSet {
  const ph = physiologyOn(ctx.physiology, today)
  const rides = ctx.activities.filter((a) => a.sport === 'cycling').slice(0, 20)
  const usesPowerMeter = rides.length > 0 && rides.filter((a) => a.hasPower).length / rides.length >= 0.5
  return zoneSet({
    ftpW: ph?.ftpW,
    hrThreshold: ph?.hrThreshold,
    hrMax: ph?.hrMax,
    hrMaxSource: ph?.hrMaxSource,
    hrRest: ph?.hrRest,
    ageYears: ctx.profile?.birthDate ? ageOn(ctx.profile.birthDate, today) : null,
    usesPowerMeter,
    hrMedication: takesHrMedication(ctx.health ?? []),
  })
}

export function sessionsOfDay(plan: CurrentPlan, day: string): StoredSession[] {
  return plan.sessions.filter((s) => s.date === day)
}

export { TIMEZONE }
