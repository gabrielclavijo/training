import { describe, expect, it } from 'vitest'
import { addDays, weekStart } from '../dates'
import { estimateHours } from '../season'
import { decideAdjustment, matchSessions, planDiffers, type PlannedLike } from './adapt'
import { diagnose, estimateTime, goalDemand, type PastEffort } from './diagnosis'
import { generatePlan, isoWeekday, returnProtocol, type PlanGoal, type PlanInput, type PlanPause } from './plan'
import { zoneSet, zoneTarget } from './zones'

const today = '2026-11-23' // lunes
const gravel: PlanGoal = {
  id: 'gravel',
  name: 'Gravel de la Sabana',
  sport: 'cycling',
  subSport: 'gravel',
  goalType: 'single',
  objective: 'finish',
  priority: 'secondary',
  eventDate: addDays(today, 84),
  estimatedHours: estimateHours('cycling', 120_000, 2200, 'unpaved'),
  stageDays: 1,
  targetTimeS: null,
  elevationPerKm: 2200 / 120,
}
const vuelta: PlanGoal = {
  id: 'vuelta',
  name: 'Vuelta de 3 días',
  sport: 'cycling',
  subSport: 'road',
  goalType: 'stage',
  objective: 'time',
  priority: 'primary',
  eventDate: addDays(today, 168),
  estimatedHours: 15,
  stageDays: 3,
  targetTimeS: 15 * 3600,
  elevationPerKm: 5600 / 315,
}
const week7 = addDays(weekStart(today), 42)
const travel: PlanPause = { kind: 'travel', startsOn: week7, endsOn: addDays(week7, 4), canTrain: true, available: ['gym'], minutesPerDay: 45 }

const base: PlanInput = {
  today,
  goals: [gravel, vuelta],
  availability: { minutesByDay: { 1: 0, 2: 60, 3: 75, 4: 50, 5: 0, 6: 240, 7: 90 }, longDay: 6 },
  mix: { cycling: 0.65, running: 0.15, swimming: 0, strength: 0.2 },
  ctl: 40,
  recentWeeklyLoad: 300,
  longestRecentMin: 135,
  pauses: [travel],
}

