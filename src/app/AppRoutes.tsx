import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { Spinner } from '../components/ui/Page'
import { useProfile } from '../data/hooks'
import { RepoProvider } from '../data/RepoProvider'
import { LoginPage } from '../features/auth/LoginPage'
import { RequireAuth } from '../features/auth/RequireAuth'
import { useAuth } from '../features/auth/AuthProvider'
import { NotFoundPage } from '../features/common/Placeholder'
import { HomePage } from '../features/dashboard/HomePage'
import { PrivacyPage } from '../features/legal/PrivacyPage'
import { Layout } from './Layout'

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
const PlanPage = lazyPage(() => import('../features/plan/PlanPage'), 'PlanPage')
const SessionDetailPage = lazyPage(() => import('../features/plan/SessionDetailPage'), 'SessionDetailPage')
const AvailabilityPage = lazyPage(() => import('../features/plan/AvailabilityPage'), 'AvailabilityPage')
const NutritionPage = lazyPage(() => import('../features/nutrition/NutritionPage'), 'NutritionPage')
const LabsPage = lazyPage(() => import('../features/labs/LabsPage'), 'LabsPage')
const AdminPage = lazyPage(() => import('../features/admin/AdminPage'), 'AdminPage')
const StravaCallbackPage = lazyPage(() => import('../features/strava/StravaCallbackPage'), 'StravaCallbackPage')
const UpdatePasswordPage = lazyPage(() => import('../features/auth/UpdatePasswordPage'), 'UpdatePasswordPage')

/** Si la persona no terminó el onboarding, la lleva ahí (salvo a páginas de ayuda). */
function OnboardingGate({ children }: { children: ReactNode }) {
  const profile = useProfile()
  const location = useLocation()
  if (profile.isLoading)
    return (
      <main className="main">
        <Spinner full />
      </main>
    )
  const free = ['/bienvenida', '/guias', '/ayuda', '/privacidad', '/subir', '/metas/nueva', '/cambiar-clave', '/ajustes', '/strava']
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
        <Route
          path="bienvenida"
          element={
            <S>
              <OnboardingPage />
            </S>
          }
        />
        <Route
          path="actividades"
          element={
            <S>
              <ActivitiesPage />
            </S>
          }
        />
        <Route
          path="actividades/nueva"
          element={
            <S>
              <ManualActivityPage />
            </S>
          }
        />
        <Route
          path="actividades/:id"
          element={
            <S>
              <ActivityDetailPage />
            </S>
          }
        />
        <Route
          path="subir"
          element={
            <S>
              <UploadPage />
            </S>
          }
        />
        <Route
          path="plan"
          element={
            <S>
              <PlanPage />
            </S>
          }
        />
        <Route
          path="plan/sesion/:id"
          element={
            <S>
              <SessionDetailPage />
            </S>
          }
        />
        <Route
          path="plan/disponibilidad"
          element={
            <S>
              <AvailabilityPage />
            </S>
          }
        />
        <Route
          path="strava"
          element={
            <S>
              <StravaCallbackPage />
            </S>
          }
        />
        <Route
          path="metas"
          element={
            <S>
              <GoalsPage />
            </S>
          }
        />
        <Route
          path="metas/nueva"
          element={
            <S>
              <GoalFormPage />
            </S>
          }
        />
        <Route
          path="metas/:id"
          element={
            <S>
              <GoalDetailPage />
            </S>
          }
        />
        <Route
          path="metas/:id/editar"
          element={
            <S>
              <GoalFormPage />
            </S>
          }
        />
        <Route
          path="nutricion"
          element={
            <S>
              <NutritionPage />
            </S>
          }
        />
        <Route
          path="laboratorio"
          element={
            <S>
              <LabsPage />
            </S>
          }
        />
        <Route
          path="admin"
          element={
            <S>
              <AdminPage />
            </S>
          }
        />
        <Route
          path="temporada"
          element={
            <S>
              <SeasonPage />
            </S>
          }
        />
        <Route
          path="metricas"
          element={
            <S>
              <MetricsPage />
            </S>
          }
        />
        <Route
          path="importacion"
          element={
            <S>
              <ImportPage />
            </S>
          }
        />
        <Route
          path="ayuda"
          element={
            <S>
              <GuidesPage />
            </S>
          }
        />
        <Route path="guias" element={<GuidesRedirect />} />
        <Route
          path="perfil"
          element={
            <S>
              <ProfilePage />
            </S>
          }
        />
        <Route
          path="glosario"
          element={
            <S>
              <GlossaryPage />
            </S>
          }
        />
        <Route
          path="ajustes"
          element={
            <S>
              <SettingsPage />
            </S>
          }
        />
        <Route
          path="mas"
          element={
            <S>
              <MorePage />
            </S>
          }
        />
        <Route
          path="cambiar-clave"
          element={
            <S>
              <UpdatePasswordPage />
            </S>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      {/* La política se puede leer sin cuenta */}
      <Route path="/privacidad" element={<PrivacyGate />}>
        <Route index element={<PrivacyPage />} />
      </Route>
    </Routes>
  )
}

/** La antigua dirección de Guías lleva a Ayuda (conserva el tema). */
function GuidesRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/ayuda${search}`} replace />
}

function S({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Spinner full />}>{children}</Suspense>
}

/** Con sesión, la política se ve dentro de la app (con su menú); sin sesión, sola. */
function PrivacyGate() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner full />
  if (user)
    return (
      <RepoProvider>
        <Layout />
      </RepoProvider>
    )
  return (
    <main className="main public-main" id="contenido">
      <Outlet />
    </main>
  )
}
