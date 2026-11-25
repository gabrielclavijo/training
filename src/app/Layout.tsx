import { useEffect, useState } from 'react'
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../components/ui/Icon'
import { Avatar } from '../components/ui/Avatar'
import { HeaderTitle } from '../components/ui/Page'
import { Sheet } from '../components/fx/Sheet'
import { ToastProvider } from '../components/fx/Toast'
import { haptic } from '../components/fx/motion'
import { useAuth } from '../features/auth/AuthProvider'
import { useStravaAutoSync } from '../features/strava/useStravaAutoSync'
import { useUsageHeartbeat } from '../features/admin/useUsageHeartbeat'
import { useIsAdmin } from '../features/admin/useIsAdmin'
import { RecommendationsCard, useVisibleRecs } from '../features/recommendations/RecommendationsCard'
import { useProfile } from '../data/hooks'

interface NavItem {
  to: string
  label: string
  icon: IconName
}

// Celular: menú flotante (4 secciones + botón central «+»). Escritorio: barra lateral.
const BOTTOM: NavItem[] = [
  { to: '/', label: 'nav.home', icon: 'home' },
  { to: '/plan', label: 'nav.plan', icon: 'plan' },
  { to: '/actividades', label: 'nav.activities', icon: 'activity' },
  { to: '/metas', label: 'nav.goals', icon: 'goal' },
]

export const SECONDARY: NavItem[] = [
  { to: '/nutricion', label: 'nav.nutrition', icon: 'food' },
  { to: '/laboratorio', label: 'nav.labs', icon: 'lab' },
  { to: '/metricas', label: 'nav.metrics', icon: 'chart' },
  { to: '/temporada', label: 'nav.season', icon: 'calendar' },
  { to: '/importacion', label: 'nav.import', icon: 'import' },
  { to: '/ayuda', label: 'nav.guides', icon: 'help' },
  { to: '/perfil', label: 'nav.profile', icon: 'user' },
  { to: '/ajustes', label: 'nav.settings', icon: 'settings' },
  { to: '/glosario', label: 'nav.glossary', icon: 'book' },
  { to: '/privacidad', label: 'nav.privacy', icon: 'shield' },
]

export const ADMIN_ITEM: NavItem = { to: '/admin', label: 'nav.admin', icon: 'gauge' }

/** Grupos del menú ☰ */
const GROUPS: { key: string; items: string[] }[] = [
  { key: 'train', items: ['/', '/plan', '/actividades', '/metas', '/temporada', '/metricas', '/importacion'] },
  { key: 'body', items: ['/nutricion', '/laboratorio', '/perfil'] },
  { key: 'app', items: ['/ajustes', '/ayuda', '/glosario', '/privacidad', '/admin'] },
]

const QUICK: { key: string; icon: IconName; to: string; state?: Record<string, unknown> }[] = [
  { key: 'upload', icon: 'upload', to: '/subir' },
  { key: 'manual', icon: 'edit', to: '/actividades/nueva' },
  { key: 'checkin', icon: 'heart', to: '/', state: { checkin: true } },
  { key: 'pause', icon: 'pause', to: '/temporada', state: { newPause: true } },
  { key: 'menu', icon: 'food', to: '/nutricion' },
]

const ALL: NavItem[] = [...BOTTOM, ...SECONDARY, ADMIN_ITEM]

