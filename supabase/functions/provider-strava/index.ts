// =============================================================================
// provider-strava (APAGADO por defecto)
//
// Esqueleto para conectar la API de Strava si algún día se paga la suscripción
// que Strava exige a quien crea la app. Ya respeta sus reglas (verificadas el
// 23/11/2026, Política de API vigente desde el 1/06/2026):
//   - Los datos de Strava se guardan como caché de máximo 7 días
//     (activity_sources.retention_class = 'strava_cache', streams_expire_at) y la
//     función SQL purge_expired_provider_data() los borra.
//   - Nunca se envían a IA (ai_allowed = false, lo exige un CHECK en la tabla).
//   - Cada persona solo ve sus datos.
//   - El webhook debe responder en menos de 2 s; una suscripción por app.
//   - Los tokens viven en provider_tokens (sin acceso desde el navegador).
//
// Para activarlo: STRAVA_ENABLED=true, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET,
// STRAVA_VERIFY_TOKEN en los secretos, implementar los pasos marcados TODO y
// encender el proveedor en src/providers/index.ts.
// =============================================================================
import { corsHeaders, json } from '../_shared/cors.ts'

const enabled = Deno.env.get('STRAVA_ENABLED') === 'true'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (!enabled) return json(req, { error: 'strava_disabled' }, 501)

  const url = new URL(req.url)
  // Validación de la suscripción del webhook (GET con hub.challenge)
  if (req.method === 'GET' && url.searchParams.get('hub.mode') === 'subscribe') {
    if (url.searchParams.get('hub.verify_token') !== Deno.env.get('STRAVA_VERIFY_TOKEN')) return new Response('forbidden', { status: 403 })
    return json(req, { 'hub.challenge': url.searchParams.get('hub.challenge') })
  }
  // TODO: POST /oauth/callback → intercambiar code por tokens (guardar en provider_tokens)
  // TODO: POST webhook → encolar el evento (create/update/delete/deauthorize) y responder 200 de inmediato
  // TODO: importación del historial por lotes respetando X-RateLimit-* / X-ReadRateLimit-*
  return json(req, { error: 'not_implemented' }, 501)
})
