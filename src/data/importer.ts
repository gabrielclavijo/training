import type { ParsedActivity } from '../core/activity/types'
import { findDuplicate, mergeSources, splitSource, TOLERANCE, type SourceLike } from '../core/dedupe'
import type { Repo } from './repo'
import type { ImportItemStatus, ImportKind, NewSource } from './types'

/**
 * Guarda actividades ya leídas aplicando la detección de duplicados.
 * Es independiente de dónde vengan (archivo, exportación, datos de prueba) y de
 * dónde se guarden (Supabase o memoria).
 */

export interface ImportCandidate {
  name: string
  parsed: ParsedActivity
  sha256: string | null
}

export type ImportResult =
  | { status: 'imported'; activityId: string; sourceId: string }
  | { status: 'merged'; activityId: string; sourceId: string }
  | { status: 'duplicate'; activityId: string }

/** Las series detalladas solo se guardan para los últimos 12 meses (cupo gratuito). */
const STREAMS_MAX_AGE_DAYS = 365

export async function importOne(
  repo: Repo,
  c: ImportCandidate,
  opts: { jobId: string | null; isDemo?: boolean; notDuplicatePairs?: Set<string> } = { jobId: null },
): Promise<ImportResult> {
  const { summary, streams, format, originHint } = c.parsed

  // 1. ¿Ya está exactamente este archivo o este identificador?
  const same = await repo.findSourceByIdentity(c.sha256, summary.externalId)
  if (same) return { status: 'duplicate', activityId: same.activityId }

  const newSource: NewSource = {
    provider: opts.isDemo ? 'demo' : format === 'manual' && originHint !== 'strava_export' ? 'manual' : 'file',
    format,
    originHint,
    retentionClass: 'owned',
    sport: summary.sport,
    subSport: summary.subSport,
    title: summary.title,
    startTime: summary.startTime,
    timezone: summary.timezone,
    elapsedS: summary.elapsedS,
    movingS: summary.movingS,
    distanceM: summary.distanceM,
    elevationGainM: summary.elevationGainM,
    avgHr: summary.avgHr,
    maxHr: summary.maxHr,
    avgPowerW: summary.avgPowerW,
    normalizedPowerW: summary.normalizedPowerW,
    avgCadence: summary.avgCadence,
    hasPower: summary.hasPower,
    hasHr: summary.hasHr,
    hasGps: summary.hasGps,
    hasCadence: summary.hasCadence,
    hrSamples: summary.hrSamples,
    powerSamples: summary.powerSamples,
    gpsPoints: summary.gpsPoints,
    deviceSerial: summary.deviceSerial,
    externalId: summary.externalId,
    rpe: summary.rpe,
    originalFilename: c.name,
    fileSha256: c.sha256,
    rawSport: summary.rawSport,
    hrHistogram: summary.hrHistogram,
    powerHistogram: summary.powerHistogram,
    powerCurve: summary.powerCurve,
    isDemo: Boolean(opts.isDemo),
    importJobId: opts.jobId,
  }
  const candidate: SourceLike = { ...newSource, id: '__nueva__' }

  // 2. ¿Coincide con una actividad que ya existe?
  const near = await repo.activitiesNear(summary.startTime, TOLERANCE.startS + 120)
  const pairs = opts.notDuplicatePairs ?? (await repo.listNotDuplicatePairs())
  const match = findDuplicate(candidate, near, pairs)

  const keepStreams = streams && Date.now() - Date.parse(summary.startTime) < STREAMS_MAX_AGE_DAYS * 86_400_000

  if (match) {
    const activity = near.find((a) => a.id === match.activityId)!
    const sourceId = await repo.insertSource(activity.id, newSource)
    const merged = mergeSources([...activity.sources, { ...candidate, id: sourceId }])
    await repo.updateCanonical(activity.id, merged)
    await repo.insertMerge(activity.id, sourceId, match.matchedBy, match.deltas)
    if (keepStreams) await repo.saveStreams(sourceId, streams)
    return { status: 'merged', activityId: activity.id, sourceId }
  }

  // 3. Actividad nueva
  const merged = mergeSources([candidate])
  const { primarySourceId: _p, powerSourceId: _pw, hrSourceId: _h, gpsSourceId: _g, cadenceSourceId: _c, ...base } = merged
  void [_p, _pw, _h, _g, _c]
  const activityId = await repo.createActivity(base, Boolean(opts.isDemo))
  const sourceId = await repo.insertSource(activityId, newSource)
  await repo.updateCanonical(activityId, mergeSources([{ ...candidate, id: sourceId }]))
  if (keepStreams) await repo.saveStreams(sourceId, streams)
  return { status: 'imported', activityId, sourceId }
}

