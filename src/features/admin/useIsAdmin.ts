import { useQuery } from '@tanstack/react-query'
import { useRepo } from '../../data/RepoProvider'

/** ¿La persona con sesión es administradora? (lo decide el servidor) */
export function useIsAdmin() {
  const repo = useRepo()
  const q = useQuery({ queryKey: ['isAdmin'], queryFn: () => repo.isAdmin(), staleTime: 30 * 60_000, retry: false })
  return q.data === true
}
