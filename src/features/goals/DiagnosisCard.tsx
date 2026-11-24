import { TitleIcon } from '../../components/ui/Icon'
import { useTranslation } from 'react-i18next'
import { formatClock, formatNumber } from '../../core/units'
import { usePlan } from '../plan/usePlan'
import { LegalNotice } from '../plan/SessionView'

const ICON = { on_track: '✓', tight: '◐', behind: '⚠', past: '–' } as const

export function DiagnosisCard({ goalId }: { goalId: string }) {
  const { t } = useTranslation()
  const { derived } = usePlan()
  const d = derived?.diagnoses.find((x) => x.goalId === goalId)
  if (!d) return null
  const x = d.diagnosis
  if (x.status === 'past') return null
  return (
    <section className={`card diagnosis diagnosis-${x.status}`} aria-labelledby="diag-h">
      <h2 id="diag-h" className="card-title-icon">
        <TitleIcon name="gauge" />
        {t('diagnosis.title')}
      </h2>
      <p className="big-text">
        <span aria-hidden="true">{ICON[x.status]} </span>
        <strong>{t(`diagnosis.status.${x.status}`)}</strong>
      </p>
      <p>{t(`diagnosis.statusHelp.${x.status}`)}</p>
      <dl className="stat-grid">
        <div>
          <dt>{t('diagnosis.current')}</dt>
          <dd>{formatNumber(x.currentCtl)}</dd>
        </div>
        <div>
          <dt>{t('diagnosis.projected')}</dt>
          <dd>{formatNumber(x.projectedCtl)}</dd>
        </div>
        <div>
          <dt>{t('diagnosis.target')}</dt>
          <dd>{formatNumber(x.targetCtl)}</dd>
        </div>
      </dl>
      <p className="muted">{t('diagnosis.explain')}</p>
      {x.limitedBy && <p>{t(`diagnosis.limitedBy.${x.limitedBy}`)}</p>}
      {x.lowHistory && <p className="notice-estimate">{t('diagnosis.lowHistory')}</p>}
      {d.targetTimeS !== null && (
        <div className="callout">
          <h3>{t('diagnosis.estimate')}</h3>
          <p>{t('diagnosis.targetTime', { time: formatClock(d.targetTimeS) })}</p>
          {d.estimate ? (
            <>
              <p>
                <strong>
                  {t('diagnosis.estimateValue', {
                    time: formatClock(d.estimate.seconds),
                    from: formatClock(d.estimate.rangeS[0]),
                    to: formatClock(d.estimate.rangeS[1]),
                  })}
                </strong>
              </p>
              {d.timeStatus && <p>{t(`diagnosis.timeStatus.${d.timeStatus}`)}</p>}
              <p className="notice-estimate">{t('diagnosis.estimateBasis', { count: d.estimate.basedOn })}</p>
            </>
          ) : (
            <p className="muted">{t('diagnosis.noEstimate')}</p>
          )}
        </div>
      )}
      <ul>
        {x.suggestions.map((s) => (
          <li key={s}>{t(`diagnosis.suggestions.${s}`)}</li>
        ))}
      </ul>
      <LegalNotice />
    </section>
  )
}
