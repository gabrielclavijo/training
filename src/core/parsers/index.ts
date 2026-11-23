import { gunzipSync, unzipSync } from 'fflate'
import type { SportMapping } from '../activity/sport'
import type { OriginHint, ParsedActivity } from '../activity/types'
import { ImportError } from './errors'
import { parseFit } from './fit'
import { parseGpx } from './gpx'
import { manualFromStravaRow, parseStravaActivitiesCsv, type StravaExportRow } from './stravaExport'
import { parseTcx } from './tcx'

export { ImportError } from './errors'
export type { ImportErrorCode } from './errors'

export const ACCEPTED_EXTENSIONS = ['.fit', '.gpx', '.tcx', '.zip', '.fit.gz', '.gpx.gz', '.tcx.gz']
const MAX_FILE_BYTES = 1024 * 1024 * 1024 // 1 GB para exportaciones completas

export interface FileEntry {
  name: string
  bytes: Uint8Array
}

/** Resultado de procesar un archivo (o cada actividad dentro de un .zip). */
export type ParseOutcome =
  | { ok: true; name: string; activity: ParsedActivity; raw?: Uint8Array }
  | { ok: false; name: string; code: ImportError['code'] }

const lower = (s: string) => s.toLowerCase()
const isActivityFile = (n: string) => /\.(fit|gpx|tcx)(\.gz)?$/i.test(n)

/** Lee una actividad suelta (.fit, .gpx, .tcx, opcionalmente comprimida con .gz). */
export function parseActivityFile(entry: FileEntry, hint?: SportMapping, originHint: OriginHint = 'device_file'): ParsedActivity {
  let { name, bytes } = entry
  if (/\.gz$/i.test(name)) {
    try {
      bytes = gunzipSync(bytes)
    } catch {
      throw new ImportError('corrupt', 'gzip dañado')
    }
    name = name.replace(/\.gz$/i, '')
  }
  const n = lower(name)
  let parsed: ParsedActivity
  if (n.endsWith('.fit')) parsed = parseFit(bytes, name)
  else if (n.endsWith('.gpx')) parsed = parseGpx(new TextDecoder().decode(bytes), hint)
  else if (n.endsWith('.tcx')) parsed = parseTcx(new TextDecoder().decode(bytes).trimStart(), hint)
  else throw new ImportError('unsupported_type', name)

  // El tipo de la exportación de Strava es más preciso que el del archivo (ej. "Gravel Ride").
  if (hint && hint.sport !== 'other') {
    parsed.summary.sport = hint.sport
    if (hint.subSport) parsed.summary.subSport = hint.subSport
  }
  parsed.originHint = originHint
  return parsed
}

/**
 * Procesa lo que la persona sube: archivos sueltos o un .zip de exportación
 * (Strava o Garmin, con zips dentro de zips). Va entregando resultados uno a
 * uno para poder mostrar el progreso.
 */
export function* parseUpload(entry: FileEntry): Generator<ParseOutcome, void, void> {
  if (entry.bytes.byteLength > MAX_FILE_BYTES) {
    yield { ok: false, name: entry.name, code: 'too_large' }
    return
  }
  if (!/\.zip$/i.test(entry.name)) {
    yield parseOne(entry)
    return
  }
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(entry.bytes)
  } catch {
    yield { ok: false, name: entry.name, code: 'corrupt' }
    return
  }
  yield* parseArchive(files)
}

function parseOne(entry: FileEntry, hint?: SportMapping, originHint?: OriginHint): ParseOutcome {
  try {
    return { ok: true, name: entry.name, activity: parseActivityFile(entry, hint, originHint), raw: entry.bytes }
  } catch (e) {
    return { ok: false, name: entry.name, code: e instanceof ImportError ? e.code : 'corrupt' }
  }
}

export function countActivitiesInArchive(files: Record<string, Uint8Array>): number {
  return Object.keys(files).filter(isActivityFile).length
}

function* parseArchive(
  files: Record<string, Uint8Array>,
  depth = 0,
  inheritedOrigin?: OriginHint,
): Generator<ParseOutcome, void, void> {
  const names = Object.keys(files)
  const csvName = names.find((n) => /(^|\/)activities\.csv$/i.test(n))
  const isStrava = Boolean(csvName)
  const isGarmin = names.some((n) => /DI_CONNECT|DI-Connect/i.test(n))
  const originHint: OriginHint = isStrava ? 'strava_export' : isGarmin ? 'garmin_export' : (inheritedOrigin ?? 'other')

  let stravaRows: StravaExportRow[] = []
  if (csvName) stravaRows = parseStravaActivitiesCsv(new TextDecoder().decode(files[csvName]))
  const byFile = new Map(stravaRows.filter((r) => r.filename).map((r) => [lower(r.filename!), r]))

  for (const name of names) {
    if (name.endsWith('/')) continue
    if (/\.zip$/i.test(name) && depth < 3) {
      // Exportación de Garmin: los .fit vienen en zips dentro del zip principal.
      try {
        const nestedOrigin = /DI_CONNECT|DI-Connect/i.test(name) ? 'garmin_export' : originHint
        yield* parseArchive(unzipSync(files[name]), depth + 1, nestedOrigin)
      } catch {
        yield { ok: false, name, code: 'corrupt' }
      }
      continue
    }
    if (!isActivityFile(name)) continue
    const row = byFile.get(lower(name))
    const outcome = parseOne({ name, bytes: files[name] }, row?.mapping, originHint)
    if (outcome.ok && row) {
      outcome.activity.summary.title ??= row.title
      outcome.activity.summary.rpe ??= row.rpe
      outcome.activity.summary.externalId ??= `strava-export:${row.activityId}`
    }
    yield outcome
  }

  // Actividades de Strava registradas a mano (sin archivo)
  for (const row of stravaRows.filter((r) => !r.filename)) {
    const a = manualFromStravaRow(row)
    if (a) {
      a.summary.externalId = `strava-export:${row.activityId}`
      yield { ok: true, name: `Strava: ${row.title ?? row.activityId}`, activity: a }
    }
  }
}

/** SHA-256 en hexadecimal (detecta el mismo archivo subido dos veces). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
