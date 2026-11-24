// Conecta la cuenta de Strava de la persona: cambia el código por tokens
// (el secreto de Strava vive solo aquí) y trae las actividades de los últimos 7 días.
import { admin, requireUser } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { backfill, exchangeCode, linkByUser, RateLimited, recordError, stravaConfigured } from '../_shared/strava.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (!stravaConfigured()) return json(req, { error: 'strava_not_configured' }, 501)
  const user = await requireUser(req)
  if (!user) return json(req, { error: 'unauthorized' }, 401)
  let body: { code?: string; scope?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* sin cuerpo */
  }
  if (!body.code) return json(req, { error: 'missing_code' }, 400)
  if (!String(body.scope ?? '').includes('activity:read')) return json(req, { error: 'missing_scope' }, 400)

  try {
    const t = await exchangeCode(body.code)
    const athleteId = String(t.athlete?.id ?? '')
    if (!athleteId) return json(req, { error: 'no_athlete' }, 400)
    // Una cuenta de Strava solo puede estar conectada a una persona de la app
    const { data: other } = await admin.from('connections').select('user_id').eq('provider', 'strava').eq('external_athlete_id', athleteId).neq('user_id', user.id).maybeSingle()
    if (other) return json(req, { error: 'athlete_in_use' }, 409)

    const { data: conn, error } = await admin
      .from('connections')
      .upsert({ user_id: user.id, provider: 'strava', status: 'active', external_athlete_id: athleteId, last_error: null }, { onConflict: 'user_id,provider' })
      .select('id')
      .single()
    if (error || !conn) throw error ?? new Error('connection')
    await admin.from('provider_tokens').upsert({
      connection_id: conn.id,
      user_id: user.id,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(t.expires_at * 1000).toISOString(),
      scopes: String(body.scope).split(','),
      updated_at: new Date().toISOString(),
    })
    const link = (await linkByUser(user.id))!
    let queued = 0
    try {
      queued = await backfill(link, 7)
      await admin.from('connections').update({ backfill_done_at: new Date().toISOString(), last_backup_sync_at: new Date().toISOString() }).eq('id', conn.id)
    } catch (e) {
      await recordError(conn.id, e instanceof RateLimited ? 'rate_limited' : 'backfill_failed')
    }
    return json(req, { ok: true, queued })
  } catch (e) {
    console.error(e)
    return json(req, { error: 'connect_failed' }, 500)
  }
})
