import { carbsRate, raceFuelPlan } from './race'

describe('alimentación de carrera', () => {
  it('70.3 de 6 h (40 / 195 / 125 min), 70 kg: nada nadando, más en la bici, algo menos corriendo', () => {
    const p = raceFuelPlan({
      weightKg: 70,
      segments: [
        { sport: 'swimming', minutes: 40 },
        { sport: 'cycling', minutes: 195 },
        { sport: 'running', minutes: 125 },
      ],
    })
    const [swim, bike, run] = p.segments
    expect(swim.carbsG).toBe(0)
    expect(bike.carbsPerHour).toEqual([60, 90])
    expect(run.carbsPerHour).toEqual([48, 72])
    expect(bike.carbsG).toBeGreaterThan(run.carbsG)
    expect(p.carbLoading).toEqual({ fromG: 560, toG: 700 })
    expect(p.breakfast.carbsG).toBe(140)
    expect(p.totals.gels).toBe(bike.gels + run.gels)
    expect(bike.sodiumMgPerHour).toEqual([300, 600])
  })
  it('un 10K de 50 min: poco durante, sin carga de carbohidratos', () => {
    const p = raceFuelPlan({ weightKg: 60, segments: [{ sport: 'running', minutes: 50 }] })
    expect(p.carbLoading).toBeNull()
    expect(p.segments[0].carbsPerHour).toEqual([0, 30])
    expect(p.segments[0].sodiumMgPerHour).toBeNull()
  })
  it('con calor sube el líquido y aparece el sodio', () => {
    const p = raceFuelPlan({ weightKg: 70, hot: true, segments: [{ sport: 'cycling', minutes: 90 }] })
    expect(p.segments[0].fluidMlPerHour).toEqual([600, 1000])
    expect(p.segments[0].sodiumMgPerHour).not.toBeNull()
  })
  it('rangos por duración', () => {
    expect(carbsRate(30)).toEqual([0, 0])
    expect(carbsRate(120)).toEqual([30, 60])
    expect(carbsRate(600)).toEqual([60, 90])
  })
})
