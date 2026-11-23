import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

/** Cliente con permisos totales: SOLO existe en el servidor. */
export const admin: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } })

/** Identifica a la persona a partir del token que manda el navegador. */
export async function requireUser(req: Request): Promise<User | null> {
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const client = createClient(url, anonKey, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data, error } = await client.auth.getUser()
  return error ? null : data.user
}
