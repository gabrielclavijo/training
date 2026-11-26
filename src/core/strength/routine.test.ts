import { describe, expect, it } from 'vitest'
import { DEFAULT_STRENGTH, type Discomfort, type StrengthPrefs } from './library'
import { buildRoutine, focusFor, type Focus, type RoutineSport } from './routine'
import type { Phase } from '../planner/plan'

const P = (x: Partial<StrengthPrefs> = {}): StrengthPrefs => ({ ...DEFAULT_STRENGTH, ...x })
const r = (x: Partial<Parameters<typeof buildRoutine>[0]> = {}) =>
  buildRoutine({ prefs: P(), place: 'home', sport: 'cycling', phase: 'base', focus: 'full', minutes: 40, weekInPhase: 1, ...x })

describe('rutina de fuerza', () => {
  it('sin equipo: solo ejercicios con el peso del cuerpo', () => {
    const x = r()
    expect(x.items.length).toBe(5)
    expect(x.items.every((i) => i.ex.needs.length === 0 && i.ex.place === 'home')).toBe(true)
  })

  it('con mancuernas en casa las usa', () => {
    const x = r({ prefs: P({ equipment: ['dumbbells'], experience: 'some' }) })
    expect(x.items.some((i) => i.ex.needs.includes('dumbbells'))).toBe(true)
    expect(x.items.every((i) => i.ex.needs.length === 0 || i.ex.needs.includes('dumbbells'))).toBe(true)
  })

  it('en el gimnasio nombra las máquinas', () => {
    const x = r({ place: 'gym', prefs: P({ location: 'gym' }) })
    expect(x.items.filter((i) => i.ex.machine).length).toBeGreaterThanOrEqual(2)
  })

  it('evita lo que carga la molestia', () => {
    for (const d of ['knee', 'low_back', 'shoulder'] as Discomfort[])
      for (const place of ['home', 'gym'] as const) {
        const x = r({ place, prefs: P({ discomfort: [d], equipment: ['dumbbells', 'bands', 'kettlebell', 'pullup_bar', 'step'] }) })
        expect(x.items.every((i) => !i.ex.avoid.includes(d))).toBe(true)
      }
  })

  it('triatlón: una de piernas y otra de tronco y espalda', () => {
    expect(focusFor('triathlon', 0, false)).toBe('legs')
    expect(focusFor('triathlon', 1, false)).toBe('upper')
    const legs = r({ sport: 'triathlon', focus: 'legs' })
    const upper = r({ sport: 'triathlon', focus: 'upper', prefs: P({ equipment: ['bands'] }) })
    expect(legs.items.some((i) => ['squat', 'single_leg'].includes(i.ex.pattern))).toBe(true)
    expect(upper.items.some((i) => i.ex.pattern === 'pull')).toBe(true)
    expect(upper.items.some((i) => ['squat', 'single_leg'].includes(i.ex.pattern))).toBe(false)
  })

  it('running lleva trabajo a una pierna, pantorrillas y saltos en base', () => {
    const x = r({ sport: 'running' })
    const pats = x.items.map((i) => i.ex.pattern)
    expect(pats).toEqual(expect.arrayContaining(['single_leg', 'calf', 'plyo']))
    expect(r({ sport: 'running', phase: 'taper' }).items.some((i) => i.ex.pattern === 'plyo')).toBe(false)
  })

  it('movilidad en recuperación: corta, sin equipo y suave', () => {
    const x = r({ focus: 'mobility', phase: 'recovery', minutes: 25, prefs: P({ equipment: ['dumbbells'] }) })
    expect(x.items.length).toBe(4)
    expect(x.items.every((i) => i.ex.needs.length === 0 && i.sets === 2)).toBe(true)
  })

  it('progresa dentro de la etapa', () => {
    const w1 = r({ prefs: P({ experience: 'new' }) })
    const w2 = r({ prefs: P({ experience: 'new' }), weekInPhase: 2 })
    expect(w1.items[0].sets).toBeLessThan(w2.items[0].sets)
    expect(w1.items.map((i) => i.ex.id)).toEqual(w2.items.map((i) => i.ex.id))
  })

  it('siempre arma una rutina completa, con cualquier combinación', () => {
    const sports: RoutineSport[] = ['cycling', 'running', 'swimming', 'triathlon', 'other']
    const foci: Focus[] = ['full', 'legs', 'upper', 'mobility']
    const phases: Phase[] = ['base', 'build', 'taper', 'recovery']
    for (const sport of sports)
      for (const focus of foci)
        for (const phase of phases)
          for (const place of ['home', 'gym'] as const)
            for (const discomfort of [[], ['knee', 'low_back', 'shoulder']] as Discomfort[][]) {
              const x = r({ sport, focus, phase, place, prefs: P({ discomfort }), minutes: 30 })
              expect(x.items.length, `${sport}/${focus}/${phase}/${place}/${discomfort}`).toBeGreaterThanOrEqual(4)
              expect(new Set(x.items.map((i) => i.ex.id)).size).toBe(x.items.length)
            }
  })
})
