import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAuth } from '../features/auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { MemoryRepo } from './memoryRepo'
import type { Repo } from './repo'
import { SupabaseRepo } from './supabaseRepo'

const RepoContext = createContext<Repo | null>(null)

export function RepoProvider({ children, repo }: { children: ReactNode; repo?: Repo }) {
  const { user, mode } = useAuth()
  const value = useMemo<Repo | null>(() => {
    if (repo) return repo
    if (!user) return null
    if (mode === 'supabase' && supabase) return new SupabaseRepo(supabase, user.id)
    return new MemoryRepo({ storageKey: 'entreno.localData' })
  }, [repo, user, mode])
  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>
}

export function useRepo(): Repo {
  const r = useContext(RepoContext)
  if (!r) throw new Error('No hay sesión activa')
  return r
}
