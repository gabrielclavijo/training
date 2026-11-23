import { describe, expect, it } from 'vitest'
import { addDays } from '../dates'
import { dailyLoads, fitnessSeries, snapshot, weeklyLoads } from '.'

const constant = (days: number, load: number, from = '2026-01-01') => {
  const m = new Map<string, number>()
  for (let i = 0; i < days; i++) m.set(addDays(from, i), load)
  return m
}

describe('CTL / ATL / TSB', () => {
  it('con la misma carga todos los días, la forma converge a esa carga y TSB a 0', () => {
    const series = fitnessSeries(constant(300, 60), addDays('2026-01-01', 299))
    const s = snapshot(series)!
    expect(s.ctl).toBeCloseTo(60, 0)
    expect(s.atl).toBeCloseTo(60, 0)
    expect(Math.abs(s.tsb)).toBeLessThan(0.5)
    expect(s.warming).toBe(false)
  })

  it('tras una semana de descanso la fatiga baja más rápido que la forma (TSB positivo)', () => {
    const loads = constant(120, 80)
    const until = addDays('2026-01-01', 126)
    const s = snapshot(fitnessSeries(loads, until))!
    expect(s.atl).toBeLessThan(s.ctl)
    expect(s.tsb).toBeGreaterThan(10)
    expect(s.rampPerWeek).toBeLessThan(0)
  })

  it('un bloque duro deja TSB negativo (fatiga acumulada)', () => {
    const loads = constant(60, 50)
    for (let i = 60; i < 67; i++) loads.set(addDays('2026-01-01', i), 150)
    const s = snapshot(fitnessSeries(loads, addDays('2026-01-01', 66)))!
    expect(s.tsb).toBeLessThan(-30)
    expect(s.rampPerWeek).toBeGreaterThan(5)
  })

  it('con poco historial lo indica (la forma crónica se está llenando)', () => {
    expect(snapshot(fitnessSeries(constant(10, 50), addDays('2026-01-01', 9)))!.warming).toBe(true)
  })

  it('cuenta las actividades sin carga en vez de inventarles un valor', () => {
    const { map, missing } = dailyLoads([
      { day: '2026-02-01', load: 50 },
      { day: '2026-02-01', load: 30 },
      { day: '2026-02-02', load: null },
    ])
    expect(map.get('2026-02-01')).toBe(80)
    expect(missing).toBe(1)
  })
})

describe('carga semanal', () => {
  it('suma de lunes a domingo, rellena semanas vacías y calcula el cambio', () => {
    const m = new Map([
      ['2026-11-02', 100], // lunes
      ['2026-11-08', 100], // domingo, misma semana
      ['2026-11-16', 300], // dos semanas después
    ])
    expect(weeklyLoads(m)).toEqual([
      { week: '2026-11-02', load: 200, changePct: null },
      { week: '2026-11-09', load: 0, changePct: -100 },
      { week: '2026-11-16', load: 300, changePct: null },
    ])
  })
})