export interface ImportProgress {
  total: number
  processed: number
  imported: number
  merged: number
  duplicates: number
  failed: number
}

/** Corre un trabajo de importación completo y va informando el progreso. */
export async function runImportJob(
  repo: Repo,
  kind: ImportKind,
  items: AsyncIterable<{ name: string; candidate?: ImportCandidate; errorCode?: string }> | Iterable<{ name: string; candidate?: ImportCandidate; errorCode?: string }>,
  opts: { total: number; isDemo?: boolean; onProgress?: (p: ImportProgress) => void; signal?: AbortSignal },
): Promise<{ jobId: string; progress: ImportProgress }> {
  const jobId = await repo.createJob(kind, opts.total)
  const p: ImportProgress = { total: opts.total, processed: 0, imported: 0, merged: 0, duplicates: 0, failed: 0 }
  const pairs = await repo.listNotDuplicatePairs()
  let lastSaved = 0
  try {
    for await (const it of items) {
      if (opts.signal?.aborted) {
        await repo.updateJob(jobId, { ...p, status: 'cancelled', finishedAt: new Date().toISOString() })
        return { jobId, progress: p }
      }
      let status: ImportItemStatus = 'error'
      let sourceId: string | null = null
      if (it.candidate) {
        try {
          const r = await importOne(repo, it.candidate, { jobId, isDemo: opts.isDemo, notDuplicatePairs: pairs })
          status = r.status
          if (r.status !== 'duplicate') sourceId = r.sourceId
        } catch (e) {
          console.error(e)
          status = 'error'
          it.errorCode = 'save_failed'
        }
      }
      p.processed++
      if (p.processed > p.total) p.total = p.processed
      if (status === 'imported') p.imported++
      else if (status === 'merged') p.merged++
      else if (status === 'duplicate') p.duplicates++
      else p.failed++
      await repo.addJobItem(jobId, it.name, status, status === 'error' ? (it.errorCode ?? 'corrupt') : null, sourceId)
      opts.onProgress?.({ ...p })
      if (p.processed - lastSaved >= 10) {
        lastSaved = p.processed
        await repo.updateJob(jobId, p)
      }
    }
    await repo.updateJob(jobId, { ...p, status: 'done', finishedAt: new Date().toISOString() })
    await repo.touchConnection(kind === 'demo' ? 'file' : 'file')
  } catch (e) {
    await repo.updateJob(jobId, { ...p, status: 'failed', finishedAt: new Date().toISOString() })
    throw e
  }
  return { jobId, progress: p }
}

/** «No son la misma actividad»: separa una fuente en su propia actividad. */
export async function undoMerge(repo: Repo, activityId: string, sourceId: string) {
  const found = await repo.getActivity(activityId)
  if (!found) throw new Error('Actividad no encontrada')
  const { remaining, detached, notDuplicatePairs } = splitSource(found.activity, sourceId)
  const { primarySourceId: _a, powerSourceId: _b, hrSourceId: _c, gpsSourceId: _d, cadenceSourceId: _e, ...base } = detached
  void [_a, _b, _c, _d, _e]
  const newId = await repo.createActivity(base, found.activity.isDemo)
  await repo.moveSource(sourceId, newId)
  await repo.updateCanonical(newId, detached)
  await repo.updateCanonical(activityId, remaining)
  await repo.markMergesUndone(activityId, sourceId)
  for (const key of notDuplicatePairs) {
    const [a, b] = key.split('|')
    await repo.addNotDuplicatePair(a, b)
  }
  return newId
}
