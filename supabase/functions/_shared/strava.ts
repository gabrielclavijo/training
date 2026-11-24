// =============================================================================
// Utilidades de Strava para las Edge Functions.
// Reglas de la API de Strava (Política vigente desde el 1/06/2026, verificadas
// el 23/11/2026):
//   - Datos de Strava: caché de máximo 7 días (la app y pg_cron los borran).
//   - Nunca se usan en IA (ai_allowed = false en la base de datos).
//   - Cada persona solo ve sus datos.
//   - Límites de solicitudes compartidos por toda la app: se respetan los
//     encabezados X-RateLimit-* y se frena ante un 429.
// Secretos: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_VERIFY_TOKEN.
// =============================================================================
import { admin } from './clients.ts'

const API = 'https://www.strava.com/api/v3'
const OAUTH = 'https://www.strava.com/oauth'

export const clientId = () => Deno.env.get('STRAVA_CLIENT_ID') ?? ''
export const clientSecret = () => Deno.env.get('STRAVA_CLIENT_SECRET') ?? ''
export const stravaConfigured = () => Boolean(clientId() && clientSecret())

export class RateLimited extends Error {}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: { id: number }
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const r = await fetch(`${OAUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId(), client_secret: clientSecret(), code, grant_type: 'authorization_code' }),
  })
  if (!r.ok) throw new Error(`strava_token_${r.status}`)
  return r.json()
}

async function refresh(refreshToken: string): Promise<TokenResponse> {
  const r = await fetch(`${OAUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId(), client_secret: clientSecret(), refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  if (!r.ok) throw new Error(`strava_refresh_${r.status}`)
  return r.json()
}

export interface StravaLink {
  userId: string
  connectionId: string
  athleteId: string
}

export async function linkByUser(userId: string): Promise<StravaLink | null> {
  const { data } = await admin.from('connections').select('id, external_athlete_id').eq('user_id', userId).eq('provider', 'strava').maybeSingle()
  return data?.external_athlete_id ? { userId, connectionId: data.id, athleteId: data.external_athlete_id } : null
}

export async function linkByAthlete(athleteId: string): Promise<StravaLink | null> {
  const { data } = await admin.from('connections').select('id, user_id').eq('provider', 'strava').eq('external_athlete_id', athleteId).maybeSingle()
  return data ? { userId: data.user_id, connectionId: data.id, athleteId } : null
}

/** Token vigente (lo renueva si está por vencer). */
export async function accessToken(link: StravaLink): Promise<string> {
  const { data, error } = await admin.from('provider_tokens').select('*').eq('connection_id', link.connectionId).single()
  if (error || !data) throw new Error('strava_no_token')
  if (new Date(data.expires_at).getTime() - Date.now() > 60_000) return data.access_token
  const t = await refresh(data.refresh_token)
  await admin
    .from('provider_tokens')
    .update({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(t.expires_at * 1000).toISOString(), updated_at: new Date().toISOString() })
    .eq('connection_id', link.connectionId)
  return t.access_token
}

/** Las credenciales van solo en el encabezado (requisito de Strava desde 2027). */
async function api<T>(token: string, path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const usage = r.headers.get('X-ReadRateLimit-Usage') ?? r.headers.get('X-RateLimit-Usage')
  if (usage) console.log('Strava uso', usage, 'límite', r.headers.get('X-ReadRateLimit-Limit') ?? r.headers.get('X-RateLimit-Limit'))
  if (r.status === 429) throw new RateLimited('strava_rate_limited')
  if (!r.ok) throw new Error(`strava_api_${r.status}`)
  return r.json()
}

/** Detalle + series de una actividad, guardado en la bandeja (caché de 7 días). */
export async function queueActivity(link: StravaLink, token: string, activityId: string, event: 'create' | 'update') {
  const activity = await api<Record<string, unknown>>(token, `/activities/${activityId}`)
  let streams: unknown = null
  try {
    streams = await api(token, `/activities/${activityId}/streams?keys=time,heartrate,watts,latlng,altitude,distance,cadence,velocity_smooth&key_by_type=true`)
  } catch (e) {
    if (e instanceof RateLimited) throw e
    streams = null // actividad manual sin series
  }
  await admin.from('provider_inbox').upsert(
    {
      user_id: link.userId,
      provider: 'strava',
      external_id: String(activityId),
      event,
      payload: { activity, streams },
      received_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
    { onConflict: 'user_id,provider,external_id' },
  )
}

export async function queueDelete(link: StravaLink, activityId: string) {
  await admin
    .from('provider_inbox')
    .upsert(
      { user_id: link.userId, provider: 'strava', external_id: String(activityId), event: 'delete', payload: null, received_at: new Date().toISOString() },
      { onConflict: 'user_id,provider,external_id' },
    )
}

/** Trae las actividades de los últimos `days` días que aún no estén en la app. */
export async function backfill(link: StravaLink, days = 7): Promise<number> {
  const token = await accessToken(link)
  const after = Math.floor((Date.now() - days * 86_400_000) / 1000)
  const list = await api<{ id: number }[]>(token, `/athlete/activities?after=${after}&per_page=50`)
  const { data: known } = await admin.from('activity_sources').select('external_id').eq('user_id', link.userId).like('external_id', 'strava:%')
  const { data: queued } = await admin.from('provider_inbox').select('external_id').eq('user_id', link.userId).eq('provider', 'strava')
  const have = new Set([...(known ?? []).map((r) => r.external_id.replace('strava:', '')), ...(queued ?? []).map((r) => r.external_id)])
  let n = 0
  for (const a of list) {
    if (have.has(String(a.id))) continue
    await queueActivity(link, token, String(a.id), 'create')
    n++
  }
  return n
}

export async function recordError(connectionId: string, message: string | null) {
  await admin.from('connections').update({ last_error: message, status: message ? 'error' : 'active' }).eq('id', connectionId)
}

/** Borra todo lo que vino de Strava para esta persona (al desconectar o revocar). */
export async function purgeUserStrava(userId: string, connectionId: string) {
  await admin.from('provider_tokens').delete().eq('connection_id', connectionId)
  await admin.from('provider_inbox').delete().eq('user_id', userId).eq('provider', 'strava')
  const { data: srcs } = await admin.from('activity_sources').select('id, activity_id').eq('user_id', userId).eq('provider', 'strava')
  for (const s of srcs ?? []) {
    await admin.from('activity_sources').delete().eq('id', s.id)
    const { data: left } = await admin.from('activity_sources').select('id').eq('activity_id', s.activity_id).limit(1)
    if (!left?.length) await admin.from('activities').delete().eq('id', s.activity_id)
  }
  await admin.from('connections').update({ status: 'disabled', external_athlete_id: null, last_error: null }).eq('id', connectionId)
}

export async function deauthorize(token: string) {
  // /oauth/deauthorize se retira el 1/06/2027; entonces se usará /oauth/revoke
  await fetch(`${OAUTH}/deauthorize`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined)
}
