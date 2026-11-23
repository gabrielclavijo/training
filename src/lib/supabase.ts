import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente de Supabase para el navegador.
 *
 * - Solo usa la clave PÚBLICA (publishable/anon). Es segura en el frontend porque
 *   Row Level Security decide qué filas puede tocar cada usuario.
 * - Los secretos (clave de servicio, claves de cifrado, IA, Strava) viven solo en
 *   las Edge Functions.
 * - flowType 'pkce': Supabase devuelve `?code=` en la URL en vez de tokens en el
 *   `#`, así no choca con HashRouter.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as
  | string
  | undefined

export const isSupabaseConfigured = Boolean(url && key)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase no está configurado (faltan VITE_SUPABASE_URL y la clave pública).')
  return supabase
}

/** URL a la que Supabase devuelve a la persona tras Google o un enlace de correo. */
export function authRedirectUrl() {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}
