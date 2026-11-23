import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { Spinner } from '../components/ui/Page'
import { useProfile } from '../data/hooks'
import { RepoProvider } from '../data/RepoProvider'
import { LoginPage } from '../features/auth/LoginPage'
import { RequireAuth } from '../features/auth/RequireAuth'
import { NotFoundPage } from '../features/common/Placeholder'
import { HomePage } from '../features/dashboard/HomePage'
import { PrivacyPage } from '../features/legal/PrivacyPage'
import { Layout } from './Layout'
import { useSyncThemeFromProfile } from './theme'

// Pantallas cargadas bajo demanda para que la primera carga en celular sea liviana
const lazyPage = <T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await loader())[name] as React.ComponentType }))

const ActivitiesPage = lazyPage(() => import('../features/activities/ActivitiesPage'), 'ActivitiesPage')
const ActivityDetailPage = lazyPage(() => import('../features/activities/ActivityDetailPage'), 'ActivityDetailPage')
const ManualActivityPage = lazyPage(() => import('../features/activities/ManualActivityPage'), 'ManualActivityPage')
const UploadPage = lazyPage(() => import('../features/upload/UploadPage'), 'UploadPage')
const GoalsPage = lazyPage(() => import('../features/goals/GoalsPage'), 'GoalsPage')
const GoalFormPage = lazyPage(() => import('../features/goals/GoalFormPage'), 'GoalFormPage')
const GoalDetailPage = lazyPage(() => import('../features/goals/GoalDetailPage'), 'GoalDetailPage')
const SeasonPage = lazyPage(() => import('../features/season/SeasonPage'), 'SeasonPage')
const MetricsPage = lazyPage(() => import('../features/metrics/MetricsPage'), 'MetricsPage')
const ImportPage = lazyPage(() => import('../features/import/ImportPage'), 'ImportPage')
const GuidesPage = lazyPage(() => import('../features/guides/GuidesPage'), 'GuidesPage')
const GlossaryPage = lazyPage(() => import('../features/glossary/GlossaryPage'), 'GlossaryPage')
const ProfilePage = lazyPage(() => import('../features/profile/ProfilePage'), 'ProfilePage')
const SettingsPage = lazyPage(() => import('../features/settings/SettingsPage'), 'SettingsPage')
const MorePage = lazyPage(() => import('../features/settings/MorePage'), 'MorePage')
const OnboardingPage = lazyPage(() => import('../features/onboarding/OnboardingPage'), 'OnboardingPage')
const UpdatePasswordPage = lazyPage(() => import('../features/auth/UpdatePasswordPage'), 'UpdatePasswordPage')

/** Si la persona no terminó el onboarding, la lleva ahí (salvo a páginas de ayuda). */
function OnboardingGate({ children }: { children: ReactNode }) {
  const profile = useProfile()
  const location = useLocation()
  useSyncThemeFromProfile(profile.data?.theme)
  if (profile.isLoading) return <Spinner />
  const free = ['/bienvenida', '/guias', '/privacidad', '/subir', '/metas/nueva', '/cambiar-clave', '/ajustes']
  if (profile.data && !profile.data.onboardingDone && !free.includes(location.pathname)) {
    return <Navigate to="/bienvenida" replace />
  }
  return <>{children}</>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/ingresar" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <RepoProvider>
              <OnboardingGate>
                <Layout />
              </OnboardingGate>
            </RepoProvider>
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="bienvenida" element={<S><OnboardingPage /></S>} />
        <Route path="actividades" element={<S><ActivitiesPage /></S>} />
        <Route path="actividades/nueva" element={<S><ManualActivityPage /></S>} />
        <Route path="actividades/:id" element={<S><ActivityDetailPage /></S>} />
        <Route path="subir" element={<S><UploadPage /></S>} />
        <Route path="metas" element={<S><GoalsPage /></S>} />
        <Route path="metas/nueva" element={<S><GoalFormPage /></S>} />
        <Route path="metas/:id" element={<S><GoalDetailPage /></S>} />
        <Route path="metas/:id/editar" element={<S><GoalFormPage /></S>} />
        <Route path="temporada" element={<S><SeasonPage /></S>} />
        <Route path="metricas" element={<S><MetricsPage /></S>} />
        <Route path="importacion" element={<S><ImportPage /></S>} />
        <Route path="guias" element={<S><GuidesPage /></S>} />
        <Route path="perfil" element={<S><ProfilePage /></S>} />
        <Route path="glosario" element={<S><GlossaryPage /></S>} />
        <Route path="ajustes" element={<S><SettingsPage /></S>} />
        <Route path="mas" element={<S><MorePage /></S>} />
        <Route path="cambiar-clave" element={<S><UpdatePasswordPage /></S>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      {/* La política se puede leer sin cuenta */}
      <Route path="/privacidad" element={<PublicShell />} />
    </Routes>
  )
}

function S({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Spinner />}>{children}</Suspense>
}

function PublicShell() {
  return (
    <main className="main" id="contenido">
      <PrivacyPage />
    </main>
  )
}
