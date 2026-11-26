import { gunzipSync, unzipSync } from 'fflate'
import { parseFitLegs } from './fit'
import { reconcileSport } from '../activity/sport'
import type { SportMapping } from '../activity/sport'
import type { OriginHint, ParsedActivity } from '../activity/types'
import { ImportError } from './errors'
import { parseFit } from './fit'
import { parseGpx } from './gpx'
import { manualFromStravaRow, parseStravaActivitiesCsv, type StravaExportRow } from './stravaExport'
import { parseTcx } from './tcx'
import { entryBlob, isZip, listZip, readEntry, type ZipEntry } from './zipReader'

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
  | { ok: false; name: string; code: ImportError['code']; skipped?: boolean }

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
  applyReconcile(parsed)
  return parsed
}

/** Ajusta el deporte si el archivo dice «gimnasio/otro» pero hubo desplazamiento. */
export function applyReconcile(parsed: ParsedActivity) {
  const s = parsed.summary
  const fixed = reconcileSport({ sport: s.sport, subSport: s.subSport }, s)
  s.sport = fixed.sport
  s.subSport = fixed.subSport
}

/**
 * Procesa lo que la persona sube: archivos sueltos o un .zip de exportación
 * (Strava o Garmin, con zips dentro de zips). Va entregando resultados uno a
 * uno para poder mostrar el progreso.
 */
export interface UploadOptions {
  /** Avisa cuántas actividades se encontraron (para «Importando 340 de 1.200»). */
  onDiscovered?: (count: number) => void
}

export function* parseUpload(entry: FileEntry, opts: UploadOptions = {}): Generator<ParseOutcome, void, void> {
  if (entry.bytes.byteLength > MAX_FILE_BYTES) {
    opts.onDiscovered?.(1)
    yield { ok: false, name: entry.name, code: 'too_large' }
    return
  }
  if (!/\.zip$/i.test(entry.name)) {
    opts.onDiscovered?.(1)
    yield* parseOne(entry)
    return
  }
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(entry.bytes)
  } catch {
    opts.onDiscovered?.(1)
    yield { ok: false, name: entry.name, code: 'corrupt' }
    return
  }
  yield* parseArchive(files, 0, undefined, opts)
}

function parseOne(entry: FileEntry, hint?: SportMapping, originHint?: OriginHint): ParseOutcome[] {
  try {
    // Triatlón grabado en modo multideporte: una actividad por tramo
    const legs = /\.fit(\.gz)?$/i.test(entry.name) ? parseFitLegsSafe(entry) : null
    if (legs) {
      return legs.map((activity, i) => {
        activity.originHint = originHint ?? 'device_file'
        // Huella distinta por tramo: volver a subir el archivo los reconoce como «ya estaban»
        const raw = new Uint8Array(entry.bytes.length + 8)
        raw.set(entry.bytes)
        raw.set(new TextEncoder().encode(`#leg${i}`.padEnd(8)), entry.bytes.length)
        return { ok: true as const, name: `${entry.name} (${i + 1}/${legs.length})`, activity, raw }
      })
    }
    return [{ ok: true, name: entry.name, activity: parseActivityFile(entry, hint, originHint), raw: entry.bytes }]
  } catch (e) {
    return [{ ok: false, name: entry.name, code: e instanceof ImportError ? e.code : 'corrupt' }]
  }
}

function parseFitLegsSafe(entry: FileEntry) {
  let bytes = entry.bytes
  if (/\.gz$/i.test(entry.name)) {
    try {
      bytes = gunzipSync(bytes)
    } catch {
      return null
    }
  }
  try {
    return parseFitLegs(bytes, entry.name)
  } catch {
    return null
  }
}

export function countActivitiesInArchive(files: Record<string, Uint8Array>): number {
  return Object.keys(files).filter(isActivityFile).length
}

