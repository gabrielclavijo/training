import type { Provider } from '../core/activity/types'
import { stravaAvailable } from '../features/strava/strava'

/**
 * Proveedores de datos. Cada uno declara si está activo y su política de
 * retención. Para conectar la API de Strava (con suscripción) o la de Garmin
 * (cuando Garmin apruebe el acceso) basta con encender su bandera y desplegar
 * su Edge Function (ver supabase/functions/provider-*).
 */
export interface ProviderInfo {
  id: Exclude<Provider, 'demo'>
  enabled: boolean
  /** Cómo se guardan sus datos */
  retention: 'owned' | 'strava_cache'
  /** ¿Se pueden enviar sus datos a un modelo de IA? */
  aiAllowed: boolean
  /** Días máximos que se pueden guardar (null = sin límite) */
  maxRetentionDays: number | null
}

export const PROVIDERS: ProviderInfo[] = [
  { id: 'file', enabled: true, retention: 'owned', aiAllowed: true, maxRetentionDays: null },
  { id: 'manual', enabled: true, retention: 'owned', aiAllowed: true, maxRetentionDays: null },
  // Política de la API de Strava (vigente desde el 1/06/2026): caché de máximo 7 días
  // y prohibido usar sus datos (ni derivados) en aplicaciones de IA.
  { id: 'strava', enabled: stravaAvailable(), retention: 'strava_cache', aiAllowed: false, maxRetentionDays: 7 },
  { id: 'garmin_api', enabled: false, retention: 'owned', aiAllowed: false, maxRetentionDays: null },
]
