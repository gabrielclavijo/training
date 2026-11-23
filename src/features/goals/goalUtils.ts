import { estimateHours, type SeasonGoal } from '../../core/season'
import type { Goal } from '../../data/types'

export function goalTotals(g: Pick<Goal, 'goalType' | 'stages' | 'distanceM' | 'elevationGainM'>) {
  if (g.goalType === 'stage' && g.stages.length) {
    return {
      distanceM: g.stages.reduce((a, s) => a + s.distanceM, 0),
      elevationGainM: g.stages.reduce((a, s) => a + s.elevationGainM, 0),
    }
  }
  return { distanceM: g.distanceM ?? 0, elevationGainM: g.elevationGainM ?? 0 }
}

export function goalEstimatedHours(g: Goal) {
  if (g.goalType === 'stage' && g.stages.length) {
    return g.stages.reduce((a, s) => a + estimateHours(g.sport, s.distanceM, s.elevationGainM, s.terrain ?? g.terrain), 0)
  }
  const tot = goalTotals(g)
  return estimateHours(g.sport, tot.distanceM, tot.elevationGainM, g.terrain)
}

export function toSeasonGoal(g: Goal): SeasonGoal {
  return {
    id: g.id,
    name: g.name,
    eventDate: g.eventDate,
    priority: g.priority,
    goalType: g.goalType,
    stageDays: g.goalType === 'stage' ? Math.max(1, ...g.stages.map((s) => s.dayOffset + 1)) : 1,
    estimatedHours: g.objective === 'time' && g.targetTimeS ? g.targetTimeS / 3600 : goalEstimatedHours(g),
  }
}
