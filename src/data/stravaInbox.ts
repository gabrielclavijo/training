import { parseStravaApi, type StravaInboxPayload } from '../core/parsers/stravaApi'
import { importOne, ImportIndex } from './importer'
import type { Repo } from './repo'

/**
 * Procesa la bandeja de entrada que llena el webhook de Strava: crea, actualiza
 * o borra actividades pasando por la misma detección de duplicados que los
 * archivos. Lo de Strava queda marcado para borrarse a los 7 días de recibido.
 */
export async function processStravaInbox(repo: Repo): Promise<{ created: number; merged: number; deleted: number; failed: number }> {
  const items = await repo.listInbox()
  const res = { created: 0, merged: 0, deleted: 0, failed: 0 }
  if (items.length === 0) return res
  const index = new ImportIndex(await repo.listActivities())
  const pairs = await repo.listNotDuplicatePairs()
  const done: string[] = []
  for (const it of items) {
    if (it.provider !== 'strava') continue
    const externalId = `strava:${it.externalId}`
    try {
      if (it.event === 'delete') {
        await repo.deleteSourceByExternalId(externalId)
        res.deleted++
      } else {
        if (it.event === 'update') await repo.deleteSourceByExternalId(externalId)
        const parsed = parseStravaApi(it.payload as StravaInboxPayload)
        const expires = new Date(Date.parse(it.receivedAt) + 7 * 86_400_000).toISOString()
        const freshIndex = it.event === 'update' ? new ImportIndex(await repo.listActivities()) : index
        const r = await importOne(
          repo,
          { name: parsed.summary.title ?? externalId, parsed, sha256: null },
          {
            jobId: null,
            notDuplicatePairs: pairs,
            index: freshIndex,
            stravaCacheUntil: expires,
          },
        )
        if (r.status === 'imported') res.created++
        else if (r.status === 'merged') res.merged++
      }
      done.push(it.id)
    } catch (e) {
      console.error('No se pudo procesar la actividad de Strava', it.externalId, e)
      res.failed++
    }
  }
  await repo.deleteInbox(done)
  if (res.created + res.merged > 0) await repo.touchConnection('strava')
  return res
}
