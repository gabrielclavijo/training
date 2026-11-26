/**
 * Reglas generales del plan de entrenamiento. Son las mismas para todas las
 * personas: el plan de cada una cambia por sus metas, su tiempo disponible,
 * sus pausas, su historial y «Tu fuerza», nunca por reglas especiales.
 * El detalle en lenguaje simple está en docs/reglas-del-plan.md.
 */
import type { Phase } from './plan'

export const PLAN_RULES = {
  /** Después de un evento: días de descanso total (1 día de evento / varios días) */
  restAfterEvent: { single: 1, stage: 2 },
  /** …y luego días de recuperación corta (máximo `recoveryMaxMin`) */
  easyAfterEvent: { single: 3, stage: 5 },
  recoveryMaxMin: 45,
  /** Sesiones de fuerza completas por semana según la etapa */
  strengthPerWeek: { base: 2, build: 2, maintenance: 2, recovery_week: 1, taper: 1, recovery: 1, return: 1, event: 0, pause: 0 } as Record<Phase, number>,
  /** Sesiones cortas de core (~20 min) por semana según la etapa (si hay tiempo) */
  corePerWeek: { base: 2, build: 2, maintenance: 2, recovery_week: 1, taper: 1 } as Partial<Record<Phase, number>>,
  coreMin: 20,
  /** Sin fuerza en los N días antes de un evento; sin core en los N días antes */
  noStrengthBeforeEvent: 5,
  noCoreBeforeEvent: 3,
  /** Sin fuerza después de un evento (1 día / varios días) */
  noStrengthAfterEvent: { single: 7, stage: 10 },
  /** La fuerza cuenta como carga reducida: puntos por minuto */
  strengthLoadPerMin: 0.5,
} as const

export const restAfter = (stageDays: number) => (stageDays > 1 ? PLAN_RULES.restAfterEvent.stage : PLAN_RULES.restAfterEvent.single)
export const easyAfter = (stageDays: number) => (stageDays > 1 ? PLAN_RULES.easyAfterEvent.stage : PLAN_RULES.easyAfterEvent.single)
export const noStrengthAfter = (stageDays: number) => (stageDays > 1 ? PLAN_RULES.noStrengthAfterEvent.stage : PLAN_RULES.noStrengthAfterEvent.single)
