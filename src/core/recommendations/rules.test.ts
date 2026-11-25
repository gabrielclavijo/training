import { evaluate, visible, type RecContext } from './rules'

const base = (over: Partial<RecContext> = {}): RecContext => ({
  today: '2026-11-25',
  snapshot: { tsb: 0, rampPerWeek: 2, historyDays: 120 },
  weeks: [
    { week: '2026-10-26', load: 300 },
    { week: '2026-11-02', load: 330 },
    { week: '2026-11-09', load: 200 },
    { week: '2026-11-16', load: 320 },
    { week: '2026-11-23', load: 80 },
  ],
  recentSessions: [],
  goal: null,
  longestMin: 180,
  elevationM: 3000,
  hasThreshold: true,
  hasHrMax: true,
  hasActivities: true,
  hrRest: null,
  weight: null,
  labsOutOfRange: [],
  ...over,
})
const keys = (c: RecContext) => evaluate(c).map((r) => r.key)

describe('recomendaciones por reglas', () => {
  it('sin señales, no hay recomendaciones', () => {
    expect(keys(base())).toEqual([])
  })

  it('fatiga muy alta y forma que sube rápido son prioridad alta', () => {
    const r = evaluate(base({ snapshot: { tsb: -35, rampPerWeek: 9, historyDays: 120 } }))
    expect(r.map((x) => x.key)).toEqual(['very_tired', 'ramp_high'])
    expect(r[0].params.tsb).toBe(-35)
  })

  it('no alerta por fatiga con poco historial', () => {
    expect(keys(base({ snapshot: { tsb: -40, rampPerWeek: 12, historyDays: 10 } }))).toEqual([])
  })

  it('dos semanas completas seguidas subiendo más del 10 % (la semana en curso no cuenta)', () => {
    const weeks = [
      { week: '2026-11-02', load: 200 },
      { week: '2026-11-09', load: 230 },
      { week: '2026-11-16', load: 260 },
      { week: '2026-11-23', load: 10 },
    ]
    expect(keys(base({ weeks }))).toContain('load_rising')
  })

  it('cuatro semanas sin descarga', () => {
    const weeks = ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'].map((week) => ({ week, load: 300 }))
    expect(keys(base({ weeks }))).toContain('no_recovery_week')
  })

  it('3 sesiones sin hacer en 2 semanas → revisar el tiempo disponible', () => {
    const recentSessions = ['2026-11-12', '2026-11-15', '2026-11-20'].map((date) => ({ date, status: 'missed' as const }))
    const r = evaluate(base({ recentSessions }))
    expect(r[0]).toMatchObject({ key: 'missed_sessions', params: { count: 3 }, link: { to: '/plan/disponibilidad' } })
  })

  it('salida larga y desnivel lejos de lo que pide la meta', () => {
    const goal = { id: 'g1', name: 'Vuelta', eventDate: '2027-02-20', hoursPerDay: 6, elevationGainM: 4000 }
    const r = keys(base({ goal, longestMin: 120, elevationM: 2500 }))
    expect(r).toEqual(['long_short', 'climbing_short'])
    // Faltando menos de 3 semanas ya no se pide alargar
    expect(keys(base({ goal: { ...goal, eventDate: '2026-12-05' }, longestMin: 120, elevationM: 5000 }))).toEqual([])
  })

  it('examen fuera de rango: prioridad alta, solo remite al médico', () => {
    const r = evaluate(base({ labsOutOfRange: ['Ferritina'] }))
    expect(r[0]).toMatchObject({ key: 'lab_out_of_range', severity: 'high', params: { names: 'Ferritina' } })
  })

  it('pulso en reposo alto y cambio rápido de peso', () => {
    expect(keys(base({ hrRest: { latest: 60, baseline: 50 } }))).toEqual(['hr_rest_high'])
    expect(keys(base({ weight: { latestKg: 67, previousKg: 70, days: 14 } }))).toEqual(['weight_change'])
    expect(keys(base({ weight: { latestKg: 69.5, previousKg: 70, days: 14 } }))).toEqual([])
  })

  it('datos que faltan para las zonas', () => {
    expect(keys(base({ hasThreshold: false }))).toEqual(['missing_threshold'])
    expect(keys(base({ hasHrMax: false }))).toEqual(['missing_hrmax'])
    expect(keys(base({ hasThreshold: false, hasActivities: false }))).toEqual([])
  })

  it('muestra máximo 3 y respeta las que la persona ocultó', () => {
    const c = base({ snapshot: { tsb: -35, rampPerWeek: 9, historyDays: 120 }, labsOutOfRange: ['TSH'], hasThreshold: false, hrRest: { latest: 60, baseline: 50 } })
    const all = evaluate(c)
    expect(all.length).toBe(5)
    expect(visible(all, [], c.today).map((r) => r.key)).toEqual(['very_tired', 'ramp_high', 'lab_out_of_range'])
    const v = visible(all, [{ ruleKey: 'very_tired', dismissedUntil: '2026-12-01' }, { ruleKey: 'ramp_high', dismissedUntil: '2026-11-20' }], c.today)
    expect(v.map((r) => r.key)).toEqual(['ramp_high', 'lab_out_of_range', 'hr_rest_high'])
  })

  it('registro diario: enfermo → pausa; 3 días cansado → día suave; bien con fatiga alta → descanso', () => {
    expect(keys(base({ checkins: [{ day: '2026-11-24', feeling: 2, tags: ['sick'] }] }))).toEqual(['feel_sick'])
    const tired = [0, 1, 2].map((d) => ({ day: `2026-11-2${5 - d}`, feeling: 3, tags: d === 1 ? [] : ['tired_legs'] }))
    tired[1].feeling = 2
    expect(keys(base({ checkins: tired }))).toEqual(['feel_low_streak'])
    expect(keys(base({ checkins: tired.slice(0, 2) }))).toEqual([])
    const good = base({ snapshot: { tsb: -25, rampPerWeek: 2, historyDays: 120 }, checkins: [{ day: '2026-11-25', feeling: 5, tags: ['energized'] }] })
    expect(keys(good)).toEqual(['feel_good_tired'])
  })
})
