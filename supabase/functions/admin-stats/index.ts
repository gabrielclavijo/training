// =============================================================================
// admin-stats: datos del panel de administración. Solo responde a los correos
// de ADMIN_EMAILS (secreto, separados por comas). Nunca devuelve contenido de
// las personas (entrenamientos, salud, menús): solo conteos, minutos y costos.
//   action "whoami":  { admin: boolean } (para mostrar o no el panel en el menú)
//   action "stats":   el resumen completo
//   action "topup":   registra una recarga de saldo de la IA { amountUsd, note, toppedOn }
//   action "deleteTopup": borra una recarga { id }
//   action "threshold": cambia el umbral de aviso { thresholdUsd }
// =============================================================================
import { admin, requireUser } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { buildStats, type RawAi, type RawTopup, type RawUsage, type RawUser } from '../_shared/adminStats.ts'

const ADMINS = (Deno.env.get('ADMIN_EMAILS') ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
const DEFAULT_THRESHOLD = 2

const isAdmin = (email: string | undefined) => Boolean(email && ADMINS.includes(email.toLowerCase()))

async function loadThreshold(): Promise<number> {
  const { data } = await admin.from('admin_settings').select('value').eq('key', 'ai_threshold_usd').maybeSingle()
  const v = Number((data?.value as number | undefined) ?? DEFAULT_THRESHOLD)
  return Number.isFinite(v) ? v : DEFAULT_THRESHOLD
}

async function stats() {
  const now = new Date()
  const since = new Date(now.getTime() - 40 * 86_400_000).toISOString().slice(0, 10)

  const users: RawUser[] = []
  for (let page = 1; page < 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) {
      users.push({
        id: u.id,
        email: u.email ?? null,
        name: (u.user_metadata?.full_name as string | undefined) ?? (u.user_metadata?.name as string | undefined) ?? null,
        provider: (u.app_metadata?.provider as string | undefined) ?? 'email',
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
      })
    }
    if (data.users.length < 1000) break
  }
  // Nombre que la persona puso en su perfil (si lo tiene)
  const { data: profiles } = await admin.from('profiles').select('user_id, display_name')
  const names = new Map((profiles ?? []).map((p) => [p.user_id as string, p.display_name as string | null]))
  for (const u of users) u.name = names.get(u.id) || u.name

  const { data: usageRows, error: e1 } = await admin
    .from('usage_daily')
    .select('user_id, day, seconds, visits, last_seen_at')
    .gte('day', since)
    .limit(50000)
  if (e1) throw e1
  // Última conexión de quienes no entran hace más de 40 días
  const { data: lastRows } = await admin.from('usage_daily').select('user_id, last_seen_at').order('last_seen_at', { ascending: false }).limit(5000)
  const usage: RawUsage[] = (usageRows ?? []).map((r) => ({ userId: r.user_id, day: r.day, seconds: r.seconds, visits: r.visits, lastSeenAt: r.last_seen_at }))
  for (const r of lastRows ?? []) {
    if (!usage.some((u) => u.userId === r.user_id)) usage.push({ userId: r.user_id, day: '0000-00-00', seconds: 0, visits: 0, lastSeenAt: r.last_seen_at })
  }

  const { data: aiRows, error: e2 } = await admin
    .from('ai_usage')
    .select('user_id, kind, created_at, cost_usd, input_tokens, output_tokens, counted, model')
    .limit(100000)
  if (e2) throw e2
  const ai: RawAi[] = (aiRows ?? []).map((r) => ({
    userId: r.user_id,
    kind: r.kind,
    createdAt: r.created_at,
    costUsd: Number(r.cost_usd ?? 0),
    inputTokens: r.input_tokens ?? 0,
    outputTokens: r.output_tokens ?? 0,
    counted: r.counted ?? true,
    model: r.model,
  }))

  const { data: topRows, error: e3 } = await admin.from('admin_topups').select('id, amount_usd, note, topped_on')
  if (e3) throw e3
  const topups: RawTopup[] = (topRows ?? []).map((r) => ({ id: r.id, amountUsd: Number(r.amount_usd), note: r.note, toppedOn: r.topped_on }))

  // Actividades por persona (conteo, sin contenido)
  const activitiesByUser: Record<string, number> = {}
  await Promise.all(
    users.map(async (u) => {
      const { count } = await admin.from('activities').select('id', { count: 'exact', head: true }).eq('user_id', u.id)
      activitiesByUser[u.id] = count ?? 0
    }),
  )
  const { data: strava } = await admin.from('connections').select('user_id').eq('provider', 'strava').eq('status', 'active')

  return buildStats({
    now,
    users,
    usage,
    ai,
    topups,
    thresholdUsd: await loadThreshold(),
    activitiesByUser,
    stravaUsers: (strava ?? []).map((r) => r.user_id as string),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)
  const user = await requireUser(req)
  if (!user) return json(req, { error: 'unauthorized' }, 401)

  let body: { action?: string; amountUsd?: number; note?: string; toppedOn?: string; id?: string; thresholdUsd?: number } = {}
  try {
    body = await req.json()
  } catch {
    /* sin cuerpo */
  }
  if (body.action === 'whoami') return json(req, { admin: isAdmin(user.email) })
  if (!isAdmin(user.email)) return json(req, { error: 'forbidden' }, 403)

  try {
    if (body.action === 'stats') return json(req, { stats: await stats() })

    if (body.action === 'topup') {
      const amount = Number(body.amountUsd)
      if (!Number.isFinite(amount) || amount <= 0 || amount >= 100000) return json(req, { error: 'bad_amount' }, 400)
      const day = typeof body.toppedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.toppedOn) ? body.toppedOn : undefined
      const { error } = await admin.from('admin_topups').insert({ amount_usd: amount, note: body.note ? String(body.note).slice(0, 200) : null, ...(day ? { topped_on: day } : {}) })
      if (error) throw error
      return json(req, { ok: true })
    }

    if (body.action === 'deleteTopup') {
      const { error } = await admin.from('admin_topups').delete().eq('id', String(body.id ?? ''))
      if (error) throw error
      return json(req, { ok: true })
    }

    if (body.action === 'threshold') {
      const v = Number(body.thresholdUsd)
      if (!Number.isFinite(v) || v < 0 || v > 10000) return json(req, { error: 'bad_amount' }, 400)
      const { error } = await admin.from('admin_settings').upsert({ key: 'ai_threshold_usd', value: v, updated_at: new Date().toISOString() })
      if (error) throw error
      return json(req, { ok: true })
    }

    return json(req, { error: 'unknown_action' }, 400)
  } catch (e) {
    console.error(e)
    return json(req, { error: 'server_error' }, 500)
  }
})
