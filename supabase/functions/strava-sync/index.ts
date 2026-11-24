// Sincronización de respaldo: por si se perdió algún aviso del webhook, revisa
// las actividades de los últimos 7 días (como máximo una vez por hora).
import { admin, requireUser } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { backfill, linkByUser, RateLimited, recordError, stravaConfigured } from '../_shared/strava.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (!stravaConfigured()) return json(req, { error: 'strava_not_configured' }, 501)
  const user = await requireUser(req)
  if (!user) return json(req, { error: 'unauthorized' }, 401)
  const link = await linkByUser(user.id)
  if (!link) return json(req, { queued: 0, connected: false })
  const { data: conn } = await admin.from('connections').select('last_backup_sync_at').eq('id', link.connectionId).single()
  const last = conn?.last_backup_sync_at ? Date.parse(conn.last_backup_sync_at) : 0
  if (Date.now() - last < 60 * 60 * 1000) return json(req, { queued: 0, skipped: true })
  try {
    const queued = await backfill(link, 7)
    await admin.from('connections').update({ last_backup_sync_at: new Date().toISOString(), last_sync_at: new Date().toISOString() }).eq('id', link.connectionId)
    await recordError(link.connectionId, null)
    return json(req, { queued })
  } catch (e) {
    await recordError(link.connectionId, e instanceof RateLimited ? 'rate_limited' : 'sync_failed')
    return json(req, { error: e instanceof RateLimited ? 'rate_limited' : 'sync_failed' }, 502)
  }
})
