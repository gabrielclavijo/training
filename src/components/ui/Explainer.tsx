import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from './Icon'

/**
 * Explicación breve al inicio de una pantalla («¿Qué es…?»), con ícono y
 * puntos clave. Se puede contraer; recuerda la preferencia en este navegador.
 */
export function Explainer({ id, icon, title, children, points = [] }: { id: string; icon: IconName; title: string; children: ReactNode; points?: [IconName, string][] }) {
  const { t } = useTranslation()
  const key = `entreno.explainer.${id}`
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== 'closed'
    } catch {
      return true
    }
  })
  const toggle = () => {
    setOpen(!open)
    try {
      localStorage.setItem(key, open ? 'closed' : 'open')
    } catch {
      /* sin almacenamiento */
    }
  }
  return (
    <section className={`explainer${open ? '' : ' is-closed'}`} aria-label={title}>
      <button type="button" className="explainer-head" aria-expanded={open} onClick={toggle}>
        <span className="explainer-icon" aria-hidden="true">
          <Icon name={icon} />
        </span>
        <strong>{title}</strong>
        <span className="explainer-toggle">
          {open ? t('explainer.hide') : t('explainer.show')}
          <Icon name={open ? 'chevronUp' : 'chevronDown'} />
        </span>
      </button>
      {open && (
        <div className="explainer-body">
          <p>{children}</p>
          {points.length > 0 && (
            <ul className="explainer-points">
              {points.map(([ic, text], i) => (
                <li key={i} style={{ animationDelay: `${i * 60}ms` }}>
                  <span className="explainer-point-icon" aria-hidden="true">
                    <Icon name={ic} />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
