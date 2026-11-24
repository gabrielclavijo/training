import { addDays } from '../dates'

/**
 * Recomendaciones por reglas (sin IA). Cada regla mira tus datos y, si aplica,
 * devuelve qué hacer y por qué (con el dato concreto en `params`).
 * Se muestran como máximo 3, de la más importante a la menos.
 */

export type Severity = 'high' | 'medium' | 'low'

export interface Recommendation {
  key: string
  severity: Severity
  params: Record<string, string | number>
  link?: { to: string; label: 'plan' | 'availability' | 'profile' | 'guides' | 'nutrition' | 'labs' | 'goal' }
}

export interface RecContext {
  today: string
  snapshot: { tsb: number; rampPerWeek: number; historyDays: number } | null
  /** Carga semanal (lunes de cada semana), en orden; incluye la semana en curso */
  weeks: { week: string; load: number }[]
  /** Sesiones planeadas de los últimos 14 días con su estado */
  recentSessions: { date: string; status: 'pending' | 'done' | 'partial' | 'harder' | 'missed' | 'rest' }[]
  goal: {
    id: string
    name: string
    eventDate: string
    /** Horas por día de evento (la etapa más larga en carreras por etapas) */
    hoursPerDay: number
    elevationGainM: number | null
  } | null
  /** Últimas 4 semanas */
  longestMin: number
  elevationM: number
  hasThreshold: boolean
  hasHrMax: boolean
  hasActivities: boolean
  hrRest: { latest: number; baseline: number } | null
  weight: { latestKg: number; previousKg: number; days: number } | null
  /** Exámenes cuyo último resultado está fuera del rango */
  labsOutOfRange: string[]
}

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 }

type Rule = (c: RecContext) => Recommendation | null

const completeWeeks = (c: RecContext) => {
  const current = c.weeks.length ? c.weeks[c.weeks.length - 1].week : null
  return current && addDays(current, 6) >= c.today ? c.weeks.slice(0, -1) : c.weeks
}

