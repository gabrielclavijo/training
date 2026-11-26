import { useMemo } from 'react'
import { addDays, ageOn } from '../../core/dates'
import { dailyNeeds, type DayNeeds, type DaySession, type MissingPersonData, type PersonData } from '../../core/nutrition/needs'
import { latestWeight } from '../../data/analysis'
import { useProfile, useWeights } from '../../data/hooks'
import type { MenuRequest, NutritionPrefs } from '../../data/types'
import { usePlan } from '../plan/usePlan'

export interface DayRow {
  date: string
  sessions: DaySession[]
  needs: DayNeeds
}

/** Datos de la persona para las fórmulas, o qué falta. */
export function usePerson(): { person: PersonData | null; missing: MissingPersonData[]; isLoading: boolean } {
  const profile = useProfile()
  const weights = useWeights()
  return useMemo(() => {
    const p = profile.data
    const w = weights.data ? latestWeight(weights.data) : null
    const missing: MissingPersonData[] = []
    if (!w) missing.push('weight')
    if (!p?.heightCm) missing.push('height')
    if (!p?.birthDate) missing.push('birthDate')
    if (!p?.sexForFormulas) missing.push('sex')
    const today = new Date().toISOString().slice(0, 10)
    const person =
      missing.length === 0 ? { weightKg: w!, heightCm: p!.heightCm!, ageYears: ageOn(p!.birthDate!, today), sex: p!.sexForFormulas! } : null
    return { person, missing, isLoading: profile.isLoading || weights.isLoading }
  }, [profile.data, weights.data, profile.isLoading, weights.isLoading])
}

/** Necesidades de cada día de la semana según las sesiones planeadas (no las actividades hechas). */
export function useWeekNeeds(weekStart: string, prefs: NutritionPrefs | null) {
  const { person, missing, isLoading } = usePerson()
  const plan = usePlan()
  const sessions = plan.derived?.plan.sessions
  const days = useMemo<DayRow[] | null>(() => {
    if (!person) return null
    const goal = prefs?.goal ?? 'perform'
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i)
      const day = (sessions ?? [])
        .filter((s) => s.date === date && s.kind !== 'rest' && s.durationMin > 0)
        .map((s) => ({ sport: s.sport, kind: s.kind, durationMin: s.durationMin }))
      return { date, sessions: day, needs: dailyNeeds(person, day, goal) }
    })
  }, [person, sessions, weekStart, prefs?.goal])
  const hasPlan = (sessions ?? []).some((s) => s.date >= weekStart && s.date <= addDays(weekStart, 6))
  return { person, missing, days, hasPlan, isLoading: isLoading || plan.isLoading }
}

/** Solicitud para la IA: solo números y categorías fijas por día. */
export function toMenuRequest(weekStart: string, days: DayRow[]): MenuRequest {
  return {
    weekStart,
    days: days.map((d) => ({
      date: d.date,
      kcal: d.needs.kcal,
      carbsG: d.needs.carbsG,
      proteinG: d.needs.proteinG,
      fatG: d.needs.fatG,
      training: d.sessions.map((s) => ({ sport: s.sport, kind: s.kind as Exclude<typeof s.kind, 'rest'>, durationMin: s.durationMin })),
    })),
  }
}
