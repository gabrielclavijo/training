import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'

/** El encabezado muestra el título de la página; el <h1> queda para lectores de pantalla. */
export const HeaderTitle = createContext<((title: string | null) => void) | null>(null)
import { useTranslation } from 'react-i18next'

/**
 * Encabezado de página: actualiza el título de la pestaña y mueve el foco al
 * <h1> al cambiar de ruta, para que los lectores de pantalla anuncien la página.
 */
export function Page({
  title,
  children,
  actions,
  hideTitle = false,
  headerTitle,
}: {
  title: string
  children: ReactNode
  actions?: ReactNode
  hideTitle?: boolean
  /** Texto del encabezado si debe ser distinto del título (p. ej. la sección) */
  headerTitle?: string
}) {
  const { t } = useTranslation()
  const h1 = useRef<HTMLHeadingElement>(null)
  const setHeader = useContext(HeaderTitle)
  if (setHeader) hideTitle = true
  const shown = headerTitle ?? title
  useEffect(() => {
    setHeader?.(shown)
  }, [setHeader, shown])
  useEffect(() => () => setHeader?.(null), [setHeader])

  useEffect(() => {
    document.title = `${title} · ${t('app.name')}`
    h1.current?.focus()
  }, [title, t])

  return (
    <>
      <div className={hideTitle ? 'page-head page-head-quiet' : 'row page-head'} style={hideTitle ? undefined : { justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <h1 ref={h1} tabIndex={-1} className={hideTitle ? 'visually-hidden' : undefined} style={{ margin: 0 }}>
          {title}
        </h1>
        {actions}
      </div>
      {children}
    </>
  )
}

/**
 * Indicador de carga: barras animadas + texto. Con `full`, además, tarjetas
 * «fantasma» que anticipan el contenido (para cargas de pantalla completa).
 */
export function Spinner({ label, full = false }: { label?: string; full?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="loader" role="status" aria-live="polite">
      <p className="loader-row">
        <span className="loader-bars" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="muted">{label ?? t('common.loading')}</span>
      </p>
      {full && (
        <div className="skeleton-stack" aria-hidden="true">
          <div className="skeleton skeleton-hero" />
          <div className="skeleton-grid">
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
          </div>
          <div className="skeleton skeleton-card" />
        </div>
      )}
    </div>
  )
}

export function Alert({
  kind,
  children,
}: {
  kind: 'error' | 'warning' | 'success' | 'info'
  children: ReactNode
}) {
  // El tipo de alerta se indica con texto e ícono de borde, no solo con color.
  const role = kind === 'error' ? 'alert' : 'status'
  const prefix = { error: 'Error: ', warning: 'Atención: ', success: '', info: '' }[kind]
  return (
    <div className={`alert alert-${kind}`} role={role}>
      {prefix && <strong>{prefix}</strong>}
      {children}
    </div>
  )
}