const isActive = (to: string, path: string) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`))

/** Nombre de la sección actual para el encabezado */
function sectionOf(path: string) {
  return [...ALL].sort((a, b) => b.to.length - a.to.length).find((i) => isActive(i.to, path))
}

export function Layout() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  )
}

type Open = null | 'menu' | 'quick' | 'bell'

function Shell() {
  const { t } = useTranslation()
  const { mode } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const profile = useProfile()
  useStravaAutoSync()
  useUsageHeartbeat()
  const admin = useIsAdmin()
  const [open, setOpen] = useState<Open>(null)
  const [pageTitle, setPageTitle] = useState<string | null>(null)
  const path = location.pathname
  const ready = Boolean(profile.data?.onboardingDone)

  // Al cambiar de página se cierra cualquier panel
  useEffect(() => setOpen(null), [path])

  const SIDEBAR: NavItem[] = [...BOTTOM, ...SECONDARY, ...(admin ? [ADMIN_ITEM] : [])]
  const section = sectionOf(path)
  const name = profile.data?.displayName?.split(' ')[0]
  const activeIndex = BOTTOM.findIndex((i) => isActive(i.to, path))

  const go = (q: (typeof QUICK)[number]) => {
    haptic()
    setOpen(null)
    navigate(q.to, { state: q.state })
  }

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
        <button type="button" className="icon-btn menu-btn" aria-haspopup="dialog" aria-expanded={open === 'menu'} onClick={() => setOpen('menu')}>
          <Icon name="menu" />
          <span className="visually-hidden">{t('nav.openMenu')}</span>
        </button>
        <Link to="/" className="brand brand-desktop">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} />
          {t('app.name')}
        </Link>
        <p className="topbar-title" key={path === '/' ? 'home' : (pageTitle ?? section?.to)}>
          {path === '/' ? (name ? t('nav.hello', { name }) : t('nav.helloAnon')) : (pageTitle ?? (section ? t(section.label) : t('app.name')))}
        </p>
        <div className="topbar-actions">
          {ready && <BellButton open={open === 'bell'} onOpen={() => setOpen('bell')} />}
          <Link to="/perfil" className="topbar-avatar">
            <Avatar size={40} />
            <span className="visually-hidden">{t('nav.profile')}</span>
          </Link>
        </div>
      </header>

      <nav className="sidebar" aria-label={t('nav.label')}>
        <button type="button" className="btn btn-primary btn-block sidebar-quick" aria-haspopup="dialog" onClick={() => setOpen('quick')}>
          <Icon name="plus" /> {t('nav.quick')}
        </button>
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
        {/* Cada pantalla entra con una animación suave (se desactiva con «reducir movimiento») */}
        <div className="page-enter" key={path}>
          <HeaderTitle.Provider value={setPageTitle}>
            <Outlet />
          </HeaderTitle.Provider>
        </div>
      </main>

      <nav
        className="bottom-nav"
        aria-label={t('nav.label')}
        style={{ ['--i' as string]: activeIndex < 2 ? activeIndex : activeIndex + 1 }}
        data-active={activeIndex >= 0 ? 'yes' : 'no'}
      >
        <span className="nav-indicator" aria-hidden="true" />
        <ul>
          {BOTTOM.slice(0, 2).map((i) => (
            <BottomItem key={i.to} item={i} />
          ))}
          <li className="nav-plus-slot">
            <button
              type="button"
              className={`nav-plus${open === 'quick' ? ' is-open' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={open === 'quick'}
              onClick={() => {
                haptic()
                setOpen(open === 'quick' ? null : 'quick')
              }}
            >
              <Icon name="plus" />
              <span className="visually-hidden">{t(open === 'quick' ? 'nav.closeQuick' : 'nav.openQuick')}</span>
            </button>
          </li>
          {BOTTOM.slice(2).map((i) => (
            <BottomItem key={i.to} item={i} />
          ))}
        </ul>
      </nav>

      <Sheet open={open === 'menu'} onClose={() => setOpen(null)} side="left" label={t('nav.menuTitle')}>
        <div className="drawer-head">
          <Link to="/" className="brand">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} />
            {t('app.name')}
          </Link>
          <button type="button" className="icon-btn" onClick={() => setOpen(null)}>
            <Icon name="close" />
            <span className="visually-hidden">{t('nav.closeMenu')}</span>
          </button>
        </div>
        <Link to="/perfil" className="drawer-me">
          <Avatar size={48} />
          <span>
            <strong>{profile.data?.displayName || t('nav.profile')}</strong>
            <span className="muted">{t('nav.profile')}</span>
          </span>
        </Link>
        {GROUPS.map((g) => {
          const items = g.items.map((to) => ALL.find((i) => i.to === to)!).filter((i) => i.to !== '/admin' || admin)
          return (
            <section key={g.key} className="drawer-group" aria-labelledby={`dg-${g.key}`}>
              <h2 id={`dg-${g.key}`} className="drawer-group-title">
                {t(`nav.groups.${g.key}`)}
              </h2>
              <ul>
                {items.map((i, n) => (
                  <li key={i.to} style={{ animationDelay: `${60 + n * 25}ms` }}>
                    <NavLink to={i.to} end={i.to === '/'}>
                      <span className="drawer-icon" aria-hidden="true">
                        <Icon name={i.icon} />
                      </span>
                      {t(i.label)}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </Sheet>

      <Sheet open={open === 'quick'} onClose={() => setOpen(null)} side="bottom" label={t('nav.quickTitle')}>
        <h2 className="sheet-head">{t('nav.quickTitle')}</h2>
        <ul className="quick-list">
          {QUICK.map((q, n) => (
            <li key={q.key} style={{ animationDelay: `${40 + n * 45}ms` }}>
              <button type="button" className={`quick-item quick-${q.key}`} onClick={() => go(q)}>
                <span className="quick-icon" aria-hidden="true">
                  <Icon name={q.icon} />
                </span>
                <span>
                  <strong>{t(`nav.actions.${q.key}`)}</strong>
                  <span className="muted">{t(`nav.actions.${q.key}Hint`)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      {ready && (
        <Sheet open={open === 'bell'} onClose={() => setOpen(null)} side="bottom" label={t('nav.bell')}>
          <h2 className="sheet-head">{t('nav.bell')}</h2>
          <RecommendationsCard bare />
        </Sheet>
      )}
    </div>
  )
}

function BottomItem({ item }: { item: NavItem }) {
  const { t } = useTranslation()
  return (
    <li>
      <NavLink to={item.to} end={item.to === '/'}>
        <span className="nav-icon">
          <Icon name={item.icon} />
        </span>
        <span className="nav-label">{t(item.label)}</span>
      </NavLink>
    </li>
  )
}

const SEEN_KEY = 'entreno.recsSeen'

/** Campana con el número de recomendaciones; se mueve cuando llega una nueva. */
function BellButton({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const { t } = useTranslation()
  const { shown } = useVisibleRecs()
  const keys = (shown ?? []).map((r) => r.key)
  const [seen, setSeen] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
    } catch {
      return []
    }
  })
  const fresh = keys.some((k) => !seen.includes(k))
  useEffect(() => {
    if (!open || !shown) return
    setSeen(keys)
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(keys))
    } catch {
      /* sin almacenamiento */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, keys.join()])
  const count = keys.length
  return (
    <button type="button" className={`icon-btn bell-btn${fresh ? ' is-fresh' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={onOpen}>
      <Icon name="bell" />
      {count > 0 && (
        <span className="bell-count" key={count} aria-hidden="true">
          {count}
        </span>
      )}
      <span className="visually-hidden">
        {t('nav.bell')}
        {count > 0 ? `: ${t('nav.bellCount', { count })}${fresh ? ` ${t('nav.bellNew')}` : ''}` : ''}
      </span>
    </button>
  )
}
