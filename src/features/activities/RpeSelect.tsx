import { useId } from 'react'
import { useTranslation } from 'react-i18next'

/** Escala de esfuerzo percibido 1–10 con descripción de cada valor. */
export function RpeSelect({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>
        {t('rpe.label')} <span className="muted">({t('common.optional')})</span>
      </label>
      <span id={`${id}-h`} className="hint">
        {t('rpe.help')}
      </span>
      <select id={id} value={value ?? ''} aria-describedby={`${id}-h`} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">—</option>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {t(`rpe.scale.${n}`)}
          </option>
        ))}
      </select>
    </div>
  )
}
