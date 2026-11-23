import type { Session, User } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  /** true cuando la persona llegó desde el enlace de "olvidé mi contraseña". */
  recovering: boolean
  clearRecovering: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

// Solo en desarrollo local (npm run dev con VITE_FAKE_AUTH=1): sesión ficticia para
// revisar pantallas y accesibilidad sin Supabase. Nunca existe en el build publicado.
const FAKE_SESSION: Session | null =
  import.meta.env.DEV && import.meta.env.VITE_FAKE_AUTH === '1'
    ? ({ user: { id: '00000000-0000-0000-0000-000000000000', email: 'demo@ejemplo.co' } } as unknown as Session)
    : null

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(FAKE_SESSION)
  const [loading, setLoading] = useState(Boolean(supabase) && !FAKE_SESSION)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!supabase || FAKE_SESSION) return
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

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recovering,
      clearRecovering: () => setRecovering(false),
      signOut: async () => {
        await supabase?.auth.signOut()
      },
    }),
    [session, loading, recovering],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

/** Quita ?code=… de la barra de direcciones después de iniciar sesión. */
function cleanAuthParamsFromUrl() {
  const u = new URL(window.location.href)
  if (u.searchParams.has('code') || u.searchParams.has('error_description')) {
    u.searchParams.delete('code')
    u.searchParams.delete('error')
    u.searchParams.delete('error_code')
    u.searchParams.delete('error_description')
    window.history.replaceState(null, '', u.toString())
  }
}
