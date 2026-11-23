import { Encoder, Profile } from '@garmin/fitsdk'
import { strToU8, zipSync } from 'fflate'
import type { Sample } from '../core/activity/types'
import { haversine } from '../core/activity/summarize'

/**
 * Generador de grabaciones sintéticas (deterministas) para pruebas automáticas
 * y para el botón «Cargar datos de prueba». Produce archivos reales (.FIT, .GPX,
 * zip de exportación de Strava) que pasan por los mismos lectores que los de
 * verdad.
 */

export interface SimOptions {
  durationS: number
  distanceM: number
  elevationGainM: number
  hrBase?: number // ppm promedio aproximado; undefined = sin pulso
  powerAvg?: number // W; undefined = sin potencia
  startLat?: number
  startLon?: number
  startAlt?: number
  seed?: number
}

/** Generador pseudoaleatorio con semilla (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function simulate(o: SimOptions): Sample[] {
  const rand = rng(o.seed ?? 1)
  const lat0 = o.startLat ?? 4.861 // Sabana de Bogotá
  const lon0 = o.startLon ?? -74.033
  const alt0 = o.startAlt ?? 2600
  const n = Math.max(2, Math.round(o.durationS))
  const out: Sample[] = []
  // Recorrido de ida y vuelta: la mitad del desnivel sube en la ida
  const climbs = Math.max(1, Math.round(o.elevationGainM / 300))
  const amp = o.elevationGainM / (2 * climbs)
  const metersPerDegLat = 111_320
  const bearing = 0.6 // radianes
  for (let i = 0; i <= n; i++) {
    const f = i / n
    const half = f < 0.5 ? f * 2 : (1 - f) * 2 // 0→1→0 (ida y vuelta)
    const d = o.distanceM * f
    const along = (o.distanceM / 2) * half
    const lat = lat0 + (along * Math.cos(bearing)) / metersPerDegLat
    const lon = lon0 + (along * Math.sin(bearing)) / (metersPerDegLat * Math.cos((lat0 * Math.PI) / 180))
    const alt = alt0 + amp * (1 - Math.cos(2 * Math.PI * climbs * f)) + (rand() - 0.5) * 0.4
    const effort = 0.5 * (1 + Math.sin(2 * Math.PI * climbs * f)) // más esfuerzo subiendo
    out.push({
      t: i,
      lat,
      lon,
      alt,
      dist: d,
      hr: o.hrBase !== undefined ? Math.round(o.hrBase - 12 + 24 * effort + (rand() - 0.5) * 4) : undefined,
      power: o.powerAvg !== undefined ? Math.max(0, Math.round(o.powerAvg * (0.7 + 0.6 * effort) + (rand() - 0.5) * 30)) : undefined,
      cadence: o.powerAvg !== undefined ? Math.round(85 + (rand() - 0.5) * 6) : undefined,
    })
  }
  return out
}

const DEG_TO_SEMI = 2 ** 31 / 180

export interface FitOptions {
  sport: string // nombre FIT: 'cycling', 'running', 'swimming', 'training'
  subSport?: string // 'gravelCycling', 'road', 'mountain', 'strengthTraining'…
  serialNumber?: number
  includeGps?: boolean
}

/** Codifica muestras como un archivo .FIT real (con el SDK oficial de Garmin). */
export function encodeFit(samples: Sample[], start: Date, opt: FitOptions): Uint8Array {
  const e = new Encoder()
  // Los tipos del SDK son muy estrictos por mensaje; aquí armamos objetos genéricos.
  const write = (m: { mesgNum: number } & Record<string, unknown>) => e.writeMesg(m as never)
  const ts = (t: number) => new Date(start.getTime() + Math.round(t) * 1000)
  write({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: 'activity',
    manufacturer: 'garmin',
    product: 3843,
    serialNumber: opt.serialNumber ?? 3_400_000_001,
    timeCreated: start,
  })
  const gps = opt.includeGps ?? true
  for (const s of samples) {
    const rec: { mesgNum: number } & Record<string, unknown> = { mesgNum: Profile.MesgNum.RECORD, timestamp: ts(s.t) }
    if (gps && s.lat !== undefined && s.lon !== undefined) {
      rec.positionLat = Math.round(s.lat * DEG_TO_SEMI)
      rec.positionLong = Math.round(s.lon * DEG_TO_SEMI)
    }
    if (s.alt !== undefined) rec.enhancedAltitude = s.alt
    if (s.dist !== undefined) rec.distance = s.dist
    if (s.hr !== undefined) rec.heartRate = s.hr
    if (s.power !== undefined) rec.power = s.power
    if (s.cadence !== undefined) rec.cadence = s.cadence
    write(rec)
  }
  const last = samples[samples.length - 1]
  write({
    mesgNum: Profile.MesgNum.SESSION,
    timestamp: ts(last?.t ?? 0),
    startTime: start,
    sport: opt.sport,
    subSport: opt.subSport ?? 'generic',
    totalElapsedTime: last?.t ?? 0,
    totalTimerTime: last?.t ?? 0,
    totalDistance: last?.dist,
  })
  return e.close()
}

