import { describe, expect, it } from 'vitest'
import {
  formatClock,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPacePer100m,
  formatPacePerKm,
  formatSpeed,
  formatWattsPerKg,
} from '.'
import { addDays, ageOn, daysBetween, formatDate, localDayKey, weekStart } from '../dates'

describe('unidades (es-CO, métrico)', () => {
  it('formatea distancias con separadores colombianos', () => {
    expect(formatDistance(850)).toBe('850 m')
    expect(formatDistance(120_000)).toBe('120 km')
    expect(formatDistance(42_195)).toBe('42,2 km')
  })
  it('formatea desnivel con punto de miles', () => {
    expect(formatElevation(2200)).toBe('2.200 m')
  })
  it('convierte m/s a km/h', () => {
    expect(formatSpeed(7.5)).toBe('27 km/h')
  })
  it('calcula ritmos', () => {
    expect(formatPacePerKm(10_000, 3000)).toBe('5:00 /km')
    expect(formatPacePer100m(1500, 1650)).toBe('1:50 /100 m')
    expect(formatPacePerKm(0, 100)).toBe('—')
  })
  it('W/kg con un decimal', () => {
    expect(formatWattsPerKg(240, 75)).toBe('3,2 W/kg')
  })
  it('duraciones', () => {
    expect(formatDuration(45 * 60)).toBe('45 min')
    expect(formatDuration(3900)).toBe('1 h 05 min')
    expect(formatClock(3909)).toBe('1:05:09')
  })
})

describe('fechas (America/Bogota)', () => {
  it('usa día/mes/año en hora de Colombia', () => {
    // 03:00 UTC del 23 = 22:00 del 22 en Bogotá
    expect(formatDate('2026-11-23T03:00:00Z')).toBe('22/11/2026')
    expect(localDayKey('2026-11-23T03:00:00Z')).toBe('2026-11-22')
  })
  it('aritmética de días y semanas', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(daysBetween('2026-11-23', '2027-02-15')).toBe(84)
    expect(weekStart('2026-11-29')).toBe('2026-11-23') // domingo → lunes anterior
    expect(ageOn('1990-12-01', '2026-11-23')).toBe(35)
  })
})
