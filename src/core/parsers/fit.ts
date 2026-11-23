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
  const fileId = messages.fileIdMesgs?.[0] as { type?: string; serialNumber?: number; timeCreated?: Date; manufacturer?: string; garminProduct?: string; product?: number } | undefined
  if (fileId?.type && fileId.type !== 'activity') throw new ImportError('not_activity', `tipo ${fileId.type}`)

  const records = (messages.recordMesgs ?? []) as FitRecord[]
  const sessions = (messages.sessionMesgs ?? []) as FitSession[]
  if (records.length === 0 && sessions.length === 0) {
    throw new ImportError(errors?.length ? 'corrupt' : 'not_activity')
  }
  // Multideporte (p. ej. triatlón): por ahora tomamos la sesión más larga.
  const session = [...sessions].sort((a, b) => (b.totalElapsedTime ?? 0) - (a.totalElapsedTime ?? 0))[0]

  const t0 = (session?.startTime ?? records.find((r) => r.timestamp)?.timestamp ?? fileId?.timeCreated) ?? null
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
      externalId: serial && fileId?.timeCreated ? `fit:${serial}:${fileId.timeCreated.getTime() / 1000}` : null,
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
