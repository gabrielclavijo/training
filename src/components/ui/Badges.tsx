import { useTranslation } from 'react-i18next'
import type { Confidence, LoadMethod } from '../../core/load'

/** Método de cálculo + confianza, siempre en texto (no solo color). */
export function LoadBadge({ method, confidence }: { method: LoadMethod; confidence: Confidence | null }) {
  const { t } = useTranslation()
  return (
    <span className="badges">
      <span className={`badge badge-method badge-${method}`}>{t(`load.method.${method}`)}</span>
      {confidence && (
        <span className={`badge badge-conf-${confidence}`}>
          <span aria-hidden="true">{confidence === 'high' ? '●●●' : confidence === 'medium' ? '●●○' : '●○○'} </span>
          {t(`load.confidence.${confidence}`)}
        </span>
      )}
    </span>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'info' | 'warning' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
