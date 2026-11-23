import { describe, expect, it } from 'vitest'
import { computeLoad, estimateHrMax, type LoadInput } from '.'

const hour = (over: Partial<LoadInput> = {}): LoadInput => ({
  sport: 'cycling',
  durationS: 3600,
  hasPower: false,
  normalizedPowerW: null,
  avgPowerW: null,
  hrHistogram: null,
  avgHr: null,
  rpe: null,
  ...over,
})

describe('carga por entrenamiento: escala común (1 h al umbral ≈ 100)', () => {
  it('potencia + FTP → TSS, confianza alta', () => {
    const r = computeLoad(hour({ hasPower: true, normalizedPowerW: 250 }), { ftpW: 250 })
    expect(r).toMatchObject({ method: 'power_tss', load: 100, confidence: 'high' })
  })

  it('pulso + umbral → hrTSS, confianza media', () => {
    const r = computeLoad(hour({ hrHistogram: [[165, 3600]], avgHr: 165 }), { hrThreshold: 165 })
    expect(r).toMatchObject({ method: 'hr_tss', load: 100, confidence: 'medium' })
  })

  it('pulso + FC máx. y en reposo → TRIMP, confianza media', () => {
    // 85 % de la reserva: 50 + 0,85 × (190 − 50) = 169
    const r = computeLoad(hour({ hrHistogram: [[169, 3600]], avgHr: 169 }), { hrRest: 50, hrMax: 190, hrMaxSource: 'measured' })
    expect(r.method).toBe('trimp')
    expect(r.load).toBeCloseTo(100, -1)
    expect(r.confidence).toBe('medium')
    expect(r.hints).toContain('add_hr_threshold')
  })

  it('FC máxima estimada por edad → confianza baja y sugerencia de medirla', () => {
    const r = computeLoad(hour({ hrHistogram: [[140, 3600]], avgHr: 140 }), { hrRest: 55, ageYears: 40 })
    expect(r.method).toBe('trimp')
    expect(r.confidence).toBe('low')
    expect(r.inputs.hrMax).toBe(estimateHrMax(40))
    expect(r.hints).toContain('measure_hr_max')
  })

  it('sin pulso → duración × esfuerzo percibido, confianza baja', () => {
    const r = computeLoad(hour({ rpe: 7 }))
    expect(r).toMatchObject({ method: 'rpe', load: 100, confidence: 'low' })
    expect(computeLoad(hour({ rpe: 3, durationS: 1800 })).load).toBeCloseTo(21.4, 1)
  })

  it('sin ningún dato → no inventa un número y dice qué falta', () => {
    const r = computeLoad(hour())
    expect(r.method).toBe('none')
    expect(r.load).toBeNull()
    expect(r.hints).toContain('add_rpe')
  })
})

describe('casos especiales', () => {
  it('con potencia pero sin FTP usa el pulso y sugiere registrar el FTP', () => {
    const r = computeLoad(hour({ hasPower: true, normalizedPowerW: 200, hrHistogram: [[150, 3600]], avgHr: 150 }), { hrThreshold: 165 })
    expect(r.method).toBe('hr_tss')
    expect(r.hints).toContain('add_ftp')
  })

  it('la potencia solo cuenta en ciclismo', () => {
    const r = computeLoad(hour({ sport: 'running', hasPower: true, normalizedPowerW: 250, rpe: 6 }), { ftpW: 250 })
    expect(r.method).toBe('rpe')
  })

  it('betabloqueantes: se prefiere el esfuerzo percibido', () => {
    const r = computeLoad(hour({ hrHistogram: [[120, 3600]], avgHr: 120, rpe: 6 }), { hrThreshold: 150, hrAffectingMedication: true })
    expect(r.method).toBe('rpe')
    expect(r.hints).toContain('hr_medication')
  })

  it('betabloqueantes sin esfuerzo percibido: usa el pulso pero con confianza baja', () => {
    const r = computeLoad(hour({ hrHistogram: [[120, 3600]], avgHr: 120 }), { hrThreshold: 150, hrAffectingMedication: true })
    expect(r).toMatchObject({ method: 'hr_tss', confidence: 'low' })
  })

  it('natación: el pulso de muñeca es poco confiable', () => {
    const withRpe = computeLoad(hour({ sport: 'swimming', hrHistogram: [[130, 3600]], avgHr: 130, rpe: 5 }), { hrThreshold: 160 })
    expect(withRpe.method).toBe('rpe')
    const withoutRpe = computeLoad(hour({ sport: 'swimming', hrHistogram: [[130, 3600]], avgHr: 130 }), { hrThreshold: 160 })
    expect(withoutRpe).toMatchObject({ method: 'hr_tss', confidence: 'low' })
    expect(withoutRpe.hints).toEqual(expect.arrayContaining(['swim_wrist_hr', 'add_rpe']))
  })

  it('gimnasio: se prefiere el esfuerzo percibido', () => {
    expect(computeLoad(hour({ sport: 'strength', hrHistogram: [[110, 3600]], avgHr: 110, rpe: 7 }), { hrThreshold: 160 }).method).toBe('rpe')
  })

  it('actividad manual con pulso promedio (sin histograma) también sirve', () => {
    const r = computeLoad(hour({ avgHr: 165 }), { hrThreshold: 165 })
    expect(r).toMatchObject({ method: 'hr_tss', load: 100 })
  })

  it('perfil de prueba: pulso de muñeca, sin potencia, sin umbrales → avisa qué agregar', () => {
    const r = computeLoad(hour({ hrHistogram: [[140, 3600]], avgHr: 140 }), { ageYears: 38 })
    expect(r.method).toBe('none')
    expect(r.hints).toEqual(expect.arrayContaining(['add_hr_threshold', 'add_hr_rest', 'add_rpe']))
  })
})
