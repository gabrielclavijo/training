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

describe('plan de triatlón', () => {
  const tri: PlanGoal = {
    id: 'tri',
    name: 'IRONMAN 70.3',
    sport: 'triathlon',
    subSport: null,
    goalType: 'single',
    objective: 'time',
    priority: 'primary',
    eventDate: addDays(today, 112),
    estimatedHours: 6,
    stageDays: 1,
    targetTimeS: 6 * 3600,
    elevationPerKm: 5,
    triMinutes: { swim: 40, bike: 195, run: 125 },
  }
  const input: PlanInput = {
    ...base,
    goals: [tri],
    pauses: [],
    availability: { minutesByDay: { 1: 60, 2: 75, 3: 60, 4: 75, 5: 60, 6: 240, 7: 120 }, longDay: 6, poolDays: [1, 3, 5] },
    mix: { cycling: 0.6, running: 0.3, swimming: 0.05, strength: 0.05 },
  }
  const { weeks } = generatePlan(input)
  const build = weeks.filter((w) => w.phase === 'build')
  const all = weeks.flatMap((w) => w.sessions)

  it('la natación solo cae en días con piscina', () => {
    const swims = all.filter((s) => s.sport === 'swimming' && s.kind !== 'event')
    expect(swims.length).toBeGreaterThan(0)
    for (const s of swims) expect([1, 3, 5]).toContain(isoWeekday(s.date))
  })
  it('hay semanas con las tres disciplinas y sesión combinada (bici + trote)', () => {
    const w = build[0]
    expect(new Set(w.sessions.map((s) => s.sport))).toEqual(
      new Set(['swimming', 'cycling', 'running', ...w.sessions.filter((s) => s.sport === 'strength').map(() => 'strength')]),
    )
    const brick = w.sessions.find((s) => s.note === 'brick')!
    expect(brick.sport).toBe('running')
    expect(w.sessions.some((s) => s.date === brick.date && s.sport === 'cycling' && s.kind === 'long')).toBe(true)
    expect(w.notes).toContain('brick')
  })
  it('la natación (la más floja) recibe 3 sesiones en semanas de carga', () => {
    expect(build[0].sessions.filter((s) => s.sport === 'swimming').length).toBe(3)
  })
  it('el día del evento son tres sesiones: natación, bici y running', () => {
    const ev = all.filter((s) => s.kind === 'event')
    expect(ev.map((s) => s.sport)).toEqual(['swimming', 'cycling', 'running'])
    expect(new Set(ev.map((s) => s.date)).size).toBe(1)
  })
  it('sin días de piscina avisa en vez de inventar natación', () => {
    const r = generatePlan({ ...input, availability: { ...input.availability, poolDays: [] } })
    expect(r.weeks.flatMap((w) => w.sessions).filter((s) => s.sport === 'swimming' && s.kind !== 'event').length).toBe(0)
    expect(r.weeks[0].notes).toContain('no_pool')
  })
  it('con «Tu fuerza» también lleva fuerza, sin quitar las tres disciplinas', () => {
    const w = generatePlan({ ...input, strength: { enabled: true, minutes: 40 } }).weeks
    const b = w.filter((x) => x.phase === 'build' || x.phase === 'base')
    expect(b.every((x) => x.sessions.some((s) => s.kind === 'strength'))).toBe(true)
    expect(b.filter((x) => ['swimming', 'cycling', 'running'].every((sp) => x.sessions.some((s) => s.sport === sp))).length).toBe(b.length)
  })

  it('meta a 11 días: directo a disminución de carga y semana de carrera', () => {
    const near = generatePlan({ ...input, goals: [{ ...tri, eventDate: addDays(today, 11) }] })
    expect(near.weeks.slice(0, 2).map((w) => w.phase)).toEqual(['taper', 'event'])
  })
})

