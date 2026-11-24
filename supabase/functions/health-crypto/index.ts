// =============================================================================
// health-crypto: cifra y descifra los datos de salud (medicamentos, alergias,
// laboratorio). En la base de datos solo queda texto cifrado con AES-256-GCM.
//
// Secretos necesarios (supabase secrets set ...):
//   HEALTH_ENCRYPTION_KEY   32 bytes en base64 (openssl rand -base64 32)
//   APP_ORIGIN              URL de la app, p. ej. https://usuario.github.io
// La base de datos además exige un consentimiento vigente (trigger), así que
// aunque esta función fallara, no se guardaría nada sin permiso.
// =============================================================================
import { admin, requireUser } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

const KEY_VERSION = 1
const CATEGORIES = ['medication', 'allergy', 'lab_result'] as const

let keyPromise: Promise<CryptoKey> | null = null
function getKey() {
  keyPromise ??= (async () => {
    const b64 = Deno.env.get('HEALTH_ENCRYPTION_KEY')
    if (!b64) throw new Error('Falta HEALTH_ENCRYPTION_KEY')
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    if (raw.length !== 32) throw new Error('HEALTH_ENCRYPTION_KEY debe tener 32 bytes')
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  })()
  return keyPromise
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function encrypt(userId: string, data: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(data))
  // El id de la persona va como dato adicional: un texto cifrado copiado a otra
  // cuenta no se puede descifrar.
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(userId) }, await getKey(), plain)
  return { ciphertext: toB64(new Uint8Array(ct)), iv: toB64(iv) }
}

async function decrypt(userId: string, ciphertext: string, iv: string) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(iv), additionalData: new TextEncoder().encode(userId) },
    await getKey(),
    fromB64(ciphertext),
  )
  return JSON.parse(new TextDecoder().decode(plain))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  const user = await requireUser(req)
  if (!user) return json(req, { error: 'unauthorized' }, 401)

  let body: {
    action?: string
    record?: {
      id?: string
      category?: string
      recordedOn?: string | null
      data?: { name?: string; notes?: string; affectsHeartRate?: boolean; labKey?: string; value?: number; unit?: string; refLow?: number | null; refHigh?: number | null }
    }
  }
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'bad_request' }, 400)
  }

  try {
    if (body.action === 'list') {
      const { data, error } = await admin
        .from('health_records')
        .select('id, category, ciphertext, iv, recorded_on')
        .eq('user_id', user.id)
        .order('created_at')
      if (error) throw error
      const records = []
      for (const r of data ?? []) {
        records.push({ id: r.id, category: r.category, recordedOn: r.recorded_on, data: await decrypt(user.id, r.ciphertext, r.iv) })
      }
      return json(req, { records })
    }

    if (body.action === 'save') {
      const rec = body.record
      if (!rec || !CATEGORIES.includes(rec.category as (typeof CATEGORIES)[number])) return json(req, { error: 'bad_category' }, 400)
      const name = String(rec.data?.name ?? '').trim()
      if (!name || name.length > 200) return json(req, { error: 'bad_name' }, 400)
      const clean: Record<string, unknown> = {
        name,
        notes: rec.data?.notes ? String(rec.data.notes).slice(0, 2000) : undefined,
        affectsHeartRate: rec.category === 'medication' ? Boolean(rec.data?.affectsHeartRate) : undefined,
      }
      if (rec.category === 'lab_result') {
        // Resultado de laboratorio: fecha, valor numérico, unidad y rango de referencia
        const finite = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e7 ? v : null)
        const value = finite(rec.data?.value)
        if (value === null) return json(req, { error: 'bad_value' }, 400)
        if (!rec.recordedOn || !/^\d{4}-\d{2}-\d{2}$/.test(rec.recordedOn)) return json(req, { error: 'bad_date' }, 400)
        clean.value = value
        clean.unit = String(rec.data?.unit ?? '').slice(0, 20)
        clean.labKey = rec.data?.labKey ? String(rec.data.labKey).slice(0, 40) : undefined
        clean.refLow = finite(rec.data?.refLow)
        clean.refHigh = finite(rec.data?.refHigh)
      }
      const enc = await encrypt(user.id, clean)
      const row = { user_id: user.id, category: rec.category, recorded_on: rec.recordedOn ?? null, key_version: KEY_VERSION, ...enc }
      const q = rec.id
        ? admin.from('health_records').update(row).eq('id', rec.id).eq('user_id', user.id)
        : admin.from('health_records').insert(row)
      const { error } = await q
      if (error) {
        // El trigger de la base de datos rechaza si no hay consentimiento
        return json(req, { error: error.code === '42501' ? 'consent_required' : 'save_failed' }, error.code === '42501' ? 403 : 500)
      }
      return json(req, { ok: true })
    }

    return json(req, { error: 'unknown_action' }, 400)
  } catch (e) {
    console.error(e)
    return json(req, { error: 'server_error' }, 500)
  }
})
