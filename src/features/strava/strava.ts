/** Conexión con Strava desde el navegador (el secreto vive solo en el servidor). */
export const STRAVA_CLIENT_ID = (import.meta.env.VITE_STRAVA_CLIENT_ID as string | undefined) ?? ''
export const stravaAvailable = () => Boolean(STRAVA_CLIENT_ID)
const STATE_KEY = 'entreno.stravaState'

export function stravaRedirectUri() {
  return `${window.location.origin}${import.meta.env.BASE_URL}strava-callback.html`
}

export function startStravaConnect() {
  const state = crypto.randomUUID()
  try {
    sessionStorage.setItem(STATE_KEY, state)
  } catch {
    /* sin almacenamiento */
  }
  const u = new URL('https://www.strava.com/oauth/authorize')
  u.searchParams.set('client_id', STRAVA_CLIENT_ID)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('redirect_uri', stravaRedirectUri())
  u.searchParams.set('approval_prompt', 'auto')
  u.searchParams.set('scope', 'read,activity:read_all')
  u.searchParams.set('state', state)
  window.location.assign(u.toString())
}

export function checkStravaState(state: string | null) {
  try {
    const ok = Boolean(state) && sessionStorage.getItem(STATE_KEY) === state
    sessionStorage.removeItem(STATE_KEY)
    return ok
  } catch {
    return false
  }
}

export const stravaActivityUrl = (externalId: string | null) =>
  externalId?.startsWith('strava:') ? `https://www.strava.com/activities/${externalId.slice(7)}` : null
