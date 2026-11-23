// CORS: solo la URL de la app puede llamar a las funciones desde el navegador.
// Configura APP_ORIGIN (ej. https://usuario.github.io) en los secretos de Supabase.
const allowed = (Deno.env.get('APP_ORIGIN') ?? '').split(',').map((s) => s.trim()).filter(Boolean)

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allow = allowed.length === 0 || allowed.includes(origin) ? origin || '*' : allowed[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}
