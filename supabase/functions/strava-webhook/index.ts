// Webhook de Strava (una suscripción para toda la app). Strava exige responder
// en menos de 2 s: se contesta de inmediato y el trabajo sigue en segundo plano.
// Eventos: actividades creadas, editadas o borradas, y revocación de acceso.
import { admin } from '../_shared/clients.ts'
import { accessToken, linkByAthlete, purgeUserStrava, queueActivity, queueDelete, RateLimited, recordError } from '../_shared/strava.ts'

interface StravaEvent {
  object_type: 'activity' | 'athlete'
  object_id: number
  aspect_type: 'create' | 'update' | 'delete'
  owner_id: number
  subscription_id: number
  updates?: Record<string, string>
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

async function handle(ev: StravaEvent) {
  const link = await linkByAthlete(String(ev.owner_id))
  if (!link) return
  try {
    if (ev.object_type === 'athlete') {
      if (ev.updates?.authorized === 'false') await purgeUserStrava(link.userId, link.connectionId)
      return
    }
    if (ev.aspect_type === 'delete') {
      await queueDelete(link, String(ev.object_id))
      return
    }
    // Ediciones sin cambio de contenido relevante (ej. solo privacidad) igual se reprocesan
    const token = await accessToken(link)
    await queueActivity(link, token, String(ev.object_id), ev.aspect_type)
    await admin.from('connections').update({ last_sync_at: new Date().toISOString(), last_error: null, status: 'active' }).eq('id', link.connectionId)
  } catch (e) {
    console.error('webhook', e)
    await recordError(link.connectionId, e instanceof RateLimited ? 'rate_limited' : 'webhook_failed')
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  // Validación de la suscripción
  if (req.method === 'GET') {
    if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === Deno.env.get('STRAVA_VERIFY_TOKEN')) {
      return new Response(JSON.stringify({ 'hub.challenge': url.searchParams.get('hub.challenge') }), { headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('forbidden', { status: 403 })
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  let ev: StravaEvent
  try {
    ev = await req.json()
  } catch {
    return new Response('bad request', { status: 400 })
  }
  // Solo eventos de nuestra suscripción
  const sub = Deno.env.get('STRAVA_SUBSCRIPTION_ID')
  if (sub && String(ev.subscription_id) !== sub) return new Response('ok')
  const work = handle(ev)
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work)
  else await work
  return new Response('ok')
})
