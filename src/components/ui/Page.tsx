import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Encabezado de página: actualiza el título de la pestaña y mueve el foco al
 * <h1> al cambiar de ruta, para que los lectores de pantalla anuncien la página.
 */
export function Page({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const { t } = useTranslation()
  const h1 = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${title} · ${t('app.name')}`
    h1.current?.focus()
  }, [title, t])

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <h1 ref={h1} tabIndex={-1} style={{ margin: 0 }}>
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
