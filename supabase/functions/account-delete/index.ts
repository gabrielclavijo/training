// =============================================================================
// account-delete: «Borrar mi cuenta». Elimina los archivos de la persona en
// Storage y luego su usuario; la base de datos borra en cascada todas sus filas
// (actividades, metas, salud, consentimientos…).
// =============================================================================
import { admin, requireUser } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

const BUCKETS = ['activity-streams', 'goal-gpx', 'avatars']

async function removeFolder(bucket: string, folder: string) {
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 })
    if (error) throw error
    if (!data || data.length === 0) return
    const { error: rmError } = await admin.storage.from(bucket).remove(data.map((f) => `${folder}/${f.name}`))
    if (rmError) throw rmError
    if (data.length < 1000) return
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)
  const user = await requireUser(req)
  if (!user) return json(req, { error: 'unauthorized' }, 401)

  let body: { confirm?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    /* sin cuerpo */
  }
  if (body.confirm !== true) return json(req, { error: 'confirmation_required' }, 400)

  try {
    for (const b of BUCKETS) await removeFolder(b, user.id)
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) throw error
    return json(req, { ok: true })
  } catch (e) {
    console.error(e)
    return json(req, { error: 'server_error' }, 500)
  }
})