describe('plan de temporada (caso de prueba)', () => {
  const { weeks } = generatePlan(base)
  const allSessions = weeks.flatMap((w) => w.sessions)

  it('cubre la temporada completa hasta la recuperación de la Vuelta', () => {
    expect(weeks[0].weekStart).toBe(today)
    const vueltaEvent = weeks.find((w) => w.phase === 'event' && w.goalId === 'vuelta')!
    expect(vueltaEvent).toBeTruthy()
    expect(weeks.at(-1)!.phase).toBe('recovery')
  })

  it('el Gravel es secundaria: disminución corta, evento y luego sigue la preparación de la Vuelta', () => {
    const ev = allSessions.filter((s) => s.kind === 'event' && s.goalId === 'gravel')
    expect(ev).toHaveLength(1)
    expect(ev[0].date).toBe(gravel.eventDate)
    const gWeeks = weeks.filter((w) => w.goalId === 'gravel')
    expect(gWeeks.filter((w) => w.phase === 'taper').length).toBeLessThanOrEqual(1)
    expect(weeks.find((w) => w.phase === 'event' && w.goalId === 'gravel')!.notes).toContain('secondary_as_training')
    const afterGravel = weeks.filter((w) => w.weekStart > gravel.eventDate)
    expect(afterGravel.some((w) => w.goalId === 'vuelta' && w.phase === 'build')).toBe(true)
  })

  it('la salida larga crece hasta unas 4 horas antes del Gravel', () => {
    const longs = allSessions.filter((s) => s.kind === 'long' && s.date < gravel.eventDate).map((s) => s.durationMin)
    expect(Math.max(...longs)).toBeGreaterThanOrEqual(200)
    expect(Math.max(...longs)).toBeLessThanOrEqual(240) // tope de la disponibilidad del sábado
  })

  it('viaje de la semana 7: solo gimnasio de hotel, máximo 45 min', () => {
    const tripDays = allSessions.filter((s) => s.date >= travel.startsOn && s.date <= travel.endsOn!)
    expect(tripDays.length).toBeGreaterThan(0)
    expect(tripDays.every((s) => s.sport === 'strength' && s.note === 'hotel_gym' && s.durationMin <= 45)).toBe(true)
    expect(weeks.find((w) => w.weekStart === week7)!.notes).toContain('pause_travel')
  })

  it('Vuelta por etapas: hay fines de semana de días seguidos en la fase de desarrollo', () => {
    expect(allSessions.some((s) => s.note === 'back_to_back' && s.goalId === 'vuelta')).toBe(true)
    const stageDays = allSessions.filter((s) => s.kind === 'event' && s.goalId === 'vuelta')
    expect(stageDays.map((s) => s.date)).toEqual([vuelta.eventDate, addDays(vuelta.eventDate, 1), addDays(vuelta.eventDate, 2)])
  })

  it('reglas de seguridad: descanso semanal, subida ≤ ~10 % y semana de descarga cada 4', () => {
    for (const w of weeks) {
      const trainingDays = new Set(w.sessions.filter((s) => s.kind !== 'rest').map((s) => s.date))
      expect(trainingDays.size).toBeLessThanOrEqual(6)
    }
    const loading = weeks.filter((w) => w.phase === 'build' || w.phase === 'base')
    for (let i = 1; i < loading.length; i++) {
      if (addDays(loading[i - 1].weekStart, 7) === loading[i].weekStart) {
        expect(loading[i].targetLoad).toBeLessThanOrEqual(Math.ceil(loading[i - 1].targetLoad * 1.1) + 1)
      }
    }
    expect(weeks.some((w) => w.phase === 'recovery_week')).toBe(true)
  })

  it('la disminución previa a la Vuelta (principal) baja la carga', () => {
    const taper = weeks.filter((w) => w.goalId === 'vuelta' && w.phase === 'taper')
    const peak = Math.max(...weeks.filter((w) => w.goalId === 'vuelta' && w.phase === 'build').map((w) => w.targetLoad))
    expect(taper.length).toBeGreaterThanOrEqual(1)
    expect(taper.every((w) => w.targetLoad < peak * 0.8)).toBe(true)
    const dayBefore = allSessions.find((s) => s.date === addDays(vuelta.eventDate, -1))
    if (dayBefore) expect(dayBefore.kind).toBe('recovery')
  })

  it('combina los deportes que la persona practica', () => {
    const first = weeks.slice(0, 4).flatMap((w) => w.sessions)
    expect(first.some((s) => s.sport === 'strength')).toBe(true)
    expect(first.some((s) => s.sport === 'running')).toBe(true)
    expect(first.filter((s) => s.sport === 'cycling').length).toBeGreaterThan(first.filter((s) => s.sport === 'running').length)
  })

  it('respeta los días sin disponibilidad', () => {
    for (const s of allSessions) {
      if (s.date >= travel.startsOn && s.date <= travel.endsOn!) continue
      if (s.kind === 'event') continue // el evento va en su fecha
      expect([1, 5]).not.toContain(isoWeekday(s.date))
    }
  })
})

describe('pausas por enfermedad o lesión', () => {
  it('regreso gradual según los días parados', () => {
    expect(returnProtocol(2)).toEqual([0.8])
    expect(returnProtocol(10)).toEqual([0.5, 0.75, 0.9])
    expect(returnProtocol(20)).toEqual([0.4, 0.6, 0.75, 0.9])
  })

  it('una lesión de 10 días: descanso y luego semanas de regreso con menos carga', () => {
    const start = addDays(weekStart(today), 21)
    const injury: PlanPause = { kind: 'injury', startsOn: start, endsOn: addDays(start, 9), canTrain: false, available: ['none'], minutesPerDay: 0 }
    const { weeks } = generatePlan({ ...base, pauses: [injury] })
    const during = weeks.flatMap((w) => w.sessions).filter((s) => s.date >= injury.startsOn && s.date <= injury.endsOn!)
    expect(during).toHaveLength(0)
    const ret = weeks.filter((w) => w.notes.includes('return_gradual'))
    expect(ret.length).toBeGreaterThanOrEqual(2)
    const normal = generatePlan({ ...base, pauses: [] }).weeks
    const byWeek = new Map(normal.map((w) => [w.weekStart, w.targetLoad]))
    expect(ret[0].targetLoad).toBeLessThan(byWeek.get(ret[0].weekStart)! * 0.8)
  })
})

