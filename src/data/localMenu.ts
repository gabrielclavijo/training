import { buildPayload, MENU_PARTS, type AiPayload, type Menu, type MenuMeal, type NutritionRow } from '../../supabase/functions/_shared/menu.ts'
import type { MenuRequest, NutritionPrefs } from './types'

/**
 * Modo local (sin servidor): NO se usa IA. Se arma un menú de EJEMPLO con
 * reglas simples, solo para ver cómo funciona la pantalla. Usa el mismo filtro
 * de datos que la función real, así «Lo que se envía a la IA» es fiel.
 */
export const LOCAL_MODEL = 'ejemplo-local'

export function toNutritionRow(p: NutritionPrefs): NutritionRow {
  return {
    diet_type: p.dietType,
    goal: p.goal,
    excluded_foods: p.excludedFoods,
    food_allergies: p.foodAllergies,
    meals_per_day: p.mealsPerDay,
    cooking_minutes: p.cookingMinutes,
    budget: p.budget,
    pantry: p.pantry,
  }
}

interface Dish {
  dish: string
  items: [string, string][]
  vegan?: boolean
  vegetarian?: boolean
}

const BREAKFAST: Dish[] = [
  {
    dish: 'Arepa con huevos pericos y fruta',
    items: [
      ['Arepa de maíz', '80 g (1 unidad)'],
      ['Huevos', '2 unidades'],
      ['Tomate y cebolla', '60 g'],
      ['Papaya', '150 g (1 taza)'],
    ],
    vegetarian: true,
  },
  {
    dish: 'Avena en hojuelas con banano y canela',
    items: [
      ['Avena en hojuelas', '60 g (2/3 taza)'],
      ['Bebida de soya', '250 ml (1 vaso)'],
      ['Banano', '1 unidad'],
    ],
    vegan: true,
    vegetarian: true,
  },
]
const MAIN: Dish[] = [
  {
    dish: 'Arroz, fríjoles, pollo a la plancha y ensalada',
    items: [
      ['Arroz', '150 g cocido (1 taza)'],
      ['Fríjoles', '150 g cocidos (3/4 taza)'],
      ['Pechuga de pollo', '120 g'],
      ['Lechuga y tomate', '100 g'],
    ],
  },
  {
    dish: 'Lentejas con arroz, plátano maduro y aguacate',
    items: [
      ['Lentejas', '180 g cocidas (1 taza)'],
      ['Arroz', '120 g cocido'],
      ['Plátano maduro', '100 g'],
      ['Aguacate', '50 g (1/4)'],
    ],
    vegan: true,
    vegetarian: true,
  },
  {
    dish: 'Pasta con atún, tomate y verduras',
    items: [
      ['Pasta', '90 g en seco'],
      ['Atún en agua', '1 lata (120 g)'],
      ['Tomate y calabacín', '150 g'],
    ],
  },
  {
    dish: 'Garbanzos guisados con papa y ensalada',
    items: [
      ['Garbanzos', '180 g cocidos'],
      ['Papa', '150 g'],
      ['Ensalada de repollo', '100 g'],
    ],
    vegan: true,
    vegetarian: true,
  },
]
const SNACK: Dish[] = [
  {
    dish: 'Yogur con granola',
    items: [
      ['Yogur natural', '200 g'],
      ['Granola', '40 g'],
    ],
    vegetarian: true,
  },
  {
    dish: 'Banano con mantequilla de ajonjolí',
    items: [
      ['Banano', '1 unidad'],
      ['Mantequilla de ajonjolí', '15 g (1 cucharada)'],
    ],
    vegan: true,
    vegetarian: true,
  },
]

const LABELS = ['Desayuno', 'Media mañana', 'Almuerzo', 'Algo', 'Comida', 'Merienda']
const ORDER: Record<number, number[]> = { 3: [0, 2, 4], 4: [0, 2, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] }
const TIMES = ['7:00', '10:00', '12:30', '16:00', '19:30', '21:00']
const SHARE = [0.25, 0.1, 0.3, 0.1, 0.25, 0.08]

function allowed(d: Dish, p: AiPayload) {
  if (p.diet === 'vegan' && !d.vegan) return false
  if (p.diet === 'vegetarian' && !d.vegetarian) return false
  const banned = [...p.allergies, ...p.excluded].map((x) => x.toLowerCase())
  return !d.items.some(([food]) => banned.some((b) => b && food.toLowerCase().includes(b)))
}

export function localMenu(prefs: NutritionPrefs, req: MenuRequest): { inputs: AiPayload; menu: Menu } {
  const p = buildPayload(toNutritionRow(prefs), req)
  const slots = ORDER[p.mealsPerDay]
  const share = slots.map((i) => SHARE[i])
  const total = share.reduce((a, x) => a + x, 0)
  const pick = (list: Dish[], i: number) => {
    const ok = list.filter((d) => allowed(d, p))
    return ok.length ? ok[i % ok.length] : null
  }
  const days = p.days.map((d, di) => {
    const meals: MenuMeal[] = []
    slots.forEach((slot, si) => {
      const list = slot === 0 ? BREAKFAST : slot === 2 || slot === 4 ? MAIN : SNACK
      const dish = pick(list, di + si)
      if (!dish) return
      const f = share[si] / total
      meals.push({
        label: LABELS[slot],
        time: TIMES[slot],
        dish: dish.dish,
        items: dish.items.map(([food, amount]) => ({ food, amount })),
        kcal: Math.round(d.kcal * f),
        proteinG: Math.round(d.proteinG * f),
        carbsG: Math.round(d.carbsG * f),
        fatG: Math.round(d.fatG * f),
      })
    })
    return { date: d.date, note: d.training.length ? 'Toma agua antes, durante y después de entrenar.' : '', meals }
  })
  const shopping = MENU_PARTS.map(([a, b]) => {
    const items = new Map<string, number>()
    for (const day of days.slice(a, b)) for (const m of day.meals) for (const it of m.items) items.set(it.food, (items.get(it.food) ?? 0) + 1)
    return { from: p.days[a].date, to: p.days[b - 1].date, items: [...items].map(([food, n]) => ({ food, amount: `${n} porciones` })) }
  })
  return { inputs: p, menu: { days, shopping, tips: ['Este es un menú de ejemplo del modo local: no lo hizo la IA.'] } }
}
