// =============================================================================
// nutrition-menu: la ÚNICA parte de la app que habla con la IA (Claude).
//   action "generate": menú de la semana (7 días) + listas de mercado.
//   action "swap":     otra opción para una comida de un menú guardado.
//
// Qué se envía a la IA: ver _shared/menu.ts (buildPayload). El perfil de
// alimentación se lee aquí, de la base de datos; del navegador solo se aceptan
// números (calorías y macronutrientes por día) y categorías fijas de sesión.
//
// Secretos: ANTHROPIC_API_KEY (ver README, paso 7), APP_ORIGIN.
// Límite: 3 menús y 15 cambios por persona al día (hora de Colombia).
// Cada petición guarda tokens y costo en ai_usage para el panel de administración.
// =============================================================================
import Anthropic from 'npm:@anthropic-ai/sdk@1.7.0'
import { admin, requireUser } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import {
  BadInput,
  buildPayload,
  joinParts,
  MENU_MODEL,
  MENU_PART_SCHEMA,
  MENU_PARTS,
  parseMeal,
  parseMenuPart,
  SWAP_SCHEMA,
  swapPrompt,
  SYSTEM_PROMPT,
  userPrompt,
  type AiPayload,
  type Menu,
  type NutritionRow,
} from '../_shared/menu.ts'
import { addSpend, NO_SPEND, type Spend, type UsageLike } from '../_shared/pricing.ts'

const LIMITS = { menu: 3, swap: 15 } as const

let client: Anthropic | null = null
function anthropic() {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return null
  client ??= new Anthropic({ apiKey, maxRetries: 1, timeout: 140_000 })
  return client
}

/** Inicio del día de hoy en Colombia (UTC-5, sin horario de verano), en UTC. */
function startOfTodayBogota() {
  const now = new Date(Date.now() - 5 * 3600_000)
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5)).toISOString()
}

async function reserve(userId: string, kind: keyof typeof LIMITS): Promise<string | null> {
  const { count, error } = await admin
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('counted', true)
    .gte('created_at', startOfTodayBogota())
  if (error) throw error
  if ((count ?? 0) >= LIMITS[kind]) return null
  const { data, error: e2 } = await admin.from('ai_usage').insert({ user_id: userId, kind }).select('id').single()
  if (e2) throw e2
  return data.id as string
}
/** Guarda tokens y costo de la petición. Si falló, queda el costo pero no cuenta para el límite diario. */
const settle = (id: string, spend: Spend, ok: boolean) =>
  admin
    .from('ai_usage')
    .update({
      model: spend.model,
      input_tokens: spend.inputTokens,
      output_tokens: spend.outputTokens,
      cost_usd: Number(spend.costUsd.toFixed(5)),
      counted: ok,
    })
    .eq('id', id)

/** Llama a Claude con salida estructurada y devuelve el JSON. */
async function ask(ai: Anthropic, content: string, schema: object, maxTokens: number, track: (s: Spend) => void): Promise<unknown> {
  const base = {
    model: MENU_MODEL,
    max_tokens: maxTokens,
    // Esfuerzo bajo: los menús son una tarea acotada y así responde más rápido
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  }
  let msg
  try {
    // Si el modelo declina por sus filtros de seguridad, el servidor de Anthropic
    // reintenta con otro modelo adecuado (fallbacks "default").
    msg = await ai.beta.messages
      // deno-lint-ignore no-explicit-any
      .stream({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } as any)
      .finalMessage()
  } catch (e) {
    if (!(e instanceof Anthropic.BadRequestError)) throw e
    // Si la cuenta no admite la opción de respaldo, se intenta sin ella
    // deno-lint-ignore no-explicit-any
    msg = await ai.messages.stream(base as any).finalMessage()
  }
  // Lo que costó esta petición (aunque luego falle la validación)
  track(addSpend(NO_SPEND, msg.model, msg.usage as UsageLike))
  if (msg.stop_reason === 'refusal') throw new Error('refusal')
  if (msg.stop_reason === 'max_tokens') throw new Error('max_tokens')
  const blocks = msg.content as { type: string; text?: string }[]
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
  return JSON.parse(text)
}