describe('fuerza en el plan', () => {
  const on: PlanInput = {
    ...base,
    pauses: [],
    availability: { minutesByDay: { 1: 45, 2: 60, 3: 75, 4: 50, 5: 60, 6: 240, 7: 90 }, longDay: 6 },
    strength: { enabled: true, minutes: 40 },
  }
  const { weeks } = generatePlan(on)
  const days = (w: (typeof weeks)[number]) => [...new Set(w.sessions.map((s) => s.date))]
  const idx = (w: (typeof weeks)[number], d: string) => Math.round((Date.parse(d) - Date.parse(w.weekStart)) / 86_400_000)

  it('sesiones por etapa: base/desarrollo 2, descarga y puesta a punto 1, semana del evento 0', () => {
    for (const w of weeks) {
      const n = w.sessions.filter((s) => s.kind === 'strength' && s.note !== 'core').length
      if (w.phase === 'event') expect(n).toBe(0)
      if (w.phase === 'recovery_week' || w.phase === 'taper' || w.phase === 'recovery') expect(n).toBeLessThanOrEqual(1)
      if (w.phase === 'base' || w.phase === 'build') expect(n).toBeLessThanOrEqual(2)
    }
    const baseWeeks = weeks.filter((w) => w.phase === 'base' || w.phase === 'build')
    expect(baseWeeks.filter((w) => w.sessions.filter((s) => s.kind === 'strength' && s.note !== 'core').length === 2).length).toBeGreaterThan(
      baseWeeks.length / 2,
    )
  })

  it('nunca la víspera de la larga o de una clave de running, ni el día después de la larga, ni días seguidos', () => {
    const KEY = ['long', 'tempo', 'threshold', 'vo2', 'climb', 'openers', 'event']
    for (const w of weeks) {
      const str = w.sessions.filter((s) => s.kind === 'strength' && s.note !== 'core').map((s) => idx(w, s.date))
      for (const i of str) {
        const next = w.sessions.filter((s) => idx(w, s.date) === i + 1)
        const prev = w.sessions.filter((s) => idx(w, s.date) === i - 1)
        const same = w.sessions.filter((s) => idx(w, s.date) === i)
        // Se permite la víspera de una calidad de bici, nunca de la larga, del evento ni de una clave de running
        expect(next.some((s) => s.kind === 'long' || s.kind === 'event' || (KEY.includes(s.kind) && s.sport !== 'cycling'))).toBe(false)
        expect(prev.some((s) => s.kind === 'long')).toBe(false)
        expect(same.some((s) => s.kind === 'long')).toBe(false)
      }
      for (let k = 1; k < str.length; k++) expect(Math.abs(str[k] - str[k - 1])).toBeGreaterThanOrEqual(2)
    }
    expect(days(weeks[0]).length).toBeGreaterThan(0)
  })

  it('nada de fuerza en los 5 días antes del evento', () => {
    for (const g of [gravel, vuelta])
      for (const s of weeks.flatMap((w) => w.sessions).filter((x) => x.kind === 'strength' && x.note !== 'core'))
        expect(s.date >= g.eventDate || Date.parse(g.eventDate) - Date.parse(s.date) > 5 * 86_400_000).toBe(true)
  })

  it('respeta el tiempo de cada día', () => {
    for (const w of weeks)
      for (const d of days(w)) {
        const wd = isoWeekday(d)
        const ss = w.sessions.filter((s) => s.date === d)
        if (ss.some((s) => s.kind === 'event')) continue
        const total = ss.reduce((t, s) => t + s.durationMin, 0)
        expect(total).toBeLessThanOrEqual((on.availability.minutesByDay[wd] ?? 0) + 1)
      }
  })

  it('en recuperación es movilidad y core corta', () => {
    const rec = weeks.filter((w) => w.phase === 'recovery').flatMap((w) => w.sessions.filter((s) => s.kind === 'strength'))
    for (const s of rec) expect([s.note, s.durationMin]).toEqual(['mobility', 25])
  })

  it('core corto: al menos 1 por semana en preparación (2 si hay tiempo), nunca en los 3 días antes de un evento ni la víspera de la larga', () => {
    const prep = weeks.filter((w) => w.phase === 'base' || w.phase === 'build')
    // Core corto o, si la semana está llena, el core dentro de la rutina de fuerza
    expect(prep.every((w) => w.sessions.some((s) => s.kind === 'strength'))).toBe(true)
    expect(prep.filter((w) => w.sessions.some((s) => s.note === 'core')).length).toBeGreaterThan(0)
    const all = weeks.flatMap((w) => w.sessions)
    for (const c of all.filter((s) => s.note === 'core')) {
      expect(c.durationMin).toBeLessThanOrEqual(20)
      for (const g of [gravel, vuelta]) expect(c.date >= g.eventDate || Date.parse(g.eventDate) - Date.parse(c.date) > 3 * 86_400_000).toBe(true)
      const next = addDays(c.date, 1)
      expect(all.some((s) => s.date === next && (s.kind === 'long' || s.kind === 'event'))).toBe(false)
    }
  })

  it('si la persona la desactiva, no hay fuerza', () => {
    const off = generatePlan({ ...on, strength: { enabled: false, minutes: 40 } })
    expect(off.weeks.flatMap((w) => w.sessions).some((s) => s.kind === 'strength')).toBe(false)
  })
})