function* parseArchive(
  files: Record<string, Uint8Array>,
  depth = 0,
  inheritedOrigin?: OriginHint,
  opts: UploadOptions = {},
): Generator<ParseOutcome, void, void> {
  const names = Object.keys(files)
  const csvName = names.find((n) => /(^|\/)activities\.csv$/i.test(n))
  const isStrava = Boolean(csvName)
  const isGarmin = names.some((n) => /DI_CONNECT|DI-Connect/i.test(n))
  const originHint: OriginHint = isStrava ? 'strava_export' : isGarmin ? 'garmin_export' : (inheritedOrigin ?? 'other')

  let stravaRows: StravaExportRow[] = []
  if (csvName) stravaRows = parseStravaActivitiesCsv(new TextDecoder().decode(files[csvName]))
  const byFile = new Map(stravaRows.filter((r) => r.filename).map((r) => [lower(r.filename!), r]))
  const manualRows = stravaRows.filter((r) => !r.filename)
  opts.onDiscovered?.(names.filter(isActivityFile).length + manualRows.length)

  for (const name of names) {
    if (name.endsWith('/')) continue
    if (/\.zip$/i.test(name) && depth < 3) {
      // Exportación de Garmin: los .fit vienen en zips dentro del zip principal.
      try {
        const nestedOrigin = /DI_CONNECT|DI-Connect/i.test(name) ? 'garmin_export' : originHint
        yield* parseArchive(unzipSync(files[name]), depth + 1, nestedOrigin, opts)
      } catch {
        opts.onDiscovered?.(1)
        yield { ok: false, name, code: 'corrupt' }
      }
      continue
    }
    if (!isActivityFile(name)) continue
    const row = byFile.get(lower(name))
    for (const outcome of parseOne({ name, bytes: files[name] }, row?.mapping, originHint)) {
      if (outcome.ok && row) {
        outcome.activity.summary.title ??= row.title
        outcome.activity.summary.rpe ??= row.rpe
        outcome.activity.summary.externalId ??= `strava-export:${row.activityId}`
      }
      yield outcome
    }
  }

  // Actividades de Strava registradas a mano (sin archivo)
  for (const row of manualRows) {
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

// ---------------------------------------------------------------------------
// Versión por partes (para archivos grandes): trabaja sobre un File/Blob y nunca
// carga el .zip entero en memoria. Es la que usa la app.
// ---------------------------------------------------------------------------

/** Tamaño máximo de un archivo suelto (.fit, .gpx, .tcx): ninguno real se acerca. */
const MAX_SINGLE_FILE_BYTES = 200 * 1024 * 1024
const GARMIN_ACTIVITIES = /DI-Connect-Uploaded-Files/i

export async function* parseUploadBlob(file: Blob, name: string, opts: UploadOptions = {}): AsyncGenerator<ParseOutcome, void, void> {
  if (/\.zip$/i.test(name) || (await isZip(file))) {
    let entries: ZipEntry[]
    try {
      entries = await listZip(file)
    } catch {
      opts.onDiscovered?.(1)
      yield { ok: false, name, code: 'corrupt' }
      return
    }
    yield* parseZipBlob(file, entries, 0, undefined, opts)
    return
  }
  opts.onDiscovered?.(1)
  if (file.size > MAX_SINGLE_FILE_BYTES) {
    yield { ok: false, name, code: 'too_large' }
    return
  }
  yield* parseOne({ name, bytes: new Uint8Array(await file.arrayBuffer()) })
}

async function* parseZipBlob(
  blob: Blob,
  entries: ZipEntry[],
  depth: number,
  inheritedOrigin: OriginHint | undefined,
  opts: UploadOptions,
): AsyncGenerator<ParseOutcome, void, void> {
  const files = entries.filter((e) => !e.name.endsWith('/'))
  const csv = files.find((e) => /(^|\/)activities\.csv$/i.test(e.name))
  const isGarmin = inheritedOrigin === 'garmin_export' || files.some((e) => /DI_CONNECT|DI-Connect/i.test(e.name))
  const originHint: OriginHint = csv ? 'strava_export' : isGarmin ? 'garmin_export' : (inheritedOrigin ?? 'other')

  // De la exportación de Garmin solo interesan las actividades (el resto es sueño,
  // pasos, datos de salud… que no se abren). Dentro de un zip anidado ya filtrado
  // se toma todo.
  const relevant = isGarmin && depth === 0 ? files.filter((e) => GARMIN_ACTIVITIES.test(e.name)) : files
  const activityEntries = relevant.filter((e) => isActivityFile(e.name))
  const nestedZips = depth < 3 ? relevant.filter((e) => /\.zip$/i.test(e.name)) : []

  let stravaRows: StravaExportRow[] = []
  if (csv) {
    try {
      stravaRows = parseStravaActivitiesCsv(new TextDecoder().decode(await readEntry(blob, csv)))
    } catch {
      stravaRows = []
    }
  }
  const byFile = new Map(stravaRows.filter((r) => r.filename).map((r) => [lower(r.filename!), r]))
  const manualRows = stravaRows.filter((r) => !r.filename)
  opts.onDiscovered?.(activityEntries.length + manualRows.length)

  for (const e of activityEntries) {
    let bytes: Uint8Array
    try {
      bytes = await readEntry(blob, e)
    } catch {
      yield { ok: false, name: e.name, code: 'corrupt' }
      continue
    }
    const row = byFile.get(lower(e.name))
    for (const outcome of parseOne({ name: e.name, bytes }, row?.mapping, originHint)) {
      if (outcome.ok && row) {
        outcome.activity.summary.title ??= row.title
        outcome.activity.summary.rpe ??= row.rpe
        outcome.activity.summary.externalId ??= `strava-export:${row.activityId}`
      }
      // En una exportación, un archivo que no es actividad (ej. un curso o un
      // entrenamiento planeado) no es un error: simplemente se omite.
      if (!outcome.ok && outcome.code === 'not_activity') outcome.skipped = true
      yield outcome
    }
  }

  for (const z of nestedZips) {
    try {
      const inner = await entryBlob(blob, z)
      yield* parseZipBlob(inner, await listZip(inner), depth + 1, originHint, opts)
    } catch {
      opts.onDiscovered?.(1)
      yield { ok: false, name: z.name, code: 'corrupt' }
    }
  }

  for (const row of manualRows) {
    const a = manualFromStravaRow(row)
    if (a) {
      a.summary.externalId = `strava-export:${row.activityId}`
      yield { ok: true, name: `Strava: ${row.title ?? row.activityId}`, activity: a }
    } else {
      yield { ok: false, name: `Strava: ${row.title ?? row.activityId}`, code: 'empty', skipped: true }
    }
  }
}