describe('diagnóstico por meta', () => {
  it('estima la forma recomendada según la exigencia', () => {
    const g = goalDemand(gravel)
    const v = goalDemand(vuelta)
    expect(g.targetCtl).toBeGreaterThan(35)
    expect(v.targetCtl).toBeGreaterThan(g.targetCtl) // la Vuelta con objetivo de tiempo exige más
  })

  it('va bien / justo / atrasado según la proyección', () => {
    const args = { today, historyDays: 120, maxWeeklyLoad: 600, pauseDaysBeforeEvent: 0 }
    const ok = diagnose({ ...args, goal: gravel, currentCtl: 55 })
    expect(ok.status).toBe('on_track')
    const late = diagnose({ ...args, goal: { ...gravel, eventDate: addDays(today, 14) }, currentCtl: 15 })
    expect(late.status).toBe('behind')
    expect(late.suggestions).toContain('use_as_training')
    const capped = diagnose({ ...args, goal: vuelta, currentCtl: 40, maxWeeklyLoad: 280 })
    expect(capped.limitedBy).toBe('availability')
    expect(capped.suggestions).toEqual(expect.arrayContaining(['finish_only', 'more_time']))
  })

  it('las pausas antes del evento bajan la proyección', () => {
    const args = { today, historyDays: 120, maxWeeklyLoad: 700, goal: vuelta, currentCtl: 40 }
    const a = diagnose({ ...args, pauseDaysBeforeEvent: 0 })
    const b = diagnose({ ...args, pauseDaysBeforeEvent: 14 })
    expect(b.projectedCtl).toBeLessThan(a.projectedCtl)
  })

  it('tiempo estimado con salidas parecidas; sin datos no inventa', () => {
    const efforts: PastEffort[] = [
      { sport: 'cycling', subSport: 'road', day: '2026-11-15', movingS: 3 * 3600, distanceM: 75_000, elevationM: 1100 },
      { sport: 'cycling', subSport: 'road', day: '2026-11-08', movingS: 2.5 * 3600, distanceM: 62_000, elevationM: 800 },
      { sport: 'cycling', subSport: 'gravel', day: '2026-11-01', movingS: 3.5 * 3600, distanceM: 65_000, elevationM: 1200 },
    ]
    const stages = [
      { distanceM: 95_000, elevationM: 1800, terrain: 'paved' },
      { distanceM: 140_000, elevationM: 2600, terrain: 'paved' },
      { distanceM: 80_000, elevationM: 1200, terrain: 'paved' },
    ]
    const est = estimateTime({ sport: 'cycling', stages, efforts, today, ctlNow: 40, ctlAtEvent: 60 })!
    expect(est.seconds / 3600).toBeGreaterThan(11)
    expect(est.seconds / 3600).toBeLessThan(20)
    expect(est.confidence).toBe('low')
    expect(estimateTime({ sport: 'cycling', stages, efforts: efforts.slice(0, 1), today, ctlNow: 40, ctlAtEvent: 60 })).toBeNull()
  })
})

