import { gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { encodeFit, encodeGpx, simulate, stravaCsv, stravaExportZip } from '../../demo/files'
import { parseActivityFile, parseUpload, type ParseOutcome } from '.'
import { parseCsv } from './csv'
import { parseStravaActivitiesCsv } from './stravaExport'

const start = new Date('2026-11-21T11:30:00Z') // 6:30 a. m. en Bogotá
const ride = simulate({ durationS: 3 * 3600, distanceM: 72_000, elevationGainM: 900, hrBase: 140, seed: 7 })

const okOnly = (xs: ParseOutcome[]) => xs.filter((x): x is Extract<ParseOutcome, { ok: true }> => x.ok)

describe('lector .FIT', () => {
  it('lee una salida de gravel con pulso y sin potencia', () => {
    const fit = encodeFit(ride, start, { sport: 'cycling', subSport: 'gravelCycling', serialNumber: 42 })
    const { summary, format, streams } = parseActivityFile({ name: 'salida.fit', bytes: fit })
    expect(format).toBe('fit')
    expect(summary.sport).toBe('cycling')
    expect(summary.subSport).toBe('gravel')
    expect(summary.startTime).toBe(start.toISOString())
    expect(summary.elapsedS).toBe(3 * 3600)
    expect(summary.distanceM).toBeCloseTo(72_000, -2)
    expect(summary.elevationGainM).toBeGreaterThan(800)
    expect(summary.elevationGainM).toBeLessThan(1000)
    expect(summary.hasHr).toBe(true)
    expect(summary.hasPower).toBe(false)
    expect(summary.hasGps).toBe(true)
    expect(summary.avgHr).toBeGreaterThan(130)
    expect(summary.hrHistogram!.reduce((a, [, s]) => a + s, 0)).toBeCloseTo(3 * 3600, -1)
    expect(summary.deviceSerial).toBe('42')
    expect(summary.externalId).toMatch(/^fit:42:/)
    expect(streams!.t.length).toBeLessThan((3 * 3600) / 4) // reducido a 1 muestra cada 5 s
  })

  it('calcula potencia normalizada y curva cuando hay potenciómetro', () => {
    const withPower = simulate({ durationS: 3600, distanceM: 30_000, elevationGainM: 300, hrBase: 150, powerAvg: 200, seed: 3 })
    const fit = encodeFit(withPower, start, { sport: 'cycling', subSport: 'road' })
    const { summary } = parseActivityFile({ name: 'ruta.fit', bytes: fit })
    expect(summary.hasPower).toBe(true)
    expect(summary.subSport).toBe('road')
    expect(summary.normalizedPowerW!).toBeGreaterThanOrEqual(summary.avgPowerW!)
    expect(summary.powerCurve!['300']).toBeGreaterThan(summary.avgPowerW!)
  })

  it('lee una sesión de gimnasio sin GPS ni distancia', () => {
    const gym = simulate({ durationS: 2700, distanceM: 0, elevationGainM: 0, hrBase: 110 }).map((s) => ({ ...s, dist: undefined }))
    const fit = encodeFit(gym, start, { sport: 'training', subSport: 'strengthTraining', includeGps: false })
    const { summary } = parseActivityFile({ name: 'gym.fit', bytes: fit })
    expect(summary.sport).toBe('strength')
    expect(summary.distanceM).toBeNull()
    expect(summary.hasGps).toBe(false)
    expect(summary.elapsedS).toBe(2700)
  })

  it('rechaza un archivo dañado con un código claro', () => {
    const [out] = [...parseUpload({ name: 'roto.fit', bytes: new Uint8Array([1, 2, 3, 4, 5]) })]
    expect(out).toEqual({ ok: false, name: 'roto.fit', code: 'corrupt' })
  })
})

describe('lector .GPX y .TCX', () => {
  it('lee el GPX que entrega Strava con pulso', () => {
    const gpx = encodeGpx(ride, start, { name: 'Gravel por la Sabana', type: 'cycling' })
    const { summary } = parseActivityFile({ name: 'a.gpx', bytes: strToU8(gpx) })
    expect(summary.sport).toBe('cycling')
    expect(summary.title).toBe('Gravel por la Sabana')
    expect(summary.distanceM).toBeCloseTo(72_000, -3)
    expect(summary.hasHr).toBe(true)
  })

  it('un GPX sin horas es una ruta, no una actividad', () => {
    const route = `<gpx><trk><trkseg><trkpt lat="4.6" lon="-74"><ele>2600</ele></trkpt><trkpt lat="4.7" lon="-74"><ele>2700</ele></trkpt></trkseg></trk></gpx>`
    const [out] = [...parseUpload({ name: 'ruta.gpx', bytes: strToU8(route) })]
    expect(out).toMatchObject({ ok: false, code: 'not_activity' })
  })

  it('lee un TCX de running', () => {
    const tp = (i: number) =>
      `<Trackpoint><Time>${new Date(start.getTime() + i * 1000).toISOString()}</Time><Position><LatitudeDegrees>${4.6 + i * 0.00002}</LatitudeDegrees><LongitudeDegrees>-74.05</LongitudeDegrees></Position><AltitudeMeters>2600</AltitudeMeters><DistanceMeters>${i * 3}</DistanceMeters><HeartRateBpm><Value>${150}</Value></HeartRateBpm></Trackpoint>`
    const tcx = `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>${start.toISOString()}</Id><Lap StartTime="${start.toISOString()}"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>5400</DistanceMeters><Track>${Array.from({ length: 1801 }, (_, i) => tp(i)).join('')}</Track></Lap><Creator><Name>Forerunner 255</Name><UnitId>999</UnitId></Creator></Activity></Activities></TrainingCenterDatabase>`
    const { summary } = parseActivityFile({ name: 'carrera.tcx', bytes: strToU8(tcx) })
    expect(summary.sport).toBe('running')
    expect(summary.distanceM).toBe(5400)
    expect(summary.elapsedS).toBe(1800)
    expect(summary.avgHr).toBe(150)
    expect(summary.deviceSerial).toBe('999')
  })

  it('rechaza tipos que no son actividades', () => {
    const [out] = [...parseUpload({ name: 'foto.jpg', bytes: new Uint8Array([0xff, 0xd8]) })]
    expect(out).toMatchObject({ ok: false, code: 'unsupported_type' })
  })
})

describe('exportaciones completas', () => {
  it('lee el zip de Strava: tipo, nombre, esfuerzo y actividades manuales', () => {
    const fitGz = gzipSync(encodeFit(ride, start, { sport: 'cycling' }))
    const csv = stravaCsv([
      { id: '111', date: start, name: 'Gravel con amigos', type: 'Gravel Ride', elapsedS: 10800, distanceM: 72000, filename: 'activities/111.fit.gz', rpe: 6 },
      { id: '222', date: new Date('2026-11-19T22:00:00Z'), name: 'Pesas', type: 'Weight Training', elapsedS: 3600, distanceM: 0, filename: '' },
    ])
    const zip = stravaExportZip({ 'activities.csv': csv, 'activities/111.fit.gz': fitGz, 'profile.csv': 'x' })
    const out = okOnly([...parseUpload({ name: 'export_123.zip', bytes: zip })])
    expect(out).toHaveLength(2)
    const g = out.find((o) => o.activity.summary.sport === 'cycling')!.activity
    expect(g.summary.subSport).toBe('gravel') // del CSV: el FIT decía solo "cycling"
    expect(g.summary.title).toBe('Gravel con amigos')
    expect(g.summary.rpe).toBe(6)
    expect(g.originHint).toBe('strava_export')
    const gym = out.find((o) => o.activity.summary.sport === 'strength')!.activity
    expect(gym.format).toBe('manual')
    expect(gym.summary.elapsedS).toBe(3600)
    expect(gym.summary.externalId).toBe('strava-export:222')
  })

  it('lee la exportación de Garmin con zips dentro de zips', () => {
    const inner = zipSync({ 'a.fit': encodeFit(ride, start, { sport: 'cycling', subSport: 'road' }) })
    const outer = zipSync({ 'DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip': inner, 'DI_CONNECT/x.json': strToU8('{}') })
    const out = okOnly([...parseUpload({ name: 'garmin.zip', bytes: outer })])
    expect(out).toHaveLength(1)
    expect(out[0].activity.originHint).toBe('garmin_export')
  })

  it('CSV con comillas, comas y saltos de línea', () => {
    expect(parseCsv('a,b\n"x, y","línea\nnueva"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'línea\nnueva'],
    ])
    expect(parseStravaActivitiesCsv('Activity ID,Activity Type\n1,Ride\n')[0].mapping.sport).toBe('cycling')
  })
})

describe('triatlón grabado en modo multideporte', () => {
  // Archivo .FIT con 5 sesiones: natación, transición, bici, transición, running
  async function multisportFit() {
    const { Encoder, Profile } = await import('@garmin/fitsdk')
    const e = new Encoder()
    const t0 = new Date('2026-12-07T11:00:00Z')
    e.writeMesg({ mesgNum: Profile.MesgNum.FILE_ID, type: 'activity', manufacturer: 'garmin', product: 1, serialNumber: 99, timeCreated: t0 } as never)
    const legs = [
      { sport: 'swimming', subSport: 'openWater', secs: 2400, km: 1.9 },
      { sport: 'transition', subSport: 'generic', secs: 240, km: 0 },
      { sport: 'cycling', subSport: 'road', secs: 11700, km: 90 },
      { sport: 'transition', subSport: 'generic', secs: 120, km: 0 },
      { sport: 'running', subSport: 'road', secs: 7500, km: 21.1 },
    ]
    let t = t0.getTime()
    for (const l of legs) {
      const st = new Date(t)
      for (let i = 0; i <= l.secs; i += 60)
        e.writeMesg({ mesgNum: Profile.MesgNum.RECORD, timestamp: new Date(t + i * 1000), heartRate: 140, distance: (l.km * 1000 * i) / l.secs } as never)
      e.writeMesg({
        mesgNum: Profile.MesgNum.SESSION,
        timestamp: new Date(t + l.secs * 1000),
        startTime: st,
        sport: l.sport,
        subSport: l.subSport,
        totalElapsedTime: l.secs,
        totalTimerTime: l.secs,
        totalDistance: l.km * 1000,
      } as never)
      t += l.secs * 1000
    }
    return e.close()
  }

  it('se separa en tres actividades (natación, bici, running) sin las transiciones', async () => {
    const out: ParseOutcome[] = []
    for (const o of parseUpload({ name: 'triatlon.fit', bytes: await multisportFit() })) out.push(o)
    const ok = okOnly(out)
    expect(ok.map((o) => o.activity.summary.sport)).toEqual(['swimming', 'cycling', 'running'])
    expect(ok.map((o) => Math.round((o.activity.summary.distanceM ?? 0) / 100) / 10)).toEqual([1.9, 90, 21.1])
    expect(ok[0].activity.summary.title).toBe('Triatlón · Natación')
    // Cada tramo con su identificador y su huella: no se toman como duplicados entre sí
    expect(new Set(ok.map((o) => o.activity.summary.externalId)).size).toBe(3)
    expect(ok[1].activity.summary.startTime > ok[0].activity.summary.startTime).toBe(true)
  })
})
