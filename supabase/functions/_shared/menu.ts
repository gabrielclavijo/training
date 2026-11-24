// =============================================================================
// Menús con IA: qué se envía, cómo se le pide y cómo se valida la respuesta.
// Módulo SIN dependencias de Deno ni del navegador: lo usan la Edge Function
// nutrition-menu y las pruebas automáticas de la app (src/…).
//
// Regla central: a la IA solo llegan
//   - el perfil de alimentación que la persona escribió a mano, y
//   - las calorías/macronutrientes de cada día y el tipo y duración de la sesión
//     planeada (números y categorías fijas, calculados por la app).
// Nunca actividades, datos de Strava, exámenes, salud, nombre ni correo.
// =============================================================================

export const MENU_MODEL = 'claude-opus-5-5'

// ---- Tipos ------------------------------------------------------------------

export interface MenuItem {
  food: string
  amount: string
}
export interface MenuMeal {
  label: string
  time: string
  dish: string
  items: MenuItem[]
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
}
export interface MenuDay {
  date: string
  note: string
  meals: MenuMeal[]
}
export interface ShoppingList {
  from: string
  to: string
  items: MenuItem[]
}
export interface Menu {
  days: MenuDay[]
  shopping: ShoppingList[]
  tips: string[]
}

export const TRAINING_SPORTS = ['cycling', 'running', 'swimming', 'strength', 'other'] as const
export const TRAINING_KINDS = ['easy', 'long', 'tempo', 'threshold', 'vo2', 'climb', 'recovery', 'strength', 'openers', 'event'] as const

export interface MenuDayTarget {
  date: string
  kcal: number
  carbsG: number
  proteinG: number
  fatG: number
  training: { sport: (typeof TRAINING_SPORTS)[number]; kind: (typeof TRAINING_KINDS)[number]; durationMin: number }[]
}
export interface MenuRequest {
  weekStart: string
  days: MenuDayTarget[]
}

/** Perfil de alimentación tal como está en la base de datos. */
export interface NutritionRow {
  diet_type: string
  goal: string
  excluded_foods: string[]
  food_allergies: string[]
  meals_per_day: number
  cooking_minutes: number
  budget: string
  pantry: string[]
}

/** Lo que recibe la IA, completo. */
export interface AiPayload {
  diet: 'omnivore' | 'vegetarian' | 'vegan'
  goal: 'maintain' | 'lose' | 'gain' | 'perform'
  allergies: string[]
  excluded: string[]
  mealsPerDay: number
  cookingMinutes: number
  budget: 'low' | 'medium' | 'high'
  pantry: string[]
  days: (MenuDayTarget & { weekday: string })[]
}

// ---- Construcción y validación de lo que se envía ---------------------------

const DIETS = ['omnivore', 'vegetarian', 'vegan'] as const
const GOALS = ['maintain', 'lose', 'gain', 'perform'] as const
const BUDGETS = ['low', 'medium', 'high'] as const
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export class BadInput extends Error {}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback

function num(v: unknown, min: number, max: number, field: string): number {
  const n = typeof v === 'number' ? v : Number.NaN
  if (!Number.isFinite(n) || n < min || n > max) throw new BadInput(`${field} fuera de rango`)
  return Math.round(n)
}

