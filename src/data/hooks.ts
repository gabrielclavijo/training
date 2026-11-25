import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { localDayKey } from '../core/dates'
import { useRepo } from './RepoProvider'
import { notify } from '../components/fx/Toast'
import type { IconName } from '../components/ui/Icon'
import i18n from '../i18n'
import { fitnessOverview, loadsFor } from './analysis'

/** Consultas compartidas (con caché) sobre el repositorio activo. */

export const keys = {
  profile: ['profile'] as const,
  avatar: ['avatar'] as const,
  weights: ['weights'] as const,
  physiology: ['physiology'] as const,
  consents: ['consents'] as const,
  health: ['health'] as const,
  nutrition: ['nutrition'] as const,
  connections: ['connections'] as const,
  activities: ['activities'] as const,
  activity: (id: string) => ['activity', id] as const,
  goals: ['goals'] as const,
  goal: (id: string) => ['goal', id] as const,
  pauses: ['pauses'] as const,
  jobs: ['jobs'] as const,
  checkins: ['checkins'] as const,
}

export function useProfile() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.profile, queryFn: () => repo.getProfile() })
}
export function useAvatar() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.avatar, queryFn: () => repo.getAvatarUrl(), staleTime: 30 * 60_000 })
}
export function useWeights() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.weights, queryFn: () => repo.listWeights() })
}
export function usePhysiology() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.physiology, queryFn: () => repo.listPhysiology() })
}
export function useConsents() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.consents, queryFn: () => repo.listConsents() })
}
export function useHasHealthConsent() {
  const c = useConsents()
  return { ...c, data: c.data?.some((x) => x.type === 'health_data' && !x.revokedAt) ?? false }
}
/** Datos de salud descifrados (solo si hay consentimiento). */
export function useHealth() {
  const repo = useRepo()
  const consent = useHasHealthConsent()
  return useQuery({
    queryKey: keys.health,
    queryFn: () => repo.listHealth(),
    enabled: consent.data === true,
  })
}
export function useNutrition() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.nutrition, queryFn: () => repo.getNutrition() })
}
export function useConnections() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.connections, queryFn: () => repo.listConnections() })
}
export function useActivities() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.activities, queryFn: () => repo.listActivities() })
}
export function useGoals() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.goals, queryFn: () => repo.listGoals() })
}
export function usePauses() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.pauses, queryFn: () => repo.listPauses() })
}
export function useJobs() {
  const repo = useRepo()
  return useQuery({ queryKey: keys.jobs, queryFn: () => repo.listJobs() })
}

/** «¿Cómo te sientes hoy?» de los últimos `days` días */
export function useCheckins(days = 14) {
  const repo = useRepo()
  return useQuery({ queryKey: [...keys.checkins, days], queryFn: () => repo.listCheckins(days) })
}

/** Actividades con su carga calculada y la forma física de hoy. */
export function useFitness() {
  const acts = useActivities()
  const phys = usePhysiology()
  const prof = useProfile()
  const health = useHealth()
  const ready = acts.data && phys.data && prof.data
  const today = localDayKey(new Date())
  const loaded = ready ? loadsFor(acts.data!, { physiology: phys.data!, profile: prof.data!, health: health.data ?? [] }) : null
  const overview = loaded ? fitnessOverview(loaded, today) : null
  return {
    isLoading: acts.isLoading || phys.isLoading || prof.isLoading,
    error: acts.error ?? phys.error ?? prof.error,
    loaded,
    overview,
    today,
  }
}

/** Invalida todo lo que depende de las actividades. */
export function useInvalidateAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}

export function useRepoMutation<TArgs>(
  fn: (args: TArgs) => Promise<unknown>,
  invalidate: readonly (readonly string[])[] | 'all',
  /** Aviso al terminar bien (p. ej. «Guardado», «Eliminado»); con él, si falla también se avisa */
  opts: { success?: string; icon?: IconName } = {},
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      if (invalidate === 'all') await qc.invalidateQueries()
      else await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })))
      if (opts.success) notify(opts.success, { icon: opts.icon ?? 'check' })
    },
    onError: (e) => {
      console.error(e)
      // Solo si la pantalla no muestra su propio error
      if (opts.success) notify(i18n.t('errors.saveFailed'), { icon: 'alert' })
    },
  })
}
