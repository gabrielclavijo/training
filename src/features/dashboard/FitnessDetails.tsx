import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LoadBadge } from '../../components/ui/Badges'
import { Alert } from '../../components/ui/Page'
import { formatDate } from '../../core/dates'
import type { LoadMethod } from '../../core/load'
import { formatNumber } from '../../core/units'
import { fatigueStatus, fitnessVsBest, formStatus, rampStatus, type IndicatorStatus } from '../../core/fitness/status'
import { CountUp, Gauge, Semaphore } from '../../components/ui/Status'
import { useFitness } from '../../data/hooks'
import { Icon, type IconName } from '../../components/ui/Icon'

/** Detalle de los cuatro indicadores (semáforo, escala y explicación). */
export function FitnessCards() {
  const { t } = useTranslation()
  const { overview } = useFitness()
  const s = overview?.snapshot
  if (!overview || !s) return <Alert kind="info">{t('fitness.noData')}</Alert>
  const form = formStatus(s.tsb)
  const fat = fatigueStatus(s.atl, s.ctl)
  const ramp = rampStatus(s.rampPerWeek)
  const best = fitnessVsBest(s.ctl, overview.series)
  return (
    <section aria-labelledby="fitness-h">
      <h2 id="fitness-h" className="visually-hidden">
        {t('fitness.title')}
      </h2>
      {s.warming && <Alert kind="info">{t('fitness.warming', { days: s.historyDays })}</Alert>}
      <div className="metric-grid">
        <Metric
          icon="trend"
          label={t('fitness.ctl')}
          value={s.ctl}
          status={best}
          verdict={t(`fitness.verdict.${best.verdict}`)}
          detail={
            best.bestDay && best.best >= 10
              ? t('fitness.vsBest', { pct: best.pct, best: formatNumber(best.best), date: formatDate(`${best.bestDay}T12:00:00Z`) })
              : undefined
          }
          gaugeLabel={t('fitness.gaugeFitness', { value: formatNumber(s.ctl), pct: best.pct, best: formatNumber(best.best) })}
          gaugeTicks={[{ value: 100, label: t('fitness.bestTick') }]}
          help={t('fitness.ctlHelp')}
        />
        <Metric
          icon="bolt"
          tile="coral"
          label={t('fitness.atl')}
          value={s.atl}
          status={fat}
          verdict={t(`fitness.verdict.${fat.verdict}`, { pct: fat.ratio ? Math.round(fat.ratio * 100) : 0 })}
          gaugeLabel={t('fitness.gaugeFatigue', { value: formatNumber(s.atl), verdict: t(`fitness.level.${fat.level}`) })}
          help={t('fitness.atlHelp')}
        />
        <Metric
          icon="gauge"
          tile="sky"
          label={t('fitness.tsb')}
          value={s.tsb}
          status={form}
          verdict={t(`fitness.verdict.${form.verdict}`)}
          gaugeLabel={t('fitness.gaugeForm', { value: formatNumber(s.tsb), verdict: t(`fitness.level.${form.level}`) })}
          gaugeEnds={[t('fitness.scaleBad'), t('fitness.scaleGood')]}
          help={t('fitness.tsbHelp')}
        />
        <Metric
          icon="chart"
          tile="soft"
          label={t('fitness.ramp')}
          value={s.rampPerWeek}
          decimals={1}
          signed
          unit={t('fitness.rampValue', { value: '' }).trim()}
          status={ramp}
          verdict={t(`fitness.verdict.${ramp.verdict}`, { value: formatNumber(s.rampPerWeek, 1) })}
          gaugeLabel={t('fitness.gaugeRamp', { value: formatNumber(s.rampPerWeek, 1), verdict: t(`fitness.level.${ramp.level}`) })}
          help={t('fitness.rampHelp')}
        />
      </div>
      {overview.missingRecent > 0 && <Alert kind="warning">{t('fitness.missing', { count: overview.missingRecent })}</Alert>}
      <p className="muted">
        {t('fitness.methodsUsed')}:{' '}
        {(Object.entries(overview.methods) as [LoadMethod, number][]).map(([m, n], i) => (
          <span key={m}>
            {i > 0 && ' · '}
            <LoadBadge method={m} confidence={null} /> {n}
          </span>
        ))}
      </p>
      <p>
        <Link to="/glosario">{t('nav.glossary')}</Link>
      </p>
    </section>
  )
}

function Metric({
  label,
  value,
  decimals = 0,
  signed = false,
  unit,
  help,
  icon,
  tile,
  status,
  verdict,
  detail,
  gaugeLabel,
  gaugeTicks,
  gaugeEnds,
}: {
  label: string
  value: number
  decimals?: number
  signed?: boolean
  unit?: string
  help: string
  icon: IconName
  tile?: 'coral' | 'sky' | 'soft'
  status: IndicatorStatus
  verdict: string
  detail?: string
  gaugeLabel: string
  gaugeTicks?: { value: number; label: string }[]
  gaugeEnds?: [string, string]
}) {
  const { t } = useTranslation()
  const fmt = (n: number) => `${signed && n > 0 ? '+' : ''}${formatNumber(n, decimals)}`
  return (
    <div className={`metric card metric-${status.level}`}>
      <div className="row-between metric-head">
        <span className={`icon-tile${tile ? ` icon-tile-${tile}` : ''}`}>
          <Icon name={icon} />
        </span>
        <Semaphore level={status.level} label={t(`fitness.level.${status.level}`)} />
      </div>
      <span className="metric-value">
        <span aria-hidden="true">
          <CountUp value={value} format={fmt} />
        </span>
        <span className="visually-hidden">{fmt(value)}</span>
        {unit && <span className="metric-unit"> {unit}</span>}
      </span>
      <span className="metric-label">{label}</span>
      <p className={`metric-verdict verdict-${status.level}`}>{verdict}</p>
      {detail && <p className="metric-detail">{detail}</p>}
      <Gauge scale={status.scale} value={status.marker} label={gaugeLabel} ticks={gaugeTicks} />
      {gaugeEnds && (
        <span className="gauge-ends" aria-hidden="true">
          <span>{gaugeEnds[0]}</span>
          <span>{gaugeEnds[1]}</span>
        </span>
      )}
      <details className="metric-more">
        <summary>{t('fitness.whatIsIt')}</summary>
        <p className="metric-help">{help}</p>
      </details>
    </div>
  )
}

