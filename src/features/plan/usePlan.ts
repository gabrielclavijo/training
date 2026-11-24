import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useHealth } from '../../data/hooks'
import { diagnoseGoals, refreshPlan, sessionMatches, zonesFor } from '../../data/planService'
import { useRepo } from '../../data/RepoProvider'

/**
 * Plan vigente (lo recalcula y lo guarda si cambió), con el estado de cada
 * sesión, el diagnóstico de las metas y las zonas de la persona.
 */
export function usePlan() {
  const repo = useRepo()
  const health = useHealth()
  const q = useQuery({
    queryKey: ['plan'],
    queryFn: () => refreshPlan(repo, { health: health.data ?? [] }),
    staleTime: 2 * 60_000,
  })
  const derived = useMemo(() => {
    if (!q.data) return null
    const { plan, ctx } = q.data
    return {
      plan,
      ctx,
      today: ctx.today,
      matches: sessionMatches(plan, ctx.loaded, ctx.today),
      diagnoses: diagnoseGoals(ctx),
      zones: zonesFor(ctx, ctx.today),
    }
  }, [q.data])
  return { ...q, derived }
}
