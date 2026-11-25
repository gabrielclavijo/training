import { fromStravaType, reconcileSport, type SportMapping } from '../activity/sport'
import { emptySummary, type ParsedActivity } from '../activity/types'
import { parseCsv } from './csv'

/**
 * Lee activities.csv de la exportación completa de Strava ("Descargar tu cuenta").
 * Es un archivo que la persona descarga de SU cuenta: no viene de la API de Strava,
 * así que no le aplican el límite de 7 días ni la restricción de IA de la API.
 *
 * Sirve para: (1) saber el tipo exacto de cada archivo (ej. "Gravel Ride"),
 * (2) el nombre y el esfuerzo percibido, y (3) importar las actividades que se
 * registraron a mano en Strava y no tienen archivo.
 */
export interface StravaExportRow {
  activityId: string
  title: string | null
  mapping: SportMapping
  rawType: string
  startTime: string | null
  elapsedS: number | null
  movingS: number | null
  distanceM: number | null
  elevationGainM: number | null
  rpe: number | null
  filename: string | null // ruta dentro del zip, ej. "activities/123.fit.gz"
}

export function parseStravaActivitiesCsv(text: string): StravaExportRow[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const header = rows[0].map((h) => h.trim())
  // Hay columnas repetidas: la primera "Distance" viene en km y la segunda en metros;
  // la primera "Elapsed Time" y la segunda en segundos. Tomamos la última de cada una.
  const first = (name: string) => header.indexOf(name)
  const last = (name: string) => header.lastIndexOf(name)
  const col = {
    id: first('Activity ID'),
    date: first('Activity Date'),
    name: first('Activity Name'),
    type: first('Activity Type'),
    elapsed: last('Elapsed Time'),
    moving: first('Moving Time'),
    distance: last('Distance'),
    distanceIsKm: first('Distance') === last('Distance'),
    elev: first('Elevation Gain'),
    rpe: first('Perceived Exertion'),
    filename: first('Filename'),
  }
  if (col.id < 0 || col.type < 0) return []

  const n = (v: string | undefined) => {
    if (v === undefined || v.trim() === '') return null
    const x = Number(v.replace(',', '.'))
    return Number.isFinite(x) ? x : null
  }

  return rows.slice(1).map((r) => {
    const rawType = r[col.type] ?? ''
    let distanceM = col.distance >= 0 ? n(r[col.distance]) : null
    if (distanceM !== null && col.distanceIsKm) distanceM *= 1000
    const rpe = col.rpe >= 0 ? n(r[col.rpe]) : null
    return {
      activityId: r[col.id],
      title: r[col.name]?.trim() || null,
      mapping: fromStravaType(rawType),
      rawType,
      startTime: parseStravaDate(r[col.date]),
      elapsedS: col.elapsed >= 0 ? n(r[col.elapsed]) : null,
      movingS: col.moving >= 0 ? n(r[col.moving]) : null,
      distanceM,
      elevationGainM: col.elev >= 0 ? n(r[col.elev]) : null,
      rpe: rpe !== null && rpe >= 1 && rpe <= 10 ? Math.round(rpe) : null,
      filename: col.filename >= 0 && r[col.filename]?.trim() ? r[col.filename].trim() : null,
    }
  })
}

/** "Nov 20, 2026, 11:00:00 AM" (UTC) → ISO */
export function parseStravaDate(v?: string): string | null {
  if (!v) return null
  const d = new Date(`${v.trim()} UTC`)
  if (!Number.isNaN(d.getTime())) return d.toISOString()
  const d2 = new Date(v)
  return Number.isNaN(d2.getTime()) ? null : d2.toISOString()
}

/** Actividad registrada a mano en Strava (sin archivo): se importa con lo que trae el CSV. */
export function manualFromStravaRow(row: StravaExportRow): ParsedActivity | null {
  if (!row.startTime || !row.elapsedS || row.elapsedS <= 0) return null
  const summary = emptySummary({
    ...row.mapping,
    rawSport: row.rawType,
    title: row.title,
    startTime: row.startTime,
    elapsedS: Math.round(row.elapsedS),
    movingS: row.movingS,
    distanceM: row.distanceM && row.distanceM > 0 ? row.distanceM : null,
    elevationGainM: row.elevationGainM,
    rpe: row.rpe,
  })
  const fixed = reconcileSport({ sport: summary.sport, subSport: summary.subSport }, summary)
  summary.sport = fixed.sport
  summary.subSport = fixed.subSport
  return { summary, streams: null, format: 'manual', originHint: 'strava_export' }
}
