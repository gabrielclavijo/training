import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { BarChart, LineChart } from '../../components/ui/Charts'
import { EmptyState } from '../../components/ui/EmptyState'
import { Alert, Page } from '../../components/ui/Page'
import { daysBetween, formatDate, localDayKey, weekStart } from '../../core/dates'
import { formatClock, formatNumber } from '../../core/units'
import { CountUp, Progress, Semaphore } from '../../components/ui/Status'
import { useFitness, useGoals } from '../../data/hooks'
import { ActivityRow } from '../activities/ActivitiesPage'
import { usePlan } from '../plan/usePlan'
import { Icon, TitleIcon } from '../../components/ui/Icon'
import { RecommendationsCard } from '../recommendations/RecommendationsCard'
import { CheckinCard } from './CheckinCard'
import { FormGaugeCard, Greeting, HomeSkeleton, KpiTiles, PullToRefresh, WeekBar } from './HomeParts'

const dayLabel = (d: string) => formatDate(`${d}T12:00:00Z`).slice(0, 5)
const SHORT = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' })
/** «25 nov» */
export const shortDay = (d: string) => SHORT.format(new Date(`${d}T12:00:00Z`)).replace('.', '')

export function tsbState(tsb: number) {
  if (tsb > 5) return 'tsbFresh'
  if (tsb >= -10) return 'tsbNeutral'
  if (tsb >= -30) return 'tsbTired'
  return 'tsbVeryTired'
}

export function HomePage() {
  const { t } = useTranslation()
  const { loaded, overview, isLoading, error, today } = useFitness()

  if (isLoading)
    return (
      <Page title={t('nav.home')}>
        <HomeSkeleton />
      </Page>
    )
  if (error)
    return (
      <Page title={t('nav.home')}>
        <Alert kind="error">{t('errors.generic')}</Alert>
      </Page>
    )

  const pending = loaded?.filter((l) => l.load.method === 'none' && l.day >= daysAgo(today, 41)) ?? []
  const has = Boolean(loaded && loaded.length > 0)

  return (
    <Page title={t('nav.home')} hideTitle>
      <PullToRefresh />
      <Greeting />
      <CheckinCard />
      {has && overview?.snapshot && <FormGaugeCard />}
      {has && overview?.snapshot && <KpiTiles />}
      <WeekBar />
      <GoalOverview />
      {!has ? (
        <EmptyState
          icon="activity"
          title={t('empty.activities.title')}
          body={t('empty.activities.body')}
          actionLabel={t('empty.activities.action')}
          actionTo="/subir"
        />
      ) : (
        <>
          {pending.length > 0 && (
            <Alert kind="info">
              <Link to={`/actividades/${pending[0].activity.id}`}>{t('rpe.pending', { count: pending.length })}</Link>
            </Alert>
          )}
          {overview && overview.series.length > 1 && <Trend />}
          {overview && overview.weeks.length > 0 && <WeeklyLoad />}
          <RecommendationsCard />
          <section className="card" aria-labelledby="recent-h">
            <h2 id="recent-h" className="card-title-icon">
              <TitleIcon name="activity" tone="sky" />
              {t('fitness.recent')}
            </h2>
            <ul className="activity-list">
              {loaded!.slice(0, 5).map((l) => (
                <ActivityRow key={l.activity.id} item={l} />
              ))}
            </ul>
            <Link to="/actividades">{t('activities.title')} →</Link>
          </section>
        </>
      )}
      {!has && <RecommendationsCard />}
    </Page>
  )
}

