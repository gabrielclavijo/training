import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui/EmptyState'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { formatDate, weekStart } from '../../core/dates'
import { formatNumber } from '../../core/units'
import { usePlanChanges } from './usePlanChanges'
import { Icon, type IconName, TitleIcon } from '../../components/ui/Icon'
import { LegalNotice, ZonesNotice } from './SessionView'
import { TodayCard } from './TodayCard'
import { PHASE_ICON, PlanCalendar } from './PlanCalendar'
import { usePlan } from './usePlan'
import { PausesSection } from '../season/SeasonPage'

const fmt = (d: string) => formatDate(`${d}T12:00:00Z`)

export function PlanPage() {
  const { t } = useTranslation()
  const { derived, isLoading, error } = usePlan()

  if (isLoading)
    return (
      <Page title={t('plan.title')}>
        <Spinner full />
      </Page>
    )
  if (error || !derived)
    return (
      <Page title={t('plan.title')}>
        <Alert kind="error">{t('errors.generic')}</Alert>
      </Page>
    )
  const { zones, ctx } = derived

  const hasGoals = ctx.goals.some((g) => g.status === 'active')

  return (
    <Page
      title={t('plan.title')}
      actions={
        <Link className="btn btn-secondary" to="/plan/disponibilidad">
          {t('plan.availability.title')}
        </Link>
      }
    >
      <LegalNotice />
      <ZonesNotice zones={zones} />
      {!hasGoals && <EmptyState icon="goal" title={t('plan.noPlan')} body={t('plan.noPlanBody')} actionLabel={t('plan.createGoal')} actionTo="/metas/nueva" />}

      <TodayCard />

      <PlanCalendar />

      <UpcomingWeeks />
      <PausesSection />
      <ChangesList />
    </Page>
  )
}

const REASON_ICON: Record<string, IconName> = {
  initial: 'sparkles',
  goals_changed: 'flag',
  pause: 'pause',
  availability: 'clock',
  overreached: 'alert',
  missed_sessions: 'calendar',
  harder_than_planned: 'bolt',
  weekly: 'refresh',
  adaptation: 'refresh',
}

function UpcomingWeeks() {
  const { t } = useTranslation()
  const { derived } = usePlan()
  if (!derived) return null
  const goals = new Map(derived.ctx.goals.map((g) => [g.id, g.name]))
  const future = derived.plan.weeks.filter((w) => w.weekStart > weekStart(derived.today))
  if (!future.length) return null
  const maxLoad = Math.max(1, ...future.map((w) => w.targetLoad))
  return (
    <section className="card" aria-labelledby="up-h">
      <h2 id="up-h" className="card-title-icon">
        <TitleIcon name="calendar" tone="sky" />
        {t('plan.nextWeeks')}
      </h2>
      <ul className="week-cards">
        {future.map((w, i) => (
          <li key={w.weekStart} className={`week-card phase-${w.phase}`} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
            <span className="week-card-date">{fmt(w.weekStart).slice(0, 5)}</span>
            <span className={`phase-pill phase-pill-${w.phase}`}>
              <Icon name={PHASE_ICON[w.phase] ?? 'activity'} /> {t(`plan.phase.${w.phase}`)}
            </span>
            {w.goalId && goals.get(w.goalId) && <span className="week-card-goal">{goals.get(w.goalId)}</span>}
            <span className="week-card-load">
              <span className="macro-track" aria-hidden="true">
                <span className="phase-fill" style={{ width: `${(w.targetLoad / maxLoad) * 100}%` }} />
              </span>
              <span className="num">
                {t('fitness.load')} {formatNumber(w.targetLoad)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ChangesList() {
  const { t } = useTranslation()
  const changes = usePlanChanges()
  return (
    <section className="card" aria-labelledby="ch-h">
      <h2 id="ch-h" className="card-title-icon">
        <TitleIcon name="refresh" tone="soft" />
        {t('plan.changesTitle')}
      </h2>
      {changes.data?.length === 0 && <p className="muted">{t('plan.noChanges')}</p>}
      <ol className="change-line">
        {(changes.data ?? []).slice(0, 10).map((c, i) => (
          <li key={c.id} style={{ animationDelay: `${i * 50}ms` }}>
            <span className={`change-dot reason-${c.reason}`} aria-hidden="true">
              <Icon name={REASON_ICON[c.reason] ?? 'refresh'} />
            </span>
            <div>
              <span className="chip change-date">{formatDate(c.createdAt)}</span>
              <p>
                {t(`plan.changes.${c.reason}`, {
                  ...c.params,
                  defaultValue: t('plan.changes.weekly'),
                })}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
