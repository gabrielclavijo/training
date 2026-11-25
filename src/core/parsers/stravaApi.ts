import { fromStravaType, reconcileSport } from '../activity/sport'
import type { ParsedActivity, Sample } from '../activity/types'
import { buildParsed } from './build'
import { ImportError } from './errors'

/**
 * Convierte una actividad de la API de Strava (detalle + series) al formato de
 * la app. Lo que sale de aquí se guarda como caché de 7 días y nunca va a IA.
 */

export interface StravaApiActivity {
  id: number | string
  name?: string
  sport_type?: string
  type?: string
  start_date: string
  timezone?: string
  elapsed_time: number
  moving_time?: number
  distance?: number
  total_elevation_gain?: number
  average_heartrate?: number
  max_heartrate?: number
  average_watts?: number
  weighted_average_watts?: number
  device_watts?: boolean
  average_cadence?: number
  perceived_exertion?: number | null
  device_name?: string
}

export type StravaStreams = Partial<Record<'time' | 'heartrate' | 'watts' | 'latlng' | 'altitude' | 'distance' | 'cadence' | 'velocity_smooth', { data: unknown[] }>>

export interface StravaInboxPayload {
  activity: StravaApiActivity
  streams?: StravaStreams | null
}

/** "(GMT-05:00) America/Bogota" → "America/Bogota" */
function ianaTz(tz?: string) {
  const m = tz?.match(/\)\s*(.+)$/)
  return m ? m[1] : null
}

export function parseStravaApi(payload: StravaInboxPayload): ParsedActivity {
  const a = payload.activity
  if (!a?.start_date || !a.elapsed_time) throw new ImportError('empty')
  const mapping = fromStravaType(a.sport_type ?? a.type)
  const st = payload.streams ?? {}
  const time = (st.time?.data as number[] | undefined) ?? []
  const samples: Sample[] = time.map((t, i) => {
    const ll = (st.latlng?.data as [number, number][] | undefined)?.[i]
    return {
      t,
      hr: (st.heartrate?.data as number[] | undefined)?.[i],
      power: a.device_watts ? (st.watts?.data as number[] | undefined)?.[i] : undefined,
      cadence: (st.cadence?.data as number[] | undefined)?.[i],
      lat: ll?.[0],
      lon: ll?.[1],
      alt: (st.altitude?.data as number[] | undefined)?.[i],
      dist: (st.distance?.data as number[] | undefined)?.[i],
      speed: (st.velocity_smooth?.data as number[] | undefined)?.[i],
    }
  })
  const parsed = buildParsed({
    samples,
    startTime: new Date(a.start_date),
    format: 'strava_api',
    originHint: 'other',
    base: {
      ...mapping,
      rawSport: a.sport_type ?? a.type ?? null,
      title: a.name ?? null,
      timezone: ianaTz(a.timezone),
      externalId: `strava:${a.id}`,
      deviceName: a.device_name ?? null,
    },
    totals: {
      elapsedS: a.elapsed_time,
      movingS: a.moving_time,
      distanceM: a.distance && a.distance > 0 ? a.distance : undefined,
      elevationGainM: a.total_elevation_gain,
      avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : undefined,
      maxHr: a.max_heartrate ? Math.round(a.max_heartrate) : undefined,
      avgPowerW: a.device_watts && a.average_watts ? Math.round(a.average_watts) : undefined,
      normalizedPowerW: a.device_watts && a.weighted_average_watts ? a.weighted_average_watts : undefined,
      avgCadence: a.average_cadence ? Math.round(a.average_cadence) : undefined,
    },
  })
  // Sin series (ej. actividad manual en Strava): el pulso promedio basta para la carga
  if (samples.length < 2 && a.average_heartrate) parsed.summary.hasHr = true
  if (a.perceived_exertion && a.perceived_exertion >= 1 && a.perceived_exertion <= 10) parsed.summary.rpe = Math.round(a.perceived_exertion)
  const fixed = reconcileSport({ sport: parsed.summary.sport, subSport: parsed.summary.subSport }, parsed.summary)
  parsed.summary.sport = fixed.sport
  parsed.summary.subSport = fixed.subSport
  return parsed
}