/** Limpia una lista de textos escritos a mano: sin saltos de línea ni símbolos de control, cortos. */
export function cleanList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') continue
    const s = x.replace(/[\u0000-\u001f\u007f<>{}[\]`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
    if (s && !out.includes(s)) out.push(s)
    if (out.length >= max) break
  }
  return out
}

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Arma el contenido exacto que se envía a la IA a partir del perfil guardado en
 * la base de datos (no del navegador) y de los objetivos numéricos del día.
 * Todo campo que no esté aquí, no viaja.
 */
export function buildPayload(prefs: NutritionRow, req: unknown): AiPayload {
  const r = (req ?? {}) as Partial<MenuRequest>
  if (typeof r.weekStart !== 'string' || !DATE_RE.test(r.weekStart)) throw new BadInput('weekStart inválido')
  if (!Array.isArray(r.days) || r.days.length !== 7) throw new BadInput('se esperan 7 días')
  const weekStart = r.weekStart
  const days = r.days.map((d, i) => {
    const date = addDays(weekStart, i)
    if (!d || d.date !== date) throw new BadInput('fechas inválidas')
    const training = (Array.isArray(d.training) ? d.training : []).slice(0, 3).map((s) => ({
      sport: pick(s?.sport, TRAINING_SPORTS, 'other'),
      kind: pick(s?.kind, TRAINING_KINDS, 'easy'),
      durationMin: num(s?.durationMin, 0, 900, 'duración'),
    }))
    return {
      date,
      weekday: WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()],
      kcal: num(d.kcal, 1000, 7000, 'kcal'),
      carbsG: num(d.carbsG, 50, 1200, 'carbohidratos'),
      proteinG: num(d.proteinG, 30, 400, 'proteína'),
      fatG: num(d.fatG, 20, 300, 'grasa'),
      training,
    }
  })
  return {
    diet: pick(prefs.diet_type, DIETS, 'omnivore'),
    goal: pick(prefs.goal, GOALS, 'perform'),
    allergies: cleanList(prefs.food_allergies, 30),
    excluded: cleanList(prefs.excluded_foods, 30),
    mealsPerDay: Math.min(6, Math.max(3, Math.round(prefs.meals_per_day || 4))),
    cookingMinutes: Math.min(180, Math.max(5, Math.round(prefs.cooking_minutes || 30))),
    budget: pick(prefs.budget, BUDGETS, 'medium'),
    pantry: cleanList(prefs.pantry, 40),
    days,
  }
}

// ---- Instrucciones para la IA -----------------------------------------------

export const SYSTEM_PROMPT = `Eres un asistente de nutrición deportiva para deportistas aficionados en Colombia.
Armas menús prácticos con comida que se consigue en supermercados y plazas de mercado colombianas, en español de Colombia.

Reglas obligatorias:
- Las alergias e intolerancias de la persona son estrictas: ningún plato ni ingrediente puede contenerlas, ni como trazas evidentes (por ejemplo, salsas o mantequillas de maní si hay alergia al maní).
- Respeta el tipo de alimentación (omnívora, vegetariana: sin carne ni pescado; vegana: nada de origen animal) y no uses los alimentos excluidos.
- Haz exactamente el número de comidas por día que se indica. En días con sesión de más de 60 minutos, una de esas comidas va 2-3 horas antes y otra poco después de entrenar; indícalo en "label".
- Las calorías del día deben quedar dentro de ±5 % del objetivo; proteína, carbohidratos y grasa cerca de lo indicado.
- Respeta el tiempo de cocina por comida y el presupuesto. Usa primero los alimentos que la persona tiene en casa.
- Cantidades en gramos o mililitros y, entre paréntesis, una medida casera (por ejemplo, "150 g (1 taza)").
- Varía los platos entre días; puedes repetir preparaciones aprovechando sobras para ahorrar tiempo.
- "note" del día: una frase corta sobre la hidratación o la comida alrededor del entrenamiento de ese día (vacía si es día de descanso).
- "tips": máximo 3 consejos cortos y prácticos para la semana. No des consejos médicos ni hables de suplementos más allá de bebidas o geles deportivos.
- La lista de mercado suma las cantidades de todos los días que se te piden, agrupando el mismo alimento.
Responde solo con el JSON pedido.`

const LABELS: Record<string, string> = {
  omnivore: 'omnívora',
  vegetarian: 'vegetariana',
  vegan: 'vegana',
  maintain: 'mantener el peso',
  lose: 'bajar de peso de forma gradual',
  gain: 'subir de peso',
  perform: 'rendir en sus entrenamientos y eventos',
  low: 'económico',
  medium: 'moderado',
  high: 'amplio',
}
const SESSION_LABELS: Record<string, string> = {
  easy: 'suave',
  long: 'larga y suave',
  tempo: 'ritmo sostenido',
  threshold: 'umbral (exigente)',
  vo2: 'intervalos cortos muy duros',
  climb: 'subidas',
  recovery: 'recuperación muy suave',
  strength: 'gimnasio de fuerza',
  openers: 'activación corta',
  event: 'evento / competencia',
}
const SPORT_LABELS: Record<string, string> = { cycling: 'ciclismo', running: 'carrera', swimming: 'natación', strength: 'gimnasio', other: 'otro deporte' }

/** Texto que acompaña al JSON: describe la tarea para los días pedidos. */
export function userPrompt(p: AiPayload, from: number, to: number): string {
  const days = p.days.slice(from, to).map((d) => ({
    fecha: d.date,
    dia: d.weekday,
    kcal: d.kcal,
    proteina_g: d.proteinG,
    carbohidratos_g: d.carbsG,
    grasa_g: d.fatG,
    entrenamiento: d.training.length
      ? d.training.map((s) => `${SPORT_LABELS[s.sport]}, ${SESSION_LABELS[s.kind]}, ${s.durationMin} min`).join(' + ')
      : 'descanso',
  }))
  const persona = {
    alimentacion: LABELS[p.diet],
    objetivo: LABELS[p.goal],
    alergias_e_intolerancias: p.allergies.length ? p.allergies : ['ninguna'],
    alimentos_que_no_come: p.excluded.length ? p.excluded : ['ninguno'],
    comidas_por_dia: p.mealsPerDay,
    minutos_maximos_de_cocina_por_comida: p.cookingMinutes,
    presupuesto: LABELS[p.budget],
    tiene_en_casa: p.pantry,
  }
  return `Arma el menú de estos ${days.length} días y la lista de mercado de esos mismos días.

Persona:
${JSON.stringify(persona, null, 2)}

Días:
${JSON.stringify(days, null, 2)}`
}

export function swapPrompt(p: AiPayload, day: MenuDay, mealIndex: number): string {
  const meal = day.meals[mealIndex]
  const target = p.days.find((d) => d.date === day.date)
  return `Propón UNA alternativa para esta comida, con calorías y macronutrientes parecidos (±10 %), mismo momento del día y un plato distinto a los demás del día.
Incluye en "shopping" solo los alimentos nuevos que haya que comprar para esta alternativa.

Persona:
${JSON.stringify({
  alimentacion: LABELS[p.diet],
  alergias_e_intolerancias: p.allergies.length ? p.allergies : ['ninguna'],
  alimentos_que_no_come: p.excluded.length ? p.excluded : ['ninguno'],
  minutos_maximos_de_cocina: p.cookingMinutes,
  presupuesto: LABELS[p.budget],
  tiene_en_casa: p.pantry,
}, null, 2)}

Día ${day.date}${target?.training.length ? ` (entrenamiento: ${target.training.map((s) => `${SESSION_LABELS[s.kind]} ${s.durationMin} min`).join(' + ')})` : ''}.
Comida a cambiar: ${JSON.stringify({ label: meal.label, time: meal.time, dish: meal.dish, kcal: meal.kcal, proteinG: meal.proteinG, carbsG: meal.carbsG, fatG: meal.fatG })}
Otros platos del día: ${JSON.stringify(day.meals.filter((_, i) => i !== mealIndex).map((m) => m.dish))}`
}

// ---- Esquemas de respuesta (salida estructurada) ----------------------------

const ITEM_SCHEMA = {
  type: 'object',
  properties: { food: { type: 'string' }, amount: { type: 'string' } },
  required: ['food', 'amount'],
  additionalProperties: false,
}
const MEAL_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string' },
    time: { type: 'string' },
    dish: { type: 'string' },
    items: { type: 'array', items: ITEM_SCHEMA },
    kcal: { type: 'integer' },
    proteinG: { type: 'integer' },
    carbsG: { type: 'integer' },
    fatG: { type: 'integer' },
  },
  required: ['label', 'time', 'dish', 'items', 'kcal', 'proteinG', 'carbsG', 'fatG'],
  additionalProperties: false,
}
export const MENU_PART_SCHEMA = {
  type: 'object',
  properties: {
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: { date: { type: 'string' }, note: { type: 'string' }, meals: { type: 'array', items: MEAL_SCHEMA } },
        required: ['date', 'note', 'meals'],
        additionalProperties: false,
      },
    },
    shopping: { type: 'array', items: ITEM_SCHEMA },
    tips: { type: 'array', items: { type: 'string' } },
  },
  required: ['days', 'shopping', 'tips'],
  additionalProperties: false,
}
export const SWAP_SCHEMA = {
  type: 'object',
  properties: { meal: MEAL_SCHEMA, shopping: { type: 'array', items: ITEM_SCHEMA } },
  required: ['meal', 'shopping'],
  additionalProperties: false,
}

// ---- Validación de lo que responde la IA ------------------------------------

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '')
const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0)

function items(v: unknown, max: number): MenuItem[] {
  if (!Array.isArray(v)) return []
  return v
    .slice(0, max)
    .map((x) => ({ food: text(x?.food, 80), amount: text(x?.amount, 60) }))
    .filter((x) => x.food)
}

export function parseMeal(v: unknown): MenuMeal {
  const m = (v ?? {}) as Record<string, unknown>
  const meal = {
    label: text(m.label, 40),
    time: text(m.time, 10),
    dish: text(m.dish, 140),
    items: items(m.items, 15),
    kcal: int(m.kcal, 3000),
    proteinG: int(m.proteinG, 300),
    carbsG: int(m.carbsG, 600),
    fatG: int(m.fatG, 200),
  }
  if (!meal.dish) throw new BadInput('comida sin plato')
  return meal
}

/** Valida una parte del menú (unos días) y verifica que traiga exactamente esas fechas. */
export function parseMenuPart(v: unknown, dates: string[]): { days: MenuDay[]; shopping: MenuItem[]; tips: string[] } {
  const o = (v ?? {}) as Record<string, unknown>
  const raw = Array.isArray(o.days) ? o.days : []
  const days = dates.map((date) => {
    const d = raw.find((x) => (x as { date?: string })?.date === date) as Record<string, unknown> | undefined
    if (!d || !Array.isArray(d.meals) || d.meals.length === 0) throw new BadInput(`falta el día ${date}`)
    return { date, note: text(d.note, 200), meals: d.meals.slice(0, 8).map(parseMeal) }
  })
  return {
    days,
    shopping: items(o.shopping, 120),
    tips: (Array.isArray(o.tips) ? o.tips : []).slice(0, 3).map((t) => text(t, 200)).filter(Boolean),
  }
}

/** Partes en que se pide el menú (en paralelo, para que responda rápido): lunes-jueves y viernes-domingo. */
export const MENU_PARTS: [number, number][] = [
  [0, 4],
  [4, 7],
]

/** Une las partes en un menú semanal. */
export function joinParts(p: AiPayload, parts: { days: MenuDay[]; shopping: MenuItem[]; tips: string[] }[]): Menu {
  return {
    days: parts.flatMap((x) => x.days),
    shopping: parts.map((x, i) => ({ from: p.days[MENU_PARTS[i][0]].date, to: p.days[MENU_PARTS[i][1] - 1].date, items: x.shopping })),
    tips: [...new Set(parts.flatMap((x) => x.tips))].slice(0, 4),
  }
}
