import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
const STORAGE_KEY = 'entreno.theme'

interface ThemeContextValue {
  preference: ThemePreference
  resolved: 'light' | 'dark'
  setPreference: (p: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* almacenamiento no disponible: usamos el sistema */
  }
  return 'system'
}

function systemPrefersDark() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Tema claro / oscuro / según el sistema.
 * Se guarda en el navegador para pintar rápido y, cuando hay sesión, también en el
 * perfil (ver `onPersist`) para que la preferencia viaje entre dispositivos.
 */
export function ThemeProvider({
  children,
  onPersist,
}: {
  children: ReactNode
  onPersist?: (p: ThemePreference) => void
}) {
  const [preference, setPref] = useState<ThemePreference>(readStored)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved: 'light' | 'dark' = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])

  const setPreference = useCallback(
    (p: ThemePreference) => {
      setPref(p)
      try {
        localStorage.setItem(STORAGE_KEY, p)
      } catch {
        /* sin almacenamiento local */
      }
      onPersist?.(p)
    },
    [onPersist],
  )

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider')
  return ctx
}

/** Aplica una preferencia que llega del perfil guardado en la base de datos. */
export function useSyncThemeFromProfile(profileTheme: ThemePreference | null | undefined) {
  const { preference, setPreference } = useTheme()
  useEffect(() => {
    if (profileTheme && profileTheme !== preference) setPreference(profileTheme)
    // Solo cuando cambia lo guardado en el perfil
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileTheme])
}
