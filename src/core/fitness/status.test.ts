import { fatigueStatus, fitnessVsBest, formStatus, rampStatus, scalePct } from './status'

describe('semáforo de indicadores', () => {
  it('estado de forma (TSB)', () => {
    expect(formStatus(-40)).toMatchObject({ level: 'alert', verdict: 'tsbVeryTired' })
    expect(formStatus(-20)).toMatchObject({ level: 'caution', verdict: 'tsbTired' })
    expect(formStatus(0)).toMatchObject({ level: 'good', verdict: 'tsbNeutral' })
    expect(formStatus(12)).toMatchObject({ level: 'good', verdict: 'tsbFresh' })
    expect(formStatus(30)).toMatchObject({ level: 'caution', verdict: 'tsbDetrained' })
  })
  it('fatiga frente a la forma', () => {
    expect(fatigueStatus(74, 75)).toMatchObject({ level: 'good', verdict: 'fatigueOk' })
    expect(fatigueStatus(95, 75)).toMatchObject({ level: 'caution', verdict: 'fatigueHigh' })
    expect(fatigueStatus(110, 75)).toMatchObject({ level: 'alert', verdict: 'fatigueVeryHigh' })
    expect(fatigueStatus(20, 5)).toMatchObject({ level: 'good', verdict: 'fatigueLowBase', ratio: null })
  })
  it('ritmo de aumento', () => {
    expect(rampStatus(0.6).level).toBe('good')
    expect(rampStatus(6).level).toBe('caution')
    expect(rampStatus(9).level).toBe('alert')
    expect(rampStatus(-7)).toMatchObject({ level: 'caution', verdict: 'rampLosing' })
  })
  it('forma frente a la mejor alcanzada', () => {
    const series = [
      { day: '2026-06-01', ctl: 40 },
      { day: '2026-08-15', ctl: 90 },
      { day: '2026-11-24', ctl: 75 },
    ]
    expect(fitnessVsBest(75, series)).toMatchObject({ best: 90, bestDay: '2026-08-15', pct: 83, level: 'caution', verdict: 'formBelowBest' })
    expect(fitnessVsBest(90, series)).toMatchObject({ pct: 100, level: 'good', verdict: 'formAtBest' })
    expect(fitnessVsBest(40, series)).toMatchObject({ level: 'alert', verdict: 'formFarBest' })
  })
  it('posición en la escala, recortada a los extremos', () => {
    const s = formStatus(0).scale
    expect(scalePct(-45, s)).toBe(0)
    expect(scalePct(100, s)).toBe(100)
    expect(scalePct(-5, s)).toBeCloseTo(50)
  })
})
