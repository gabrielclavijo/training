import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LoadBadge } from '../../components/ui/Badges'
import { BarChart, LineChart } from '../../components/ui/Charts'
import { EmptyState } from '../../components/ui/EmptyState'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { daysBetween, formatDate, formatLongDate } from '../../core/dates'
import type { LoadMethod } from '../../core/load'
import { formatNumber } from '../../core/units'
import { useFitness, useGoals } from '../../data/hooks'
import { ActivityRow } from '../activities/ActivitiesPage'
import { TodayCard } from '../plan/TodayCard'
import { RecommendationsCard } from '../recommendations/RecommendationsCard'

const dayLabel = (d: string) => formatDate(`${d}T12:00:00Z`).slice(0, 5)

export function tsbState(tsb: number) {
  if (tsb > 5) return 'tsbFresh'
  if (tsb >= -10) return 'tsbNeutral'
  if (tsb >= -30) return 'tsbTired'
  return 'tsbVeryTired'
}

export function HomePage() {
  const { t } = useTranslation()
  const { loaded, overview, isLoading, error, today } = useFitness()
  const goals = useGoals()

  if (isLoading) return <Page title={t('nav.home')}><Spinner /></Page>
  if (error) return <Page title={t('nav.home')}><Alert kind="error">{t('errors.generic')}</Alert></Page>

  const nextGoal = goals.data?.find((g) => g.status === 'active' && g.eventDate >= today)
  const pending = loaded?.filter((l) => l.load.method === 'none' && l.day >= daysAgo(today, 41)) ?? []

  return (
    <Page title={t('nav.home')}>
      <p className="muted capitalize-first">{formatLongDate(new Date())}</p>

      <TodayCard />

      <RecommendationsCard />

      {nextGoal && (
        <Link to={`/metas/${nextGoal.id}`} className="card card-link">
          <span className="muted">{t('fitness.nextGoal')}</span>
          <strong className="big-text">{nextGoal.name}</strong>
          <span>
            {t('fitness.daysLeft', { count: daysBetween(today, nextGoal.eventDate) })} · {formatDate(`${nextGoal.eventDate}T12:00:00Z`)}
          </span>
        </Link>
      )}

      {!loaded || loaded.length === 0 ? (
        <EmptyState icon="activity" title={t('empty.activities.title')} body={t('empty.activities.body')} actionLabel={t('empty.activities.action')} actionTo="/subir" />
      ) : (
        <>
          {pending.length > 0 && (
            <Alert kind="info">
              <Link to={`/actividades/${pending[0].activity.id}`}>{t('rpe.pending', { count: pending.length })}</Link>
            </Alert>
          )}
          <FitnessCards />
          {overview && overview.series.length > 1 && <Trend />}
          {overview && overview.weeks.length > 0 && <WeeklyLoad />}
          <section className="card" aria-labelledby="recent-h">
            <h2 id="recent-h">{t('fitness.recent')}</h2>
            <ul className="activity-list">
              {loaded.slice(0, 5).map((l) => (
                <ActivityRow key={l.activity.id} item={l} />
              ))}
            </ul>
            <Link to="/actividades">{t('activities.title')} →</Link>
          </section>
        </>
      )}
    </Page>
  )
}

