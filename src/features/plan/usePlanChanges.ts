import { useQuery } from '@tanstack/react-query'
import { useRepo } from '../../data/RepoProvider'

export function usePlanChanges() {
  const repo = useRepo()
  return useQuery({ queryKey: ['plan', 'changes'], queryFn: () => repo.listPlanChanges(30) })
}