describe('zonas', () => {
  it('con umbral medido no son estimadas; con edad sí', () => {
    expect(zoneSet({ hrThreshold: 165 }).hrEstimated).toBe(false)
    const est = zoneSet({ ageYears: 38 })
    expect(est.hrEstimated).toBe(true)
    expect(est.hrSource).toBe('age')
    const z = zoneTarget(4, zoneSet({ hrThreshold: 165 }), 'cycling')
    expect(z.hr).toEqual([155, 165])
    expect(z.rpe).toEqual([7, 8])
  })
  it('potencia solo si usa potenciómetro y tiene FTP', () => {
    expect(zoneTarget(2, zoneSet({ ftpW: 250, usesPowerMeter: true }), 'cycling').power).toEqual([140, 188])
    expect(zoneTarget(2, zoneSet({ ftpW: 250, usesPowerMeter: false }), 'cycling').power).toBeNull()
  })
  it('sin pulso ni potencia: todo en esfuerzo percibido', () => {
    const z = zoneTarget(3, zoneSet({}), 'cycling')
    expect(z.hr).toBeNull()
    expect(z.power).toBeNull()
    expect(z.rpe).toEqual([5, 6])
  })
})

describe('ajuste automático', () => {
  const sessions: PlannedLike[] = [
    { id: 's1', date: '2026-11-17', sport: 'cycling', kind: 'easy', durationMin: 60, plannedLoad: 50 },
    { id: 's2', date: '2026-11-18', sport: 'cycling', kind: 'threshold', durationMin: 70, plannedLoad: 75 },
    { id: 's3', date: '2026-11-19', sport: 'running', kind: 'easy', durationMin: 40, plannedLoad: 30 },
    { id: 's4', date: '2026-11-21', sport: 'cycling', kind: 'long', durationMin: 180, plannedLoad: 150 },
    { id: 's5', date: '2026-11-24', sport: 'cycling', kind: 'easy', durationMin: 60, plannedLoad: 50 },
  ]

  it('hecha, parcial, más dura, no hecha y pendiente', () => {
    const m = matchSessions(
      sessions,
      [
        { id: 'a1', day: '2026-11-17', sport: 'cycling', durationS: 3600, load: 52 },
        { id: 'a2', day: '2026-11-18', sport: 'cycling', durationS: 3000, load: 40 },
        { id: 'a4', day: '2026-11-22', sport: 'cycling', durationS: 4 * 3600, load: 230 }, // un día después
      ],
      today,
    )
    expect(m.get('s1')!.status).toBe('done')
    expect(m.get('s2')!.status).toBe('partial')
    expect(m.get('s3')!.status).toBe('missed')
    expect(m.get('s4')!.status).toBe('harder')
    expect(m.get('s5')!.status).toBe('pending')
  })

  it('más duro de lo previsto o fatiga alta → días suaves y semana más liviana', () => {
    const m = matchSessions(sessions, [], today)
    const adj = decideAdjustment({ today, sessions, matches: m, actualLoadLast7: 420, tsb: -32 })
    expect(adj.reasons).toContain('overreached')
    expect(adj.easyDays).toBe(2)
    expect(adj.weekFactor).toBeLessThan(1)
    const plan = generatePlan({ ...base, adjustment: adj })
    expect(plan.weeks[0].notes).toContain('adjusted_down')
    const firstSessions = plan.weeks[0].sessions.filter((s) => s.date >= today && s.sport !== 'strength').slice(0, 2)
    expect(firstSessions.every((s) => s.kind === 'recovery')).toBe(true)
  })

  it('sesiones falladas: no se recuperan doblando la semana', () => {
    const m = matchSessions(sessions, [], today)
    const adj = decideAdjustment({ today, sessions, matches: m, actualLoadLast7: 50, tsb: 5 })
    expect(adj.reasons).toContain('missed_sessions')
    expect(adj.weekFactor).toBeLessThan(1)
  })

  it('solo guarda una versión nueva si el plan cambió', () => {
    const a = generatePlan(base).weeks
    expect(planDiffers(a, generatePlan(base).weeks)).toBe(false)
    expect(planDiffers(a, generatePlan({ ...base, pauses: [] }).weeks)).toBe(true)
  })
})
