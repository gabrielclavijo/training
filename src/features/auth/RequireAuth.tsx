import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Spinner } from '../../components/ui/Page'
import { useAuth } from './AuthProvider'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, recovering } = useAuth()
  const location = useLocation()
  const { t } = useTranslation()

  if (loading) {
    return (
      <main className="auth-page">
        <Spinner label={t('auth.finishing')} />
      </main>
    )
  }
  if (recovering && location.pathname !== '/cambiar-clave') return <Navigate to="/cambiar-clave" replace />
  if (!user) return <Navigate to="/ingresar" replace state={{ from: location.pathname }} />
  return <>{children}</>
}
