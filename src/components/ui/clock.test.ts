import { formatClockInput, parseClock } from './Field'

describe('campos de tiempo (ritmos y tiempos objetivo)', () => {
  it('pone los dos puntos solos con el teclado numérico', () => {
    expect(formatClockInput('5')).toBe('5')
    expect(formatClockInput('51')).toBe('51')
    expect(formatClockInput('510')).toBe('5:10')
    expect(formatClockInput('1500')).toBe('15:00')
    expect(formatClockInput('12345')).toBe('123:45')
  })
  it('acepta otros separadores y conserva los dos puntos escritos', () => {
    expect(formatClockInput('5.10')).toBe('5:10')
    expect(formatClockInput('5,10')).toBe('5:10')
    expect(formatClockInput('5 10')).toBe('5:10')
    expect(formatClockInput('5:1')).toBe('5:1')
    expect(formatClockInput('5::10')).toBe('5:10')
  })
  it('convierte a segundos', () => {
    expect(parseClock('5:10', 'mm:ss')).toBe(310)
    expect(parseClock('510', 'mm:ss')).toBe(310)
    expect(parseClock('5.10', 'mm:ss')).toBe(310)
    expect(parseClock('5', 'mm:ss')).toBe(300)
    expect(parseClock('15:00', 'hh:mm')).toBe(54000)
    expect(parseClock('1500', 'hh:mm')).toBe(54000)
    expect(parseClock('', 'mm:ss')).toBeNull()
    expect(parseClock('5:75', 'mm:ss')).toBeNaN()
  })
})

import { parseWhole } from './Field'
describe('números enteros con separador de miles', () => {
  it('acepta «2.200» y «2,200» como 2200', () => {
    expect(parseWhole('2.200')).toBe(2200)
    expect(parseWhole('2,200')).toBe(2200)
    expect(parseWhole('12.500')).toBe(12500)
    expect(parseWhole('1 200')).toBe(1200)
    expect(parseWhole('186')).toBe(186)
    expect(parseWhole('')).toBeNull()
    expect(parseWhole('abc')).toBeNaN()
  })
})
