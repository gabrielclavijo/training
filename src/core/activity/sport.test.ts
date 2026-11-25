import { reconcileSport } from './sport'

const gym = { sport: 'strength' as const, subSport: null }
describe('deporte corregido por distancia y velocidad', () => {
  it('una salida guardada como «Workout» con 103 km pasa a ciclismo', () => {
    // Caso real: 103 km, 8 h 58 min en total y un tiempo en movimiento raro de 1 h 33 min
    expect(reconcileSport(gym, { distanceM: 103_000, movingS: 5580, elapsedS: 32_280 })).toEqual({ sport: 'cycling', subSport: null })
  })
  it('rápido y corto también es ciclismo', () => {
    expect(reconcileSport(gym, { distanceM: 20_000, movingS: 3000, elapsedS: 3300 }).sport).toBe('cycling')
  })
  it('a ritmo de trote es running', () => {
    expect(reconcileSport({ sport: 'other', subSport: null }, { distanceM: 10_000, movingS: 3300, elapsedS: 3400 })).toEqual({ sport: 'running', subSport: 'road' })
  })
  it('gimnasio real (sin distancia) o caminata se dejan como estaban', () => {
    expect(reconcileSport(gym, { distanceM: null, movingS: 3600, elapsedS: 3600 })).toEqual(gym)
    expect(reconcileSport(gym, { distanceM: 2000, movingS: 600, elapsedS: 600 })).toEqual(gym)
    expect(reconcileSport({ sport: 'other', subSport: null }, { distanceM: 12_000, movingS: 3 * 3600, elapsedS: 3 * 3600 }).sport).toBe('other')
  })
  it('nunca cambia un deporte que ya venía claro', () => {
    expect(reconcileSport({ sport: 'swimming', subSport: 'pool' }, { distanceM: 50_000, movingS: 3600, elapsedS: 3600 }).sport).toBe('swimming')
  })
})
