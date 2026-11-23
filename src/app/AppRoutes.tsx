import { Route, Routes } from 'react-router'
import { LoginPage } from '../features/auth/LoginPage'
import { RequireAuth } from '../features/auth/RequireAuth'
import { UpdatePasswordPage } from '../features/auth/UpdatePasswordPage'
import { NotFoundPage, Placeholder } from '../features/common/Placeholder'
import { HomePage } from '../features/dashboard/HomePage'
import { PrivacyPage } from '../features/legal/PrivacyPage'
import { MorePage } from '../features/settings/MorePage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { Layout } from './Layout'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/ingresar" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="actividades" element={<Placeholder titleKey="nav.activities" />} />
        <Route path="subir" element={<Placeholder titleKey="nav.upload" />} />
        <Route path="metas" element={<Placeholder titleKey="nav.goals" />} />
        <Route path="temporada" element={<Placeholder titleKey="nav.season" />} />
        <Route path="metricas" element={<Placeholder titleKey="nav.metrics" />} />
        <Route path="importacion" element={<Placeholder titleKey="nav.import" />} />
        <Route path="guias" element={<Placeholder titleKey="nav.guides" />} />
        <Route path="perfil" element={<Placeholder titleKey="nav.profile" />} />
        <Route path="glosario" element={<Placeholder titleKey="nav.glossary" />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="mas" element={<MorePage />} />
        <Route path="cambiar-clave" element={<UpdatePasswordPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      {/* La política se puede leer sin cuenta */}
      <Route path="/privacidad" element={<PublicShell />} />
    </Routes>
  )
}

function PublicShell() {
  return (
    <main className="main" id="contenido">
      <PrivacyPage />
    </main>
  )
}