function daysAgo(today: string, n: number) {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function FitnessCards() {
  const { t } = useTranslation()
  const { overview } = useFitness()
  const s = overview?.snapshot
  if (!overview || !s) return <Alert kind="info">{t('fitness.noData')}</Alert>
  const state = tsbState(s.tsb)
  return (
    <section aria-labelledby="fitness-h">
      <h2 id="fitness-h">{t('fitness.title')}</h2>
      {s.warming && <Alert kind="info">{t('fitness.warming', { days: s.historyDays })}</Alert>}
      <div className="metric-grid">
        <Metric label={t('fitness.ctl')} value={formatNumber(s.ctl)} help={t('fitness.ctlHelp')} />
        <Metric label={t('fitness.atl')} value={formatNumber(s.atl)} help={t('fitness.atlHelp')} />
        <Metric label={t('fitness.tsb')} value={formatNumber(s.tsb)} sub={t(`fitness.${state}`)} tone={state === 'tsbVeryTired' ? 'warning' : undefined} help={t('fitness.tsbHelp')} />
        <Metric
          label={t('fitness.ramp')}
          value={`${s.rampPerWeek > 0 ? '+' : ''}${formatNumber(s.rampPerWeek, 1)}`}
          unit={t('fitness.rampValue', { value: '' }).trim()}
          tone={s.rampPerWeek > 8 ? 'warning' : undefined}
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

function Metric({ label, value, help, sub, tone, unit }: { label: string; value: string; help: string; sub?: string; tone?: 'warning'; unit?: string }) {
  return (
    <div className={`metric card${tone ? ` metric-${tone}` : ''}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">
        {value}
        {unit && <span className="metric-unit"> {unit}</span>}
      </span>
      {sub && (
        <span className="metric-sub">
          {tone === 'warning' && '⚠ '}
          {sub}
        </span>
      )}
      <span className="metric-help">{help}</span>
    </div>
  )
}

function Trend() {
  const { t } = useTranslation()
  const { overview } = useFitness()
  const series = overview!.series.slice(-90)
  const last = series[series.length - 1]
  return (
    <section className="card">
      <LineChart
        title={t('fitness.trendTitle')}
        summary={t('fitness.trendSummary', {
          ctl: formatNumber(last.ctl),
          atl: formatNumber(last.atl),
          tsb: formatNumber(last.tsb),
          ctlStart: formatNumber(series[0].ctl),
        })}
        labels={series.map((p) => p.day)}
        formatLabel={dayLabel}
        zeroLine
        series={[
          { name: t('fitness.ctlShort'), values: series.map((p) => p.ctl), className: 'line-ctl' },
          { name: t('fitness.atlShort'), values: series.map((p) => p.atl), className: 'line-atl', dash: '4 3' },
          { name: t('fitness.tsbShort'), values: series.map((p) => p.tsb), className: 'line-tsb', dash: '1 3' },
        ]}
      />
    </section>
  )
}

function WeeklyLoad() {
  const { t } = useTranslation()
  const { overview } = useFitness()
  const weeks = overview!.weeks.slice(-12)
  const last = weeks[weeks.length - 1]
  const jump = weeks.find((w, i) => i > 0 && w.changePct !== null && w.changePct > 30 && i >= weeks.length - 2)
  return (
    <section className="card" aria-labelledby="weekly-h">
      <h2 id="weekly-h">{t('fitness.weeklyLoad')}</h2>
      <p className="muted">{t('fitness.weeklyLoadHelp')}</p>
      {jump && (
        <Alert kind="warning">
          {t('fitness.weekOf', { date: dayLabel(jump.week) })}: +{formatNumber(jump.changePct!)} %
        </Alert>
      )}
      <BarChart
        title={t('fitness.weeklyLoad')}
        summary={`${t('fitness.weekOf', { date: dayLabel(last.week) })}: ${formatNumber(last.load)} ${t('fitness.load').toLowerCase()}${last.changePct !== null ? ` (${last.changePct > 0 ? '+' : ''}${formatNumber(last.changePct)} %)` : ''}`}
        periodHeader={t('fitness.date')}
        valueHeader={t('fitness.load')}
        data={weeks.map((w, i) => ({
          label: dayLabel(w.week),
          fullLabel: `${t('fitness.weekOf', { date: dayLabel(w.week) })}${w.changePct !== null ? ` (${t('fitness.change')}: ${w.changePct > 0 ? '+' : ''}${formatNumber(w.changePct)} %)` : ''}`,
          value: w.load,
          display: formatNumber(w.load),
          highlight: i === weeks.length - 1,
        }))}
      />
    </section>
  )
}