const rules: Rule[] = [
  // Fatiga muy alta
  (c) => (c.snapshot && c.snapshot.historyDays >= 28 && c.snapshot.tsb < -30 ? { key: 'very_tired', severity: 'high', params: { tsb: Math.round(c.snapshot.tsb) }, link: { to: '/plan', label: 'plan' } } : null),

  // La forma sube demasiado rápido
  (c) =>
    c.snapshot && c.snapshot.historyDays >= 28 && c.snapshot.rampPerWeek > 8
      ? { key: 'ramp_high', severity: 'high', params: { ramp: Math.round(c.snapshot.rampPerWeek) }, link: { to: '/plan', label: 'plan' } }
      : null,

  // Exámenes fuera de rango: solo «habla con tu médico»
  (c) => (c.labsOutOfRange.length ? { key: 'lab_out_of_range', severity: 'high', params: { names: c.labsOutOfRange.join(', ') }, link: { to: '/laboratorio', label: 'labs' } } : null),

  // Pulso en reposo alto frente a lo habitual
  (c) =>
    c.hrRest && c.hrRest.latest - c.hrRest.baseline >= 7
      ? { key: 'hr_rest_high', severity: 'medium', params: { latest: c.hrRest.latest, baseline: c.hrRest.baseline } }
      : null,

  // Dos semanas seguidas subiendo más del 10 %
  (c) => {
    const w = completeWeeks(c).slice(-3)
    if (w.length < 3 || w[0].load <= 0 || w[1].load <= 0) return null
    const a = (w[1].load - w[0].load) / w[0].load
    const b = (w[2].load - w[1].load) / w[1].load
    return a > 0.1 && b > 0.1 ? { key: 'load_rising', severity: 'medium', params: { pct: Math.round(b * 100) }, link: { to: '/plan', label: 'plan' } } : null
  },

  // Tres semanas o más sin descarga
  (c) => {
    const w = completeWeeks(c).slice(-4)
    if (w.length < 4 || w.some((x) => x.load <= 0)) return null
    const avg = w.reduce((a, x) => a + x.load, 0) / w.length
    return w.every((x) => x.load >= 0.8 * avg) ? { key: 'no_recovery_week', severity: 'medium', params: { weeks: w.length }, link: { to: '/plan', label: 'plan' } } : null
  },

  // Sesiones que no se hacen
  (c) => {
    const missed = c.recentSessions.filter((s) => s.status === 'missed').length
    return missed >= 3 ? { key: 'missed_sessions', severity: 'medium', params: { count: missed }, link: { to: '/plan/disponibilidad', label: 'availability' } } : null
  },

  // Salida larga lejos de la duración del evento
  (c) => {
    if (!c.goal || c.goal.hoursPerDay < 2.5) return null
    const weeksLeft = (Date.parse(c.goal.eventDate) - Date.parse(c.today)) / (7 * 86_400_000)
    if (weeksLeft < 3 || weeksLeft > 20) return null
    const goalMin = Math.round(c.goal.hoursPerDay * 60)
    return c.longestMin < goalMin * 0.5
      ? { key: 'long_short', severity: 'medium', params: { name: c.goal.name, longest: c.longestMin, goal: goalMin }, link: { to: `/metas/${c.goal.id}`, label: 'goal' } }
      : null
  },

  // Poco desnivel para una meta con mucha subida
  (c) => {
    if (!c.goal || !c.goal.elevationGainM || c.goal.elevationGainM < 1000) return null
    const weeksLeft = (Date.parse(c.goal.eventDate) - Date.parse(c.today)) / (7 * 86_400_000)
    if (weeksLeft < 2 || weeksLeft > 20) return null
    return c.elevationM < c.goal.elevationGainM
      ? { key: 'climbing_short', severity: 'low', params: { name: c.goal.name, done: Math.round(c.elevationM), goal: Math.round(c.goal.elevationGainM) }, link: { to: `/metas/${c.goal.id}`, label: 'goal' } }
      : null
  },

  // Cambio rápido de peso
  (c) => {
    if (!c.weight || c.weight.days > 21 || c.weight.previousKg <= 0) return null
    const pct = ((c.weight.latestKg - c.weight.previousKg) / c.weight.previousKg) * 100
    return Math.abs(pct) >= 3
      ? { key: 'weight_change', severity: 'low', params: { pct: Math.round(pct * 10) / 10, days: c.weight.days }, link: { to: '/nutricion', label: 'nutrition' } }
      : null
  },

  // Datos que faltan para que las zonas sean tuyas
  (c) => (c.hasActivities && !c.hasThreshold ? { key: 'missing_threshold', severity: 'low', params: {}, link: { to: '/ayuda?tema=numeros', label: 'guides' } } : null),
  (c) => (c.hasActivities && !c.hasHrMax && c.hasThreshold ? { key: 'missing_hrmax', severity: 'low', params: {}, link: { to: '/perfil', label: 'profile' } } : null),
]

/** Todas las recomendaciones que aplican, de la más importante a la menos. */
export function evaluate(c: RecContext): Recommendation[] {
  const out = rules.map((r) => r(c)).filter((r): r is Recommendation => r !== null)
  return out.map((r, i) => ({ r, i })).sort((a, b) => ORDER[a.r.severity] - ORDER[b.r.severity] || a.i - b.i).map((x) => x.r)
}

/** Las que se muestran: sin las ocultadas por la persona, máximo `max`. */
export function visible(recs: Recommendation[], dismissed: { ruleKey: string; dismissedUntil: string }[], today: string, max = 3) {
  const hidden = new Set(dismissed.filter((d) => d.dismissedUntil >= today).map((d) => d.ruleKey))
  return recs.filter((r) => !hidden.has(r.key)).slice(0, max)
}

/** Días que se oculta una tarjeta al tocar «Entendido» o «No aplica». */
export const DISMISS_DAYS = 7
