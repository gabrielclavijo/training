import { strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { ParsedActivity } from '../activity/types'
import { encodeFit, encodeGpx, simulate } from '../../demo/files'
import { parseActivityFile } from '../parsers'
import { compareSources, findDuplicate, mergeSources, pairKey, splitSource, type SourceLike } from '.'

const start = new Date('2026-11-21T11:30:00Z')
const ride = simulate({ durationS: 3 * 3600, distanceM: 72_000, elevationGainM: 900, hrBase: 140, seed: 11 })

function toSource(id: string, p: ParsedActivity, provider: SourceLike['provider'] = 'file'): SourceLike {
  return { id, provider, format: p.format, originHint: p.originHint, retentionClass: 'owned', ...p.summary }
}

function base(over: Partial<SourceLike> = {}): SourceLike {
  return {
    id: 'x', provider: 'file', format: 'fit', originHint: 'device_file', sport: 'cycling', subSport: null, title: null,
    startTime: '2026-11-21T11:30:00.000Z', elapsedS: 3600, movingS: 3500, distanceM: 30_000, elevationGainM: 300,
    avgHr: 140, maxHr: 170, avgPowerW: null, normalizedPowerW: null, avgCadence: null, hasPower: false, hasHr: true,
    hasGps: true, hasCadence: false, hrSamples: 3600, powerSamples: 0, gpsPoints: 3600, deviceSerial: null,
    externalId: null, rpe: null, ...over,
  }
}
const shiftStart = (min: number) => new Date(Date.parse('2026-11-21T11:30:00.000Z') + min * 60_000).toISOString()

describe('caso de prueba: la misma salida desde Strava y desde un .FIT', () => {
  // El .FIT del reloj (con serial) y el GPX de la exportación de Strava, que
  // empieza unos segundos después y calcula la distancia por GPS.
  const fit = parseActivityFile({ name: 'salida.fit', bytes: encodeFit(ride, start, { sport: 'cycling', serialNumber: 77 }) })
  const gpxSamples = ride.slice(20).map((s) => ({ ...s, t: s.t - 20 }))
  const gpx = parseActivityFile(
    { name: '111.gpx', bytes: strToU8(encodeGpx(gpxSamples, new Date(start.getTime() + 20_000), { name: 'Gravel de prueba', type: 'cycling' })) },
    { sport: 'cycling', subSport: 'gravel' },
    'strava_export',
  )
  const sFit = toSource('fit-1', fit)
  const sGpx = toSource('gpx-1', gpx)

  it('las reconoce como la misma actividad', () => {
    const m = compareSources(sGpx, sFit)
    expect(m?.matchedBy).toBe('tolerance')
    expect(m!.deltas.startMin).toBeLessThan(1)
    expect(m!.deltas.durationPct).toBeLessThan(5)
    expect(m!.deltas.distancePct!).toBeLessThan(3)
  })

  it('al llegar la segunda, encuentra la actividad existente', () => {
    const existing = [{ id: 'act-1', sources: [sFit] }, { id: 'otra', sources: [base({ id: 'z', startTime: shiftStart(-24 * 60) })] }]
    expect(findDuplicate(sGpx, existing)?.activityId).toBe('act-1')
  })

  it('fusiona conservando lo mejor de cada fuente y de dónde vino', () => {
    const merged = mergeSources([sGpx, sFit])
    expect(merged.primarySourceId).toBe('fit-1') // el archivo del reloj manda
    expect(merged.startTime).toBe(start.toISOString())
    expect(merged.hrSourceId).toBe('fit-1') // más muestras de pulso
    expect(merged.subSport).toBe('gravel') // la modalidad que puso la persona en Strava
    expect(merged.title).toBe('Gravel de prueba')
  })

  it('el resultado no depende del orden de llegada', () => {
    expect(mergeSources([sFit, sGpx])).toEqual(mergeSources([sGpx, sFit]))
  })

  it('«No son la misma actividad» las separa y no las vuelve a juntar', () => {
    const act = { id: 'act-1', sources: [sFit, sGpx] }
    const { remaining, detached, notDuplicatePairs } = splitSource(act, 'gpx-1')
    expect(remaining.primarySourceId).toBe('fit-1')
    expect(detached.primarySourceId).toBe('gpx-1')
    const pairs = new Set(notDuplicatePairs)
    expect(pairs.has(pairKey('gpx-1', 'fit-1'))).toBe(true)
    expect(findDuplicate(sGpx, [{ id: 'act-1', sources: [sFit] }], pairs)).toBeNull()
  })
})

describe('reglas de tolerancia', () => {
  const a = base({ id: 'a' })
  it('inicio: hasta 5 minutos sí, 6 no', () => {
    expect(compareSources(a, base({ id: 'b', startTime: shiftStart(5) }))).not.toBeNull()
    expect(compareSources(a, base({ id: 'b', startTime: shiftStart(6) }))).toBeNull()
  })
  it('duración: hasta 5 % sí, 6 % no', () => {
    expect(compareSources(a, base({ id: 'b', elapsedS: 3780, movingS: null }))).not.toBeNull()
    expect(compareSources(a, base({ id: 'b', elapsedS: 3830, movingS: null }))).toBeNull()
  })
  it('si coincide el tiempo en movimiento, la pausa larga no la separa', () => {
    expect(compareSources(a, base({ id: 'b', elapsedS: 4500, movingS: 3510 }))).not.toBeNull()
  })
  it('distancia: hasta 3 % sí, 3,5 % no', () => {
    expect(compareSources(a, base({ id: 'b', distanceM: 29_100 }))).not.toBeNull()
    expect(compareSources(a, base({ id: 'b', distanceM: 28_950 }))).toBeNull()
  })
  it('deporte distinto: no es la misma', () => {
    expect(compareSources(a, base({ id: 'b', sport: 'running' }))).toBeNull()
  })
  it('modalidades distintas de ciclismo sí pueden ser la misma (ruta vs. gravel)', () => {
    expect(compareSources(base({ id: 'a', subSport: 'road' }), base({ id: 'b', subSport: 'gravel' }))).not.toBeNull()
  })
  it('gimnasio sin distancia: basta con hora y duración', () => {
    const g1 = base({ id: 'g1', sport: 'strength', distanceM: null, hasGps: false })
    const g2 = base({ id: 'g2', sport: 'strength', distanceM: null, hasGps: false, startTime: shiftStart(2) })
    expect(compareSources(g1, g2)?.matchedBy).toBe('tolerance')
  })
  it('una con distancia y otra sin ella: no se adivina', () => {
    expect(compareSources(a, base({ id: 'b', distanceM: null }))).toBeNull()
  })
  it('mismo dispositivo y misma hora: es la misma aunque cambie el deporte', () => {
    const m = compareSources(base({ id: 'a', deviceSerial: '9' }), base({ id: 'b', deviceSerial: '9', sport: 'other', distanceM: 10 }))
    expect(m?.matchedBy).toBe('device_and_time')
  })
  it('mismo identificador externo: es la misma', () => {
    expect(compareSources(base({ id: 'a', externalId: 'k' }), base({ id: 'b', externalId: 'k', startTime: shiftStart(30) }))?.matchedBy).toBe(
      'device_and_time',
    )
  })
  it('dos salidas el mismo día a distinta hora no se fusionan', () => {
    expect(findDuplicate(base({ id: 'tarde', startTime: shiftStart(8 * 60) }), [{ id: 'm', sources: [a] }])).toBeNull()
  })
  it('si varias coinciden, elige la más cercana', () => {
    const near = { id: 'cerca', sources: [base({ id: 'n', startTime: shiftStart(1) })] }
    const far = { id: 'lejos', sources: [base({ id: 'f', startTime: shiftStart(4) })] }
    expect(findDuplicate(base({ id: 'c' }), [far, near])?.activityId).toBe('cerca')
  })
})

describe('fusión: la mejor versión de cada dato', () => {
  it('toma la potencia de donde exista y el pulso de donde haya más muestras', () => {
    const watch = base({ id: 'w', hrSamples: 3600, hasPower: false })
    const bikeComputer = base({ id: 'c', hasPower: true, powerSamples: 3500, avgPowerW: 180, normalizedPowerW: 195, hrSamples: 100, avgHr: 150, format: 'fit', hasCadence: true, avgCadence: 88 })
    const m = mergeSources([watch, bikeComputer])
    expect(m.powerSourceId).toBe('c')
    expect(m.normalizedPowerW).toBe(195)
    expect(m.hrSourceId).toBe('w')
    expect(m.avgHr).toBe(140)
    expect(m.cadenceSourceId).toBe('c')
    expect(m.hasPower && m.hasHr && m.hasCadence).toBe(true)
  })

  it('prefiere un archivo propio sobre datos de la API de Strava (que se borran a los 7 días)', () => {
    const strava = base({ id: 's', provider: 'strava', format: 'strava_api', retentionClass: 'strava_cache', hrSamples: 9999 })
    const file = base({ id: 'f', format: 'gpx', hrSamples: 3000 })
    const m = mergeSources([strava, file])
    expect(m.primarySourceId).toBe('f')
    expect(m.hrSourceId).toBe('f')
  })
})
