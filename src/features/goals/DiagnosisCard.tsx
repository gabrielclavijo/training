import { Icon, TitleIcon } from '../../components/ui/Icon'
import { useTranslation } from 'react-i18next'
import { ArcGauge, Progress, Semaphore } from '../../components/ui/Status'
import { formatClock, formatNumber } from '../../core/units'
import { usePlan } from '../plan/usePlan'
import { LegalNotice } from '../plan/SessionView'

const LEVEL = { on_track: 'good', tight: 'caution', behind: 'alert', past: 'good' } as const

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
      <p>
        <Semaphore level={LEVEL[x.status]} label={t(`diagnosis.status.${x.status}`)} />
      </p>
      <p>{t(`diagnosis.statusHelp.${x.status}`)}</p>
      {x.targetCtl > 0 && (
        <ArcGauge
          scale={{
            min: 0,
            max: x.targetCtl * 1.25,
            zones: [
              { to: x.targetCtl * 0.6, level: 'alert' },
              { to: x.targetCtl * 0.9, level: 'caution' },
              { to: x.targetCtl * 1.25, level: 'good' },
            ],
          }}
          value={x.projectedCtl}
          label={t('diagnosis.gaugeLabel', { projected: formatNumber(x.projectedCtl), target: formatNumber(x.targetCtl) })}
        >
          <p className="form-state num">{Math.round((x.projectedCtl / x.targetCtl) * 100)} %</p>
          <p className="form-value">{t('diagnosis.gaugeCaption')}</p>
        </ArcGauge>
      )}
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
      <Progress
        pct={x.targetCtl > 0 ? (x.currentCtl / x.targetCtl) * 100 : 0}
        level={LEVEL[x.status]}
        label={t('fitness.goalProgress', {
          current: formatNumber(x.currentCtl),
          target: formatNumber(x.targetCtl),
          pct: x.targetCtl > 0 ? Math.round((x.currentCtl / x.targetCtl) * 100) : 0,
          projected: formatNumber(x.projectedCtl),
        })}
        marks={[{ pct: x.targetCtl > 0 ? (x.projectedCtl / x.targetCtl) * 100 : 0, label: t('fitness.goalFormProjected') }]}
      />
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
      <ul className="step-chips">
        {x.suggestions.map((s) => (
          <li key={s}>
            <Icon name="bulb" /> {t(`diagnosis.suggestions.${s}`)}
          </li>
        ))}
      </ul>
      <LegalNotice />
    </section>
  )
}
