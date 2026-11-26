import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

/**
 * Sesión de la persona.
 *  - mode 'supabase': cuenta real (Google o correo).
 *  - mode 'local': «modo local de prueba», solo disponible mientras la app no tenga
 *    Supabase configurado. Los datos quedan únicamente en este navegador.
 */
export interface AppUser {
  id: string
  email: string | null
}

interface AuthState {
  user: AppUser | null
  mode: 'supabase' | 'local' | null
  loading: boolean
  recovering: boolean
  localModeAvailable: boolean
  enterLocalMode: () => void
  clearRecovering: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)
const LOCAL_FLAG = 'entreno.localMode'
const LOCAL_USER: AppUser = { id: 'local', email: null }

const localModeAvailable = !isSupabaseConfigured
function readLocalFlag() {
  if (!localModeAvailable) return false
  if (import.meta.env.DEV && import.meta.env.VITE_FAKE_AUTH === '1') return true
  try {
    return localStorage.getItem(LOCAL_FLAG) === '1'
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [local, setLocal] = useState(readLocalFlag)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
      cleanAuthParamsFromUrl()
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(() => {
    const user: AppUser | null = session ? { id: session.user.id, email: session.user.email ?? null } : local ? LOCAL_USER : null
    return {
      user,
      mode: session ? 'supabase' : local ? 'local' : null,
      loading,
      recovering,
      localModeAvailable,
      enterLocalMode: () => {
        try {
          localStorage.setItem(LOCAL_FLAG, '1')
        } catch {
          /* sin almacenamiento: dura mientras la pestaña esté abierta */
        }
        setLocal(true)
      },
      clearRecovering: () => setRecovering(false),
      signOut: async () => {
        if (session) await supabase?.auth.signOut()
        try {
          localStorage.removeItem(LOCAL_FLAG)
        } catch {
          /* nada */
        }
        setLocal(false)
      },
    }
  }, [session, local, loading, recovering])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

function cleanAuthParamsFromUrl() {
  const u = new URL(window.location.href)
  if (u.searchParams.has('code') || u.searchParams.has('error_description')) {
    for (const k of ['code', 'error', 'error_code', 'error_description']) u.searchParams.delete(k)
    window.history.replaceState(null, '', u.toString())
  }
}
