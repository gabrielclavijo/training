import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LoadBadge } from '../../components/ui/Badges'
import { BarChart, LineChart } from '../../components/ui/Charts'
import { EmptyState } from '../../components/ui/EmptyState'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { daysBetween, formatDate, formatLongDate, localDayKey, weekStart } from '../../core/dates'
import type { LoadMethod } from '../../core/load'
import { formatClock, formatNumber } from '../../core/units'
import { fatigueStatus, fitnessVsBest, formStatus, rampStatus, type IndicatorStatus } from '../../core/fitness/status'
import { CountUp, Gauge, Progress, Semaphore } from '../../components/ui/Status'
import { useFitness, useGoals } from '../../data/hooks'
import { ActivityRow } from '../activities/ActivitiesPage'
import { TodayCard } from '../plan/TodayCard'
import { usePlan } from '../plan/usePlan'
import { Icon, type IconName, TitleIcon } from '../../components/ui/Icon'
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

  if (isLoading)
    return (
      <Page title={t('nav.home')}>
        <Spinner full />
      </Page>
    )
  if (error)
    return (
      <Page title={t('nav.home')}>
        <Alert kind="error">{t('errors.generic')}</Alert>
      </Page>
    )

  const pending = loaded?.filter((l) => l.load.method === 'none' && l.day >= daysAgo(today, 41)) ?? []

  return (
    <Page title={t('nav.home')}>
      <p className="muted capitalize-first">{formatLongDate(new Date())}</p>

      <HeroTop />

      <TodayCard />

      <GoalOverview />

      <RecommendationsCard />

      {!loaded || loaded.length === 0 ? (
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
          <FitnessCards />
          {overview && overview.series.length > 1 && <Trend />}
          {overview && overview.weeks.length > 0 && <WeeklyLoad />}
          <section className="card" aria-labelledby="recent-h">
            <h2 id="recent-h" className="card-title-icon">
              <TitleIcon name="activity" tone="sky" />
              {t('fitness.recent')}
            </h2>
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

function HeroTop() {
  const { t } = useTranslation()
  const { overview } = useFitness()
  const s = overview?.snapshot
  if (!s) return null
  return <FitnessHero state={t(`fitness.${tsbState(s.tsb)}`)} ctl={s.ctl} atl={s.atl} tsb={s.tsb} />
}

/** Tarjeta héroe: estado de forma y anillo con la carga hecha de la semana frente a la planeada. */
function FitnessHero({ state, ctl, atl, tsb }: { state: string; ctl: number; atl: number; tsb: number }) {
  const { t } = useTranslation()
  const { derived } = usePlan()
  const { loaded, today } = useFitness()
  const ws = weekStart(today)
  const week = derived?.plan.weeks.find((w) => w.weekStart === ws)
  const done = (loaded ?? []).filter((l) => l.day >= ws && l.day <= today).reduce((a, l) => a + (l.load.load ?? 0), 0)
  const pct = week && week.targetLoad > 0 ? Math.round((done / week.targetLoad) * 100) : null
  return (
    <div className="card card-hero hero">
      <div className="hero-text">
        <span className="eyebrow">
          <Icon name="trend" /> {t('fitness.heroEyebrow')}
        </span>
        <p className="hero-title">{state}</p>
        <p className="hero-verdict">
          <Semaphore level={formStatus(tsb).level} label={t(`fitness.level.${formStatus(tsb).level}`)} />
        </p>
        <p className="hero-sub">{t('fitness.heroSummary', { ctl: formatNumber(ctl), atl: formatNumber(atl), tsb: formatNumber(tsb) })}</p>
      </div>
      {pct !== null && week && (
        <Ring
          pct={pct}
          label={t('fitness.heroRingLabel', { pct, done: formatNumber(done), planned: formatNumber(week.targetLoad) })}
          caption={t('fitness.heroWeekShort')}
        />
      )}
    </div>
  )
}

function Ring({ pct, label, caption }: { pct: number; label: string; caption: string }) {
  const r = 40
  const shown = Math.min(100, Math.max(0, pct))
  return (
    <div className="ring" role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="ring-track" />
        <circle
          cx="50"
          cy="50"
          r={r}
          className="ring-value"
          pathLength={100}
          strokeDasharray={`${shown} 100`}
          style={{ '--ring': shown } as React.CSSProperties}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="ring-text">
        <strong className="num">{pct}%</strong>
        <span>{caption}</span>
      </span>
    </div>
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