/** GPX como el que entrega la exportación de Strava (sin potencia, con pulso). */
export function encodeGpx(samples: Sample[], start: Date, opt: { name: string; type: string }): string {
  const pts = samples
    .map((s) => {
      const time = new Date(start.getTime() + Math.round(s.t) * 1000).toISOString().replace('.000', '')
      const hr = s.hr !== undefined ? `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${s.hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>` : ''
      return `<trkpt lat="${s.lat!.toFixed(7)}" lon="${s.lon!.toFixed(7)}"><ele>${s.alt!.toFixed(1)}</ele><time>${time}</time>${hr}</trkpt>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <metadata><time>${start.toISOString()}</time></metadata>
 <trk><name>${opt.name}</name><type>${opt.type}</type><trkseg>
${pts}
 </trkseg></trk>
</gpx>`
}

export interface StravaCsvRow {
  id: string
  date: Date
  name: string
  type: string
  elapsedS: number
  distanceM: number
  filename: string
  rpe?: number
}

/** activities.csv con el formato de la exportación de Strava (columnas repetidas incluidas). */
export function stravaCsv(rows: StravaCsvRow[]): string {
  const header = [
    'Activity ID', 'Activity Date', 'Activity Name', 'Activity Type', 'Activity Description',
    'Elapsed Time', 'Distance', 'Max Heart Rate', 'Relative Effort', 'Commute', 'Activity Private Note',
    'Activity Gear', 'Filename', 'Athlete Weight', 'Bike Weight', 'Elapsed Time', 'Moving Time',
    'Distance', 'Max Speed', 'Average Speed', 'Elevation Gain', 'Perceived Exertion',
  ]
  const fmtDate = (d: Date) =>
    d.toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const lines = rows.map((r) =>
    [
      r.id, fmtDate(r.date), r.name, r.type, '', r.elapsedS, (r.distanceM / 1000).toFixed(2), '', '', 'false', '', '',
      r.filename, '', '', r.elapsedS, r.elapsedS, r.distanceM.toFixed(1), '', '', '', r.rpe ?? '',
    ].map(q).join(','),
  )
  return [header.map(q).join(','), ...lines].join('\n')
}

/** Zip como el de «Descargar tu cuenta» de Strava. */
export function stravaExportZip(files: Record<string, Uint8Array | string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {}
  for (const [k, v] of Object.entries(files)) entries[k] = typeof v === 'string' ? strToU8(v) : v
  return zipSync(entries)
}

/** Distancia total de una lista de muestras por GPS. */
export function gpsDistance(samples: Sample[]) {
  let d = 0
  for (let i = 1; i < samples.length; i++) {
    d += haversine(samples[i - 1].lat!, samples[i - 1].lon!, samples[i].lat!, samples[i].lon!)
  }
  return d
}
