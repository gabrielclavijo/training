import { NavLink, Outlet, Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../components/ui/Icon'
import { Avatar } from '../components/ui/Avatar'
import { useAuth } from '../features/auth/AuthProvider'
import { useStravaAutoSync } from '../features/strava/useStravaAutoSync'

interface NavItem {
  to: string
  label: string
  icon: IconName
}

// Celular: 5 botones grandes abajo. Escritorio: todas las secciones a la izquierda.
const BOTTOM: NavItem[] = [
  { to: '/', label: 'nav.home', icon: 'home' },
  { to: '/plan', label: 'nav.plan', icon: 'plan' },
  { to: '/subir', label: 'nav.upload', icon: 'upload' },
  { to: '/actividades', label: 'nav.activities', icon: 'activity' },
  { to: '/mas', label: 'nav.more', icon: 'more' },
]

export const SECONDARY: NavItem[] = [
  { to: '/metas', label: 'nav.goals', icon: 'goal' },
  { to: '/nutricion', label: 'nav.nutrition', icon: 'food' },
  { to: '/laboratorio', label: 'nav.labs', icon: 'lab' },
  { to: '/metricas', label: 'nav.metrics', icon: 'chart' },
  { to: '/temporada', label: 'nav.season', icon: 'calendar' },
  { to: '/importacion', label: 'nav.import', icon: 'import' },
  { to: '/guias', label: 'nav.guides', icon: 'book' },
  { to: '/perfil', label: 'nav.profile', icon: 'user' },
  { to: '/ajustes', label: 'nav.settings', icon: 'settings' },
  { to: '/glosario', label: 'nav.glossary', icon: 'help' },
  { to: '/privacidad', label: 'nav.privacy', icon: 'shield' },
]

const SIDEBAR: NavItem[] = [...BOTTOM.filter((i) => i.to !== '/mas'), ...SECONDARY]

export function Layout() {
  const { t } = useTranslation()
  const { mode } = useAuth()
  useStravaAutoSync()
  return (
    <div className="layout">
      {/* Con HashRouter un enlace "#ancla" cambiaría de página: movemos el foco a mano */}
      <a
        className="skip-link"
        href="#contenido"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('contenido')?.focus()
        }}
      >
        {t('app.skipToContent')}
      </a>
      <header className="topbar">
        <Link to="/" className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} />
          {t('app.name')}
        </Link>
        <Link to="/perfil" className="topbar-avatar">
          <Avatar size={40} />
          <span className="visually-hidden">{t('nav.profile')}</span>
        </Link>
      </header>

      <nav className="sidebar" aria-label={t('nav.label')}>
        <ul>
          {SIDEBAR.map((i) => (
            <li key={i.to}>
              <NavLink to={i.to} end={i.to === '/'}>
                <Icon name={i.icon} />
                {t(i.label)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main className="main" id="contenido" tabIndex={-1}>
        {mode === 'local' && <p className="local-banner">{t('local.banner')}</p>}
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label={t('nav.label')}>
        <ul>
          {BOTTOM.map((i) => (
            <li key={i.to}>
              <NavLink to={i.to} end={i.to === '/'}>
                <span className="nav-icon">
                  <Icon name={i.icon} />
                </span>
                {t(i.label)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
