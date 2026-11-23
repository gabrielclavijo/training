/** Tipos comunes de actividades. Todo en SI: metros, segundos, vatios, m/s. */

export type Sport = 'cycling' | 'running' | 'swimming' | 'strength' | 'other'
export type SubSport =
  | 'road'
  | 'mtb'
  | 'gravel'
  | 'indoor'
  | 'track'
  | 'trail'
  | 'treadmill'
  | 'pool'
  | 'open_water'
  | 'generic'

export type SourceFormat = 'fit' | 'gpx' | 'tcx' | 'manual' | 'strava_api' | 'garmin_api'
export type Provider = 'file' | 'manual' | 'strava' | 'garmin_api' | 'demo'
export type OriginHint = 'strava_export' | 'garmin_export' | 'device_file' | 'other'

/** Una muestra de la grabación (1 por segundo o menos). Los campos faltantes son undefined. */
export interface Sample {
  t: number // segundos desde el inicio
  hr?: number
  power?: number
  cadence?: number
  lat?: number
  lon?: number
  alt?: number
  dist?: number // distancia acumulada en metros, si el dispositivo la da
  speed?: number // m/s
}

/** Series reducidas (1 muestra cada 5 s) que se guardan para gráficas y fusiones. */
export interface Streams {
  t: number[]
  hr?: (number | null)[]
  power?: (number | null)[]
  cadence?: (number | null)[]
  lat?: (number | null)[]
  lon?: (number | null)[]
  alt?: (number | null)[]
  dist?: (number | null)[]
}

/** Resumen de una actividad tal como salió de UNA fuente (un archivo, una entrada manual…). */
export interface ActivitySummary {
  sport: Sport
  subSport: SubSport | null
  rawSport: string | null
  title: string | null
  startTime: string // ISO UTC
  timezone: string | null
  elapsedS: number
  movingS: number | null
  distanceM: number | null
  elevationGainM: number | null
  avgHr: number | null
  maxHr: number | null
  avgPowerW: number | null
  normalizedPowerW: number | null
  avgCadence: number | null
  avgSpeedMs: number | null
  hasPower: boolean
  hasHr: boolean
  hasGps: boolean
  hasCadence: boolean
  hrSamples: number
  powerSamples: number
  gpsPoints: number
  /** [[ppm, segundos], …] — permite recalcular la carga por pulso con otros umbrales */
  hrHistogram: [number, number][] | null
  /** [[vatios (de a 5), segundos], …] */
  powerHistogram: [number, number][] | null
  /** Mejor potencia media por duración (s → W) */
  powerCurve: Record<string, number> | null
  deviceSerial: string | null
  deviceName: string | null
  externalId: string | null
  rpe: number | null
}

export interface ParsedActivity {
  summary: ActivitySummary
  streams: Streams | null
  format: SourceFormat
  originHint: OriginHint
}

export function emptySummary(partial: Partial<ActivitySummary> & Pick<ActivitySummary, 'sport' | 'startTime' | 'elapsedS'>): ActivitySummary {
  return {
    subSport: null,
    rawSport: null,
    title: null,
    timezone: null,
    movingS: null,
    distanceM: null,
    elevationGainM: null,
    avgHr: null,
    maxHr: null,
    avgPowerW: null,
    normalizedPowerW: null,
    avgCadence: null,
    avgSpeedMs: null,
    hasPower: false,
    hasHr: false,
    hasGps: false,
    hasCadence: false,
    hrSamples: 0,
    powerSamples: 0,
    gpsPoints: 0,
    hrHistogram: null,
    powerHistogram: null,
    powerCurve: null,
    deviceSerial: null,
    deviceName: null,
    externalId: null,
    rpe: null,
    ...partial,
  }
}