function daysAgo(today: string, n: number) {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

const DIAG_LEVEL = { on_track: 'good', tight: 'caution', behind: 'alert', past: 'good' } as const

/** Resumen de la meta principal más cercana: semáforo del diagnóstico, forma hoy vs. recomendada y tiempo estimado. */
function GoalOverview() {
  const { t } = useTranslation()
  const goals = useGoals()
  const { derived } = usePlan()
  const today = localDayKey(new Date())
  const active = (goals.data ?? []).filter((g) => g.status === 'active' && g.eventDate >= today)
  if (active.length === 0) return null
  const goal = [...active].sort((a, b) => (a.priority === b.priority ? a.eventDate.localeCompare(b.eventDate) : a.priority === 'primary' ? -1 : 1))[0]
  const d = derived?.diagnoses.find((x) => x.goalId === goal.id)
  const days = daysBetween(today, goal.eventDate)
  const x = d?.diagnosis
  const level = x ? DIAG_LEVEL[x.status] : null
  const pct = x && x.targetCtl > 0 ? Math.round((x.currentCtl / x.targetCtl) * 100) : 0
  const projPct = x && x.targetCtl > 0 ? (x.projectedCtl / x.targetCtl) * 100 : 0
  return (
    <section className={`card goal-overview${level ? ` goal-${level}` : ''}`} aria-labelledby="goalov-h">
      <div className="row-between">
        <span className="eyebrow">
          <Icon name="flag" /> {t('fitness.goalTitle')}
        </span>
        {x && level && <Semaphore level={level} label={t(`diagnosis.status.${x.status}`)} />}
      </div>
      <h2 id="goalov-h" className="goal-ov-name">
        {goal.name}
      </h2>
      <p className="muted">
        {t('fitness.goalDays', { count: days })} · {formatDate(`${goal.eventDate}T12:00:00Z`)}
        {active.length > 1 && ` · ${t('fitness.goalOthers', { count: active.length - 1 })}`}
      </p>
      {x && (
        <>
          <p>{t(`diagnosis.statusHelp.${x.status}`)}</p>
          <dl className="goal-ov-stats">
            <div>
              <dt>{t('fitness.goalFormNow')}</dt>
              <dd className="num">
                <CountUp value={x.currentCtl} format={(n) => formatNumber(n)} />
              </dd>
            </div>
            <div>
              <dt>{t('fitness.goalFormProjected')}</dt>
              <dd className="num">
                <CountUp value={x.projectedCtl} format={(n) => formatNumber(n)} />
              </dd>
            </div>
            <div>
              <dt>{t('fitness.goalFormTarget')}</dt>
              <dd className="num">{formatNumber(x.targetCtl)}</dd>
            </div>
          </dl>
          <Progress
            pct={pct}
            level={level ?? 'good'}
            label={t('fitness.goalProgress', {
              current: formatNumber(x.currentCtl),
              target: formatNumber(x.targetCtl),
              pct,
              projected: formatNumber(x.projectedCtl),
            })}
            marks={[{ pct: projPct, label: t('fitness.goalFormProjected') }]}
          />
          {d?.estimate && d.targetTimeS !== null && (
            <p className="goal-ov-time">
              <Icon name="timer" /> {t('fitness.goalEstimate', { time: formatClock(d.estimate.seconds), target: formatClock(d.targetTimeS) })}
            </p>
          )}
        </>
      )}
      <Link to={`/metas/${goal.id}`}>{t('fitness.goalSeeMore')} →</Link>
    </section>
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
        formatLabel={shortDay}
        formatValue={(v) => formatNumber(v)}
        series={[
          { name: t('fitness.ctlShort'), values: series.map((p) => p.ctl), className: 'line-ctl' },
          { name: t('fitness.atlShort'), values: series.map((p) => p.atl), className: 'line-atl', dash: '5 4' },
        ]}
      />
    </section>
  )
}

function WeeklyLoad() {
  const { t } = useTranslation()
  const { overview, today } = useFitness()
  const weeks = overview!.weeks.slice(-12)
  const current = weekStart(today)
  const complete = weeks.filter((w) => w.week < current)
  const lastComplete = complete[complete.length - 1] ?? weeks[weeks.length - 1]
  const avg = complete.length ? complete.reduce((a, w) => a + w.load, 0) / complete.length : 0
  const jump = complete.slice(-2).find((w) => w.changePct !== null && w.changePct > 30)
  const isJump = (w: (typeof weeks)[number]) => w.week < current && w.changePct !== null && w.changePct > 30
  const hasPartial = weeks.some((w) => w.week === current)
  const change = lastComplete.changePct !== null ? ` (${lastComplete.changePct > 0 ? '+' : ''}${formatNumber(lastComplete.changePct)} %)` : ''
  return (
    <section className="card" aria-labelledby="weekly-h">
      <h2 id="weekly-h" className="card-title-icon">
        <TitleIcon name="chart" />
        {t('fitness.weeklyLoad')}
      </h2>
      <p className="muted">{t('fitness.weeklyLoadHelp')}</p>
      {jump && (
        <Alert kind="warning">
          {t('fitness.weekOf', { date: dayLabel(jump.week) })}: +{formatNumber(jump.changePct!)} %
        </Alert>
      )}
      <BarChart
        title={t('fitness.weeklyLoad')}
        summary={t('fitness.weeklySummary', { date: dayLabel(lastComplete.week), load: formatNumber(lastComplete.load), change, avg: formatNumber(avg) })}
        periodHeader={t('fitness.date')}
        valueHeader={t('fitness.load')}
        average={avg > 0 ? { value: avg, label: t('fitness.avgLine', { value: formatNumber(avg) }) } : undefined}
        legend={[
          { kind: 'normal', label: t('fitness.barLegendWeek') },
          { kind: 'highlight', label: t('fitness.barLegendLast') },
          ...(weeks.some(isJump) ? [{ kind: 'warn' as const, label: t('fitness.barLegendJump') }] : []),
          ...(hasPartial ? [{ kind: 'partial' as const, label: t('fitness.barLegendPartial') }] : []),
          { kind: 'average', label: t('fitness.barLegendAvg') },
        ]}
        note={t('fitness.weeklyLoadNote')}
        data={weeks.map((w) => ({
          label: dayLabel(w.week),
          fullLabel: `${t('fitness.weekOf', { date: dayLabel(w.week) })}${w.changePct !== null ? ` (${t('fitness.change')}: ${w.changePct > 0 ? '+' : ''}${formatNumber(w.changePct)} %)` : ''}`,
          value: w.load,
          display: formatNumber(w.load),
          highlight: w.week === lastComplete.week,
          warn: isJump(w),
          partial: w.week === current,
        }))}
      />
    </section>
  )
}
