import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { addDays, weekStart } from '../../core/dates'
import { formatNumber } from '../../core/units'
import { Icon, TitleIcon, type IconName } from '../../components/ui/Icon'
import { Calendar, type CalItem } from '../../components/ui/Calendar'
import { Progress } from '../../components/ui/Status'
import { LegalNotice, SESSION_ICON } from './SessionView'
import { usePlan } from './usePlan'

export const PHASE_ICON: Record<string, IconName> = {
  base: 'trend',
  build: 'bolt',
  recovery_week: 'leaf',
  taper: 'gauge',
  event: 'flag',
  recovery: 'leaf',
  return: 'refresh',
  pause: 'pause',
  maintenance: 'activity',
}

/**
 * Calendario del plan de entreno (Semana/Mes con el detalle de cada día).
 * Se usa en Plan y en el detalle de cada meta. `until` corta la navegación
 * (p. ej. en la fecha del evento de la meta).
 */
export function PlanCalendar({ until }: { until?: string } = {}) {
  const { t } = useTranslation()
  const { derived } = usePlan()
  if (!derived) return null
  const { plan, today, matches, ctx } = derived
  const firstWeek = plan.weeks[0]?.weekStart ?? weekStart(today)
  const lastWeek = plan.weeks.at(-1)?.weekStart ?? weekStart(today)
  const max = until && until < addDays(lastWeek, 6) ? until : addDays(lastWeek, 6)
  return (
    <section className="card plan-cal" aria-label={t('plan.calendar')}>
      <Calendar
        label={t('plan.calendar')}
        today={today}
        defaultView="week"
        min={firstWeek}
        max={max}
        getDay={(d) => {
          const wk = plan.weeks.find((w) => w.weekStart === weekStart(d))
          const list = plan.sessions.filter((x) => x.date === d && x.kind !== 'rest')
          const items: CalItem[] = list.map((x) => {
            const st = matches.get(x.id)?.status
            return {
              id: x.id,
              icon: x.kind === 'event' ? 'flag' : (SESSION_ICON[x.sport] ?? 'activity'),
              tone: x.kind === 'event' ? 'coral' : x.kind === 'long' ? 'amber' : x.kind === 'recovery' ? 'sky' : 'mint',
              title: `${t(`plan.kind.${x.kind}`)} · ${t(`sports.${x.sport}`)}`,
              meta: `${t('plan.minutes', { count: x.durationMin })} · ${t('plan.load', { value: Math.round(x.plannedLoad) })}`,
              to: `/plan/sesion/${x.id}`,
              badge: st
                ? {
                    text: t(`plan.status.${st}`),
                    tone: st === 'done' || st === 'partial' ? 'good' : st === 'missed' || st === 'harder' ? 'warn' : 'info',
                  }
                : undefined,
            }
          })
          const sts = list.map((x) => matches.get(x.id)?.status)
          const pause = wk?.phase === 'pause'
          return {
            items,
            mark: list.some((x) => x.kind === 'event')
              ? 'event'
              : sts.some((x) => x === 'done' || x === 'partial' || x === 'harder')
                ? 'done'
                : sts.includes('missed')
                  ? 'missed'
                  : pause
                    ? 'pause'
                    : undefined,
            total: list.length
              ? t('plan.calTotal', {
                  value: formatNumber(list.reduce((a, x) => a + x.plannedLoad, 0)),
                })
              : undefined,
            empty: pause ? { text: t('plan.calPause'), icon: 'pause' } : { text: t('plan.kind.rest'), icon: 'bed' },
          }
        }}
        summary={({ view, from, to }) => {
          const planned = plan.sessions.filter((x) => x.date >= from && x.date <= to).reduce((a, x) => a + x.plannedLoad, 0)
          const done = ctx.loaded.filter((l) => l.day >= from && l.day <= to && l.day <= today).reduce((a, l) => a + (l.load.load ?? 0), 0)
          return (
            <>
              {t(view === 'week' ? 'plan.calWeekLoad' : 'plan.calMonthLoad')}{' '}
              <strong className="num">
                {from <= today ? `${formatNumber(done)} / ` : ''}
                {formatNumber(planned)}
              </strong>
            </>
          )
        }}
        above={({ view, from }) => {
          if (view !== 'week') return null
          const wk = plan.weeks.find((w) => w.weekStart === from)
          if (!wk) return null
          const done = ctx.loaded.filter((l) => l.day >= from && l.day <= addDays(from, 6)).reduce((a, l) => a + (l.load.load ?? 0), 0)
          const pct = wk.targetLoad > 0 && from <= today ? Math.round((done / wk.targetLoad) * 100) : null
          return (
            <div className="plan-week-info">
              <span className={`phase-pill phase-pill-${wk.phase}`}>
                <Icon name={PHASE_ICON[wk.phase] ?? 'activity'} /> {t(`plan.phase.${wk.phase}`)}
              </span>
              {pct !== null && (
                <div className="plan-week-progress">
                  <p className="week-pct">
                    <strong className="num">{pct} %</strong> <span className="muted">{t('fitness.heroWeek')}</span>
                  </p>
                  <Progress pct={pct} level="good" label={`${pct} % ${t('fitness.heroWeek')}`} />
                </div>
              )}
              {wk.notes.map((n) => (
                <p key={n} className="callout">
                  {t(`plan.notes.${n}`)}
                </p>
              ))}
            </div>
          )
        }}
      />
    </section>
  )
}

/** Bloque «Tu plan de entreno» para Metas y Temporada: calendario y acceso al plan completo. */
export function PlanSection({ until, goalName }: { until?: string; goalName?: string }) {
  const { t } = useTranslation()
  const { derived } = usePlan()
  if (!derived || derived.plan.sessions.length === 0) return null
  return (
    <section className="plan-section" aria-labelledby="plan-sec-h">
      <div className="plan-section-head">
        <h2 id="plan-sec-h" className="card-title-icon">
          <TitleIcon name="plan" />
          {t('plan.sectionTitle')}
        </h2>
        <Link className="btn btn-secondary" to="/plan">
          {t('plan.seeFull')} <Icon name="chevronRight" />
        </Link>
      </div>
      <p className="muted">{goalName ? t('plan.sectionGoal', { goal: goalName }) : t('plan.sectionSeason')}</p>
      <LegalNotice />
      <PlanCalendar until={until} />
    </section>
  )
}