async function loadPrefs(userId: string): Promise<NutritionRow | null> {
  const { data, error } = await admin.from('nutrition_preferences').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data as NutritionRow | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)
  const user = await requireUser(req)
  if (!user) return json(req, { error: 'unauthorized' }, 401)
  const ai = anthropic()
  if (!ai) return json(req, { error: 'ai_not_configured' }, 503)

  let body: { action?: string; request?: unknown; planId?: string; date?: string; mealIndex?: number }
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'bad_request' }, 400)
  }

  let usageId: string | null = null
  let spend: Spend = NO_SPEND
  const track = (x: Spend) => {
    spend = { model: x.model ?? spend.model, inputTokens: spend.inputTokens + x.inputTokens, outputTokens: spend.outputTokens + x.outputTokens, costUsd: spend.costUsd + x.costUsd }
  }
  try {
    const prefs = await loadPrefs(user.id)
    if (!prefs) return json(req, { error: 'nutrition_profile_required' }, 400)

    if (body.action === 'generate') {
      const payload = buildPayload(prefs, body.request)
      usageId = await reserve(user.id, 'menu')
      if (!usageId) return json(req, { error: 'daily_limit' }, 429)
      const parts = await Promise.all(
        MENU_PARTS.map(async ([from, to]) => {
          const raw = await ask(ai, userPrompt(payload, from, to), MENU_PART_SCHEMA, 16000, track)
          return parseMenuPart(raw, payload.days.slice(from, to).map((d) => d.date))
        }),
      )
      const menu = joinParts(payload, parts)
      const { data, error } = await admin
        .from('meal_plans')
        .upsert({ user_id: user.id, week_start: payload.days[0].date, inputs: payload, menu, model: MENU_MODEL }, { onConflict: 'user_id,week_start' })
        .select('id, week_start, inputs, menu, model, created_at, updated_at')
        .single()
      if (error) throw error
      await settle(usageId, spend, true)
      return json(req, { plan: data })
    }

    if (body.action === 'swap') {
      const { data: plan, error } = await admin
        .from('meal_plans')
        .select('id, inputs, menu')
        .eq('id', String(body.planId ?? ''))
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) throw error
      if (!plan) return json(req, { error: 'not_found' }, 404)
      const menu = plan.menu as Menu
      const day = menu.days.find((d) => d.date === body.date)
      const idx = Number(body.mealIndex)
      if (!day || !Number.isInteger(idx) || !day.meals[idx]) return json(req, { error: 'bad_request' }, 400)
      // Perfil actual (por si la persona lo cambió) con los objetivos guardados del menú
      const stored = plan.inputs as AiPayload
      const payload = buildPayload(prefs, { weekStart: stored.days[0].date, days: stored.days })
      usageId = await reserve(user.id, 'swap')
      if (!usageId) return json(req, { error: 'daily_limit' }, 429)
      const raw = (await ask(ai, swapPrompt(payload, day, idx), SWAP_SCHEMA, 4000, track)) as { meal?: unknown; shopping?: unknown }
      day.meals[idx] = parseMeal(raw.meal)
      const extra = parseMenuPart({ days: [], shopping: raw.shopping, tips: [] }, []).shopping
      const list = menu.shopping.find((s) => s.from <= day.date && day.date <= s.to)
      if (list) list.items.push(...extra.map((x) => ({ ...x, amount: `${x.amount} (cambio)` })))
      const { data: saved, error: e2 } = await admin
        .from('meal_plans')
        .update({ menu })
        .eq('id', plan.id)
        .eq('user_id', user.id)
        .select('id, week_start, inputs, menu, model, created_at, updated_at')
        .single()
      if (e2) throw e2
      await settle(usageId, spend, true)
      return json(req, { plan: saved })
    }

    return json(req, { error: 'unknown_action' }, 400)
  } catch (e) {
    if (usageId) await settle(usageId, spend, false)
    if (e instanceof BadInput) return json(req, { error: 'bad_request', detail: e.message }, 400)
    console.error(e)
    if (e instanceof Anthropic.RateLimitError) return json(req, { error: 'ai_busy' }, 503)
    if (e instanceof Anthropic.APIError) return json(req, { error: 'ai_failed' }, 502)
    return json(req, { error: e instanceof Error && ['refusal', 'max_tokens'].includes(e.message) ? 'ai_failed' : 'server_error' }, 500)
  }
})
