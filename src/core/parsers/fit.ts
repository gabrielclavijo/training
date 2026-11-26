import { Decoder, Stream } from '@garmin/fitsdk'
import { fromFit } from '../activity/sport'
import type { ParsedActivity, Sample } from '../activity/types'
import { buildParsed } from './build'
import { ImportError } from './errors'

const SEMI_TO_DEG = 180 / 2 ** 31

type FitRecord = {
  timestamp?: Date
  heartRate?: number
  power?: number
  cadence?: number
  positionLat?: number
  positionLong?: number
  enhancedAltitude?: number
  altitude?: number
  distance?: number
  enhancedSpeed?: number
  speed?: number
}

type FitSession = {
  startTime?: Date
  sport?: string
  subSport?: string
  totalElapsedTime?: number
  totalTimerTime?: number
  totalDistance?: number
  totalAscent?: number
  avgHeartRate?: number
  maxHeartRate?: number
  avgPower?: number
  normalizedPower?: number
  avgCadence?: number
}

/** Lee un archivo .FIT (Garmin, Wahoo, Coros, Suunto, Polar… todos usan este formato). */
export function parseFit(bytes: Uint8Array, filename = ''): ParsedActivity {
  const stream = Stream.fromByteArray(bytes)
  if (!Decoder.isFIT(stream)) throw new ImportError('corrupt', `${filename}: no es FIT`)
  const decoder = new Decoder(Stream.fromByteArray(bytes))
  const { messages, errors } = decoder.read({ convertDateTimesToDates: true, expandComponents: true, mergeHeartRates: true })
  const fileId = messages.fileIdMesgs?.[0] as
    | { type?: string; serialNumber?: number; timeCreated?: Date; manufacturer?: string; garminProduct?: string; product?: number }
    | undefined
  if (fileId?.type && fileId.type !== 'activity') throw new ImportError('not_activity', `tipo ${fileId.type}`)

  const records = (messages.recordMesgs ?? []) as FitRecord[]
  const sessions = (messages.sessionMesgs ?? []) as FitSession[]
  if (records.length === 0 && sessions.length === 0) {
    throw new ImportError(errors?.length ? 'corrupt' : 'not_activity')
  }
  // Multideporte (p. ej. triatlón): aquí se toma la sesión más larga; parseFitLegs separa los tramos.
  const session = [...sessions].sort((a, b) => (b.totalElapsedTime ?? 0) - (a.totalElapsedTime ?? 0))[0]
  return fromSession({ session, records, fileId, filename })
}

type FitFileId = { type?: string; serialNumber?: number; timeCreated?: Date; manufacturer?: string; garminProduct?: string; product?: number } | undefined

function fromSession({
  session,
  records,
  fileId,
  legIndex,
}: {
  session: FitSession | undefined
  records: FitRecord[]
  fileId: FitFileId
  filename: string
  legIndex?: number
}): ParsedActivity {
  const t0 = session?.startTime ?? records.find((r) => r.timestamp)?.timestamp ?? fileId?.timeCreated ?? null
  const samples: Sample[] = []
  for (const r of records) {
    if (!r.timestamp || !t0) continue
    samples.push({
      t: (r.timestamp.getTime() - t0.getTime()) / 1000,
      hr: r.heartRate,
      power: r.power,
      cadence: r.cadence,
      lat: r.positionLat !== undefined ? r.positionLat * SEMI_TO_DEG : undefined,
      lon: r.positionLong !== undefined ? r.positionLong * SEMI_TO_DEG : undefined,
      alt: r.enhancedAltitude ?? r.altitude,
      dist: r.distance,
      speed: r.enhancedSpeed ?? r.speed,
    })
  }

  const mapping = fromFit(session?.sport, session?.subSport)
  const serial = fileId?.serialNumber ? String(fileId.serialNumber) : null
  return buildParsed({
    samples,
    startTime: t0,
    format: 'fit',
    base: {
      ...mapping,
      rawSport: [session?.sport, session?.subSport].filter(Boolean).join('/') || null,
      deviceSerial: serial,
      deviceName: fileId?.garminProduct ?? fileId?.manufacturer ?? null,
      // Identificador estable del dispositivo: serial + hora de creación del archivo
      externalId:
        serial && fileId?.timeCreated ? `fit:${serial}:${fileId.timeCreated.getTime() / 1000}${legIndex !== undefined ? `:leg${legIndex}` : ''}` : null,
    },
    totals: session
      ? {
          elapsedS: session.totalElapsedTime,
          movingS: session.totalTimerTime,
          distanceM: session.totalDistance ?? undefined,
          elevationGainM: session.totalAscent,
          avgHr: session.avgHeartRate,
          maxHr: session.maxHeartRate,
          avgPowerW: session.avgPower,
          normalizedPowerW: session.normalizedPower,
          avgCadence: session.avgCadence,
        }
      : undefined,
  })
}

const LEG_SPORTS = new Set(['swimming', 'cycling', 'running'])
const LEG_NAME: Record<string, string> = { swimming: 'Natación', cycling: 'Bici', running: 'Running' }

/**
 * Archivo multideporte (triatlón grabado con un reloj Garmin): devuelve una
 * actividad por tramo (natación, bici, running) y descarta las transiciones.
 * Null si el archivo no es multideporte.
 */
export function parseFitLegs(bytes: Uint8Array, filename = ''): ParsedActivity[] | null {
  const stream = Stream.fromByteArray(bytes)
  if (!Decoder.isFIT(stream)) return null
  const { messages } = new Decoder(Stream.fromByteArray(bytes)).read({ convertDateTimesToDates: true, expandComponents: true, mergeHeartRates: true })
  const sessions = ((messages.sessionMesgs ?? []) as FitSession[]).filter((x) => LEG_SPORTS.has((x.sport ?? '').toLowerCase()))
  if (sessions.length < 2 || new Set(sessions.map((x) => x.sport)).size < 2) return null
  const records = (messages.recordMesgs ?? []) as FitRecord[]
  const fileId = messages.fileIdMesgs?.[0] as FitFileId
  return [...sessions]
    .sort((a, b) => (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0))
    .map((sess, i) => {
      const start = sess.startTime?.getTime() ?? 0
      const end = start + (sess.totalElapsedTime ?? 0) * 1000
      const mine = records.filter((r) => r.timestamp && r.timestamp.getTime() >= start && r.timestamp.getTime() <= end)
      const p = fromSession({ session: sess, records: mine, fileId, filename, legIndex: i })
      // Quedan enlazadas por el nombre (y por su identificador «…:legN»)
      p.summary.title ??= `Triatlón · ${LEG_NAME[p.summary.sport] ?? p.summary.sport}`
      // Sin número de serie del reloj, un identificador por tramo igual (evita que se vean como duplicados)
      p.summary.externalId ??= `fit-legs:${start}:leg${i}`
      return p
    })
}
