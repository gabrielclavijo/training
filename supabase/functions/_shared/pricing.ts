// =============================================================================
// Costo de cada petición a Claude, en dólares, según los tokens que reporta la
// API. Precios por millón de tokens (lista pública de Anthropic). Sin
// dependencias: lo usan la función nutrition-menu y las pruebas de la app.
// =============================================================================

export interface Price {
  input: number
  output: number
  cacheRead: number
}

export const PRICES: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
}
/** Si llega un modelo desconocido (p. ej. un respaldo), se usa el precio del modelo principal. */
export const DEFAULT_PRICE: Price = PRICES['claude-opus-5-5']

export interface UsageLike {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export function priceFor(model: string | null | undefined): Price {
  if (!model) return DEFAULT_PRICE
  const key = Object.keys(PRICES).find((k) => model === k || model.startsWith(`${k}-`))
  return key ? PRICES[key] : DEFAULT_PRICE
}

/** Dólares de una petición. Escribir en caché cuesta 1,25 veces la entrada; leerla, el precio de caché. */
export function costUsd(model: string | null | undefined, u: UsageLike): number {
  const p = priceFor(model)
  const input = (u.input_tokens ?? 0) * p.input
  const cacheWrite = (u.cache_creation_input_tokens ?? 0) * p.input * 1.25
  const cacheRead = (u.cache_read_input_tokens ?? 0) * p.cacheRead
  const output = (u.output_tokens ?? 0) * p.output
  return (input + cacheWrite + cacheRead + output) / 1_000_000
}

export interface Spend {
  model: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export function addSpend(a: Spend, model: string | null | undefined, u: UsageLike): Spend {
  return {
    model: model ?? a.model,
    inputTokens: a.inputTokens + (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    outputTokens: a.outputTokens + (u.output_tokens ?? 0),
    costUsd: a.costUsd + costUsd(model, u),
  }
}
export const NO_SPEND: Spend = { model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 }