describe('varias metas cercanas', () => {
  const ride: PlanGoal = { ...gravel, id: 'ride', name: 'Gran fondo', priority: 'secondary', eventDate: addDays(today, 40), estimatedHours: 4, stageDays: 1 }
  const tri: PlanGoal = {
    ...gravel,
    id: 'tri70',
    name: 'IRONMAN 70.3',
    sport: 'triathlon',
    subSport: null,
    priority: 'primary',
    eventDate: addDays(today, 42),
    estimatedHours: 6,
    stageDays: 1,
    triMinutes: { swim: 40, bike: 195, run: 125 },
  }
  const input: PlanInput = {
    ...base,
    goals: [ride, tri],
    pauses: [],
    availability: { minutesByDay: { 1: 60, 2: 75, 3: 60, 4: 75, 5: 60, 6: 240, 7: 120 }, longDay: 6, poolDays: [1, 3, 5] },
  }
  const all = generatePlan(input).weeks.flatMap((w) => w.sessions)

  it('las dos metas aparecen con su día de evento, aunque estén a 2 días', () => {
    expect(all.some((s) => s.kind === 'event' && s.date === ride.eventDate && s.goalId === 'ride')).toBe(true)
    expect(
      all
        .filter((s) => s.kind === 'event' && s.date === tri.eventDate && s.goalId === 'tri70')
        .map((s) => s.sport)
        .sort(),
    ).toEqual(['cycling', 'running', 'swimming'])
  })

  it('entre las dos: descanso o víspera suave, nada fuerte', () => {
    const between = all.filter((s) => s.date > ride.eventDate && s.date < tri.eventDate)
    expect(between.every((s) => s.kind === 'recovery' || s.kind === 'rest')).toBe(true)
  })

  it('con 3 semanas entre metas, la recuperación de la primera cede a la preparación de la siguiente', () => {
    const later: PlanGoal = { ...tri, eventDate: addDays(today, 61) }
    const weeks = generatePlan({ ...input, goals: [ride, later] }).weeks
    const after = weeks.filter((w) => w.weekStart > ride.eventDate && w.weekStart <= later.eventDate)
    expect(after.some((w) => w.phase === 'taper' && w.goalId === 'tri70')).toBe(true)
    expect(weeks.flatMap((w) => w.sessions).some((s) => s.kind === 'event' && s.goalId === 'tri70')).toBe(true)
  })
})

describe('fuerza después de un evento', () => {
  it('ni fuerza ni movilidad en los días siguientes a una meta de 2 días', () => {
    const stage: PlanGoal = { ...vuelta, id: 'st2', eventDate: addDays(today, 26), stageDays: 2, goalType: 'stage', priority: 'primary' }
    const weeks = generatePlan({ ...base, goals: [stage], pauses: [], strength: { enabled: true, minutes: 40 } }).weeks
    const end = addDays(stage.eventDate, 1)
    const str = weeks.flatMap((w) => w.sessions).filter((s) => s.kind === 'strength' && s.date > end)
    for (const s of str) expect(Date.parse(s.date) - Date.parse(end)).toBeGreaterThan(10 * 86_400_000)
  })
})

describe('caso real: dos metas en diciembre', () => {
  // A Guaduas (secundaria, 1 día, 05/12) y Magdalena - Tati (principal, 2 etapas, 19-20/12)
  const guaduas: PlanGoal = {
    ...gravel,
    id: 'guaduas',
    name: 'A Guaduas de cumple',
    priority: 'secondary',
    eventDate: '2026-12-05',
    estimatedHours: 5.5,
    stageDays: 1,
    goalType: 'single',
  }
  const tati: PlanGoal = {
    ...vuelta,
    id: 'tati',
    name: 'Magdalena - Tati',
    priority: 'primary',
    eventDate: '2026-12-19',
    estimatedHours: 14,
    stageDays: 2,
    goalType: 'stage',
    objective: 'finish',
  }
  const weeks = generatePlan({ ...base, goals: [guaduas, tati], pauses: [], strength: { enabled: true, minutes: 40 } }).weeks
  const all = weeks.flatMap((w) => w.sessions)

  it('las dos metas están en el calendario', () => {
    expect(all.filter((s) => s.kind === 'event').map((s) => `${s.goalId}:${s.date}`)).toEqual(['guaduas:2026-12-05', 'tati:2026-12-19', 'tati:2026-12-20'])
  })
  it('entre las dos: recuperar de la primera y llegar fresco a la segunda (disminución previa)', () => {
    const wk = weeks.find((w) => w.weekStart === '2026-12-14')!
    expect(wk.phase).toBe('event')
    expect(weeks.find((w) => w.weekStart === '2026-12-07')!.goalId).toBe('tati')
    expect(all.some((s) => s.date === '2026-12-06' && s.kind !== 'rest')).toBe(false)
  })
  it('después del 20: nada de fuerza hasta pasados 10 días', () => {
    expect(all.some((s) => s.kind === 'strength' && s.date > '2026-12-20' && s.date <= '2026-12-30')).toBe(false)
  })
})

