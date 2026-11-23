import { addDays, daysBetween } from '../dates'

/**
 * Temporada (versión simple de la fase 1): ubica cada meta en el calendario con
 * su preparación, su disminución de carga previa, el evento y la recuperación,
 * y avisa cuando dos metas quedan demasiado cerca.
 * En la fase 2 el plan adaptativo reemplaza estos bloques por unos calculados.
 */

export interface SeasonGoal {
  id: string
  name: string
  eventDate: string
  priority: 'primary' | 'secondary'
  goalType: 'single' | 'stage'
  stageDays: number // 1 para salida única
  estimatedHours: number // duración estimada total del evento
}

export type BlockKind = 'build' | 'taper' | 'event' | 'recovery'
export interface SeasonBlock {
  goalId: string
  kind: BlockKind
  startsOn: string
  endsOn: string
}

export type WarningKind = 'overlap' | 'tight'
export interface SeasonWarning {
  kind: WarningKind
  goalId: string // la meta afectada (la segunda)
  previousGoalId: string
  /** Días entre el fin del evento anterior y la meta afectada */
  daysBetween: number
  recoveryDays: number
  suggestions: ('use_as_training' | 'lower_demand' | 'swap_priority' | 'move_date')[]
}

/** Días de recuperación sugeridos según el tamaño del evento. */
export function recoveryDays(g: Pick<SeasonGoal, 'goalType' | 'stageDays' | 'estimatedHours'>) {
  if (g.goalType === 'stage') return Math.min(21, 7 + 2 * g.stageDays)
  if (g.estimatedHours >= 6) return 10
  if (g.estimatedHours >= 3) return 7
  return 3
}

export function taperDays(g: Pick<SeasonGoal, 'priority'>) {
  return g.priority === 'primary' ? 10 : 5
}

/** Preparación mínima razonable entre metas (semanas útiles de entrenamiento). */
export const MIN_BUILD_DAYS = 21

/** Horas estimadas de un evento por distancia y desnivel (para recuperación y avisos). */
export function estimateHours(sport: string, distanceM: number, elevationM: number, terrain?: string | null) {
  if (distanceM <= 0) return 1
  let kmh = sport === 'running' ? 9 : sport === 'swimming' ? 3 : 22
  if (sport === 'cycling' && (terrain === 'unpaved' || terrain === 'mixed')) kmh = 18
  if (sport === 'cycling' && terrain === 'technical') kmh = 13
  const climbHours = sport === 'cycling' ? elevationM / 700 : sport === 'running' ? elevationM / 500 : 0
  return distanceM / 1000 / kmh + climbHours * 0.5
}

export function buildSeason(goals: SeasonGoal[], today: string) {
  const sorted = [...goals].filter((g) => g.eventDate >= addDays(today, -60)).sort((a, b) => a.eventDate.localeCompare(b.eventDate))
  const blocks: SeasonBlock[] = []
  const warnings: SeasonWarning[] = []
  let cursor = today
  let prev: { goal: SeasonGoal; eventEnd: string; recoveryEnd: string } | null = null

  for (const g of sorted) {
    const eventEnd = addDays(g.eventDate, Math.max(1, g.stageDays) - 1)
    const rec = recoveryDays(g)
    const recoveryEnd = addDays(eventEnd, rec)
    const taperStart = addDays(g.eventDate, -taperDays(g))

    if (prev) {
      const gap = daysBetween(prev.eventEnd, g.eventDate)
      const prevRec = recoveryDays(prev.goal)
      if (gap <= prevRec) {
        warnings.push({
          kind: 'overlap',
          goalId: g.id,
          previousGoalId: prev.goal.id,
          daysBetween: gap,
          recoveryDays: prevRec,
          suggestions: suggestionsFor(prev.goal, g),
        })
      } else if (gap - prevRec < MIN_BUILD_DAYS) {
        warnings.push({
          kind: 'tight',
          goalId: g.id,
          previousGoalId: prev.goal.id,
          daysBetween: gap,
          recoveryDays: prevRec,
          suggestions: suggestionsFor(prev.goal, g),
        })
      }
    }

    const buildStart = cursor
    if (buildStart < taperStart) blocks.push({ goalId: g.id, kind: 'build', startsOn: buildStart, endsOn: addDays(taperStart, -1) })
    const tStart = buildStart > taperStart ? buildStart : taperStart
    if (tStart < g.eventDate) blocks.push({ goalId: g.id, kind: 'taper', startsOn: tStart, endsOn: addDays(g.eventDate, -1) })
    blocks.push({ goalId: g.id, kind: 'event', startsOn: g.eventDate, endsOn: eventEnd })
    blocks.push({ goalId: g.id, kind: 'recovery', startsOn: addDays(eventEnd, 1), endsOn: recoveryEnd })
    cursor = addDays(recoveryEnd, 1) > cursor ? addDays(recoveryEnd, 1) : cursor
    prev = { goal: g, eventEnd, recoveryEnd }
  }
  return { goals: sorted, blocks, warnings }
}

function suggestionsFor(a: SeasonGoal, b: SeasonGoal): SeasonWarning['suggestions'] {
  const s: SeasonWarning['suggestions'] = []
  if (a.priority === 'secondary' || b.priority === 'secondary') s.push('use_as_training')
  s.push('lower_demand')
  if (a.priority === 'primary' && b.priority === 'primary') s.push('swap_priority')
  s.push('move_date')
  return s
}
