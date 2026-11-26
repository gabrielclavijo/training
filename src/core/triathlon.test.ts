import { legShares, presetInfo, suggestSplit, triEstimatedHours } from './triathlon'

describe('triatlón', () => {
  const l703 = { swimM: 1900, bikeM: 90_000, runM: 21_100 }
  it('catálogo con distancias IRONMAN', () => {
    expect(presetInfo('im_full')).toMatchObject({ swimM: 3800, bikeM: 180_200, runM: 42_200, ironman: true })
    expect(presetInfo('im_703')?.cutoffS).toBe(8.5 * 3600)
  })
  it('70.3 en 6 h: reparto típico (~40 min, ~3 h 15, ~2 h 05) que suma exacto', () => {
    const s = suggestSplit(l703, 6 * 3600)
    expect(s.swim + s.bike + s.run).toBe(6 * 3600)
    expect(Math.abs(s.swim - 40 * 60)).toBeLessThanOrEqual(3 * 60)
    expect(Math.abs(s.bike - 195 * 60)).toBeLessThanOrEqual(6 * 60)
    expect(Math.abs(s.run - 125 * 60)).toBeLessThanOrEqual(6 * 60)
  })
  it('respeta el objetivo de un tramo que la persona ya puso', () => {
    const s = suggestSplit({ ...l703, swimS: 50 * 60 }, 6 * 3600)
    expect(s.swim).toBe(50 * 60)
    expect(s.swim + s.bike + s.run).toBe(6 * 3600)
  })
  it('la bici pesa más de la mitad del tiempo en un 70.3', () => {
    expect(legShares(l703).bike).toBeGreaterThan(0.5)
    expect(triEstimatedHours(l703)).toBeGreaterThan(5)
  })
})

import { estimateLeg, legStatus } from './triathlon'
describe('tiempo estimado por tramo', () => {
  const today = '2026-11-26'
  const swims = [
    { sport: 'swimming', day: '2026-11-20', movingS: 2400, distanceM: 2000 },
    { sport: 'swimming', day: '2026-11-10', movingS: 1800, distanceM: 1500 },
  ]
  it('natación: con ritmo de 2:00/100 m, 1,9 km en aguas abiertas ≈ 40 min', () => {
    const e = estimateLeg({ leg: 'swim', distanceM: 1900, efforts: swims, today })!
    expect(Math.round(e.seconds / 60)).toBe(40)
  })
  it('sin al menos 2 actividades de la disciplina no se estima', () => {
    expect(estimateLeg({ leg: 'run', distanceM: 21_100, efforts: swims, today })).toBeNull()
  })
  it('estado por disciplina', () => {
    expect(legStatus(105, 30)).toBe('on_track')
    expect(legStatus(60, 10)).toBe('behind')
    expect(legStatus(0, 0)).toBe('no_data')
  })
})