describe('core cuando hay tiempo', () => {
  it('2 sesiones de core por semana de base con buena disponibilidad', () => {
    const weeks = generatePlan({
      ...base,
      pauses: [],
      availability: { minutesByDay: { 1: 60, 2: 105, 3: 75, 4: 90, 5: 60, 6: 240, 7: 120 }, longDay: 6 },
      strength: { enabled: true, minutes: 40 },
    }).weeks
    const baseWeeks = weeks.filter((w) => w.phase === 'base')
    expect(baseWeeks.length).toBeGreaterThan(0)
    expect(baseWeeks.every((w) => w.sessions.filter((s) => s.note === 'core').length === 2)).toBe(true)
  })
})

describe('revisión profesional: principiantes y sesión larga', () => {
  const run = (x: Partial<PlanGoal>): PlanGoal => ({
    ...gravel,
    id: 'r',
    name: 'Carrera',
    sport: 'running',
    goalType: 'single',
    priority: 'primary',
    stageDays: 1,
    ...x,
  })
  const novice: PlanInput = {
    today,
    goals: [run({ eventDate: addDays(today, 58), estimatedHours: 0.6 })],
    availability: { minutesByDay: { 1: 0, 2: 30, 3: 0, 4: 30, 5: 0, 6: 45, 7: 0 }, longDay: 6 },
    mix: { cycling: 0, running: 1, swimming: 0, strength: 0 },
    ctl: 5,
    recentWeeklyLoad: 40,
    longestRecentMin: 20,
    pauses: [],
    strength: { enabled: true, minutes: 30 },
  }
  const QUALITY = ['tempo', 'threshold', 'vo2', 'climb']

  it('el principiante parte de lo que ya hace: sin calidad 3 semanas y la larga cerca de su máximo', () => {
    const weeks = generatePlan(novice).weeks
    for (const w of weeks.slice(0, 3)) expect(w.sessions.some((s) => QUALITY.includes(s.kind))).toBe(false)
    const firstLong = weeks[0].sessions.find((s) => s.kind === 'long')
    expect(firstLong?.durationMin ?? 0).toBeLessThanOrEqual(22)
  })

  it('con 3 días o menos: máximo 1 sesión fuerte por semana, y la fuerza no reemplaza las carreras', () => {
    for (const w of generatePlan(novice).weeks) {
      expect(w.sessions.filter((s) => QUALITY.includes(s.kind)).length).toBeLessThanOrEqual(1)
      if (w.phase === 'base' || w.phase === 'build') expect(w.sessions.filter((s) => s.sport === 'running').length).toBeGreaterThanOrEqual(2)
    }
  })

  it('maratón: la larga nunca pasa de 3 h y crece máximo ~10 % por semana', () => {
    const weeks = generatePlan({
      today,
      goals: [run({ eventDate: addDays(today, 115), estimatedHours: 4, objective: 'time', targetTimeS: 4 * 3600 })],
      availability: { minutesByDay: { 1: 0, 2: 60, 3: 60, 4: 60, 5: 0, 6: 60, 7: 240 }, longDay: 7 },
      mix: { cycling: 0, running: 0.9, swimming: 0, strength: 0.1 },
      ctl: 45,
      recentWeeklyLoad: 320,
      longestRecentMin: 110,
      pauses: [],
      strength: { enabled: true, minutes: 40 },
    }).weeks
    let prev = 110
    for (const w of weeks) {
      const long = w.sessions.find((s) => s.kind === 'long')
      if (!long) continue
      expect(long.durationMin).toBeLessThanOrEqual(180)
      expect(long.durationMin).toBeLessThanOrEqual(Math.ceil(prev * 1.1) + 2)
      prev = long.durationMin
    }
  })
})

describe('medicamentos que alteran el pulso', () => {
  it('sin zonas de pulso: la sesión se guía por esfuerzo percibido', () => {
    const z = zoneSet({ hrMax: 185, hrRest: 55, hrMedication: true })
    expect(z.hrMedication).toBe(true)
    expect(zoneTarget(2, z, 'running').hr).toBeNull()
    expect(zoneTarget(2, z, 'running').rpe).toEqual([3, 4])
    expect(zoneTarget(2, zoneSet({ hrMax: 185, hrRest: 55 }), 'running').hr).not.toBeNull()
  })
})
