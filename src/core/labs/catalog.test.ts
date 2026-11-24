import { effectiveRange, generalRange, labDef, labStatus } from './catalog'

describe('exámenes de laboratorio', () => {
  it('rango general según sexo; si no se sabe, el más amplio', () => {
    const ferritin = labDef('ferritin')!
    expect(generalRange(ferritin, 'female')).toEqual({ low: 15, high: 150 })
    expect(generalRange(ferritin, null)).toEqual({ low: 15, high: 400 })
  })
  it('clasifica bajo, en rango y alto', () => {
    expect(labStatus(10, { low: 15, high: 150 })).toBe('low')
    expect(labStatus(80, { low: 15, high: 150 })).toBe('in_range')
    expect(labStatus(220, { low: null, high: 199 })).toBe('high')
    expect(labStatus(5, null)).toBe('unknown')
  })
  it('el rango del laboratorio manda sobre el general', () => {
    expect(effectiveRange({ labKey: 'ferritin', refLow: 20, refHigh: null }, 'male')).toEqual({ range: { low: 20, high: null }, source: 'lab' })
    expect(effectiveRange({ labKey: 'ferritin' }, 'male')).toEqual({ range: { low: 30, high: 400 }, source: 'general' })
    expect(effectiveRange({ labKey: undefined }, 'male')).toEqual({ range: null, source: null })
  })
})
