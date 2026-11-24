// Desconecta Strava: revoca el acceso y borra todo lo que vino de Strava.
import { requireUser } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { accessToken, deauthorize, linkByUser, purgeUserStrava } from '../_shared/strava.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  const user = await requireUser(req)
  if (!user) return json(req, { error: 'unauthorized' }, 401)
  const link = await linkByUser(user.id)
  if (!link) return json(req, { ok: true })
  try {
    await deauthorize(await accessToken(link))
  } catch {
    /* si el token ya no sirve, igual se borra todo */
  }
  await purgeUserStrava(user.id, link.connectionId)
  return json(req, { ok: true })
})
