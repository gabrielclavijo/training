import { dailyNeeds, dayType, restingKcal, sessionFueling } from './needs'

const gabriel = { weightKg: 70, heightCm: 175, ageYears: 40, sex: 'male' as const }

describe('necesidades de alimentación', () => {
  it('gasto en reposo con Mifflin-St Jeor', () => {
    expect(restingKcal(gabriel)).toBeCloseTo(1598.75)
    expect(restingKcal({ ...gabriel, sex: 'female' })).toBeCloseTo(1432.75)
  })

  it('clasifica el día según la sesión planeada', () => {
    expect(dayType([])).toBe('rest')
    expect(dayType([{ sport: 'cycling', kind: 'rest', durationMin: 0 }])).toBe('rest')
    expect(dayType([{ sport: 'running', kind: 'easy', durationMin: 40 }])).toBe('light')
    expect(dayType([{ sport: 'cycling', kind: 'easy', durationMin: 90 }])).toBe('moderate')
    expect(dayType([{ sport: 'cycling', kind: 'threshold', durationMin: 75 }])).toBe('hard')
    expect(dayType([{ sport: 'cycling', kind: 'long', durationMin: 240 }])).toBe('long')
  })

  it('día de descanso: carbohidratos bajos y proteína 1,6 g/kg', () => {
    const n = dailyNeeds(gabriel, [], 'perform')
    expect(n.proteinG).toBe(110) // 112 redondeado a 5
    expect(n.carbsG).toBe(210)
    expect(n.kcal).toBeGreaterThan(2100)
    expect(n.kcal).toBeLessThan(2350)
  })

  it('salida larga de 4 h: muchos más carbohidratos y calorías', () => {
    const rest = dailyNeeds(gabriel, [], 'perform')
    const long = dailyNeeds(gabriel, [{ sport: 'cycling', kind: 'long', durationMin: 240 }], 'perform')
    expect(long.dayType).toBe('long')
    expect(long.carbsG).toBeGreaterThanOrEqual(560)
    expect(long.kcal - rest.kcal).toBeGreaterThan(1300)
    // Las calorías salen de los macronutrientes
    expect(Math.abs(long.kcal - (4 * long.proteinG + 4 * long.carbsG + 9 * long.fatG))).toBeLessThan(40)
  })

  it('bajar de peso: déficit en días suaves, no en los largos; más proteína', () => {
    const restP = dailyNeeds(gabriel, [], 'perform')
    const restL = dailyNeeds(gabriel, [], 'lose')
    expect(restL.kcal).toBeLessThan(restP.kcal)
    expect(restL.proteinG).toBe(140)
    const longP = dailyNeeds(gabriel, [{ sport: 'cycling', kind: 'long', durationMin: 240 }], 'perform')
    const longL = dailyNeeds(gabriel, [{ sport: 'cycling', kind: 'long', durationMin: 240 }], 'lose')
    expect(longL.carbsG).toBeGreaterThanOrEqual(560)
    expect(longL.kcal).toBeGreaterThan(longP.kcal - 100)
  })

  it('hidratación y comida durante la sesión según la duración', () => {
    expect(sessionFueling({ sport: 'running', kind: 'easy', durationMin: 40 }, 70).during).toBeNull()
    const long = sessionFueling({ sport: 'cycling', kind: 'long', durationMin: 240 }, 70)
    expect(long.during).toMatchObject({ carbsPerHourFrom: 60, carbsPerHourTo: 90, sodium: true })
    expect(long.before).toMatchObject({ carbsFromG: 70, carbsToG: 140 })
    expect(long.after).toMatchObject({ proteinG: 20, carbsG: 70 })
    const gym = sessionFueling({ sport: 'strength', kind: 'strength', durationMin: 45 }, 70)
    expect(gym.during).toBeNull()
    expect(gym.after).toMatchObject({ proteinG: 20, carbsG: 0 })
  })
})
