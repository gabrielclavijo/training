import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui/EmptyState'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { daysBetween, formatDate, localDayKey } from '../../core/dates'
import { formatClock, formatDistance, formatElevation } from '../../core/units'
import { useGoals } from '../../data/hooks'
import type { Goal } from '../../data/types'
import { goalTotals } from './goalUtils'
import { Icon } from '../../components/ui/Icon'

export function GoalsPage() {
  const { t } = useTranslation()
  const goals = useGoals()
  const actions = (
    <Link className="btn btn-primary" to="/metas/nueva">
      {t('goals.new')}
    </Link>
  )
  if (goals.isLoading) return <Page title={t('goals.title')}><Spinner /></Page>
  if (goals.error) return <Page title={t('goals.title')}><Alert kind="error">{t('errors.generic')}</Alert></Page>
  if (!goals.data?.length) {
    return (
      <Page title={t('goals.title')}>
        <EmptyState icon="goal" title={t('empty.goals.title')} body={t('empty.goals.body')} actionLabel={t('empty.goals.action')} actionTo="/metas/nueva" />
      </Page>
    )
  }
  return (
    <Page title={t('goals.title')} actions={actions}>
      <p>
        <Link to="/temporada">{t('season.title')} →</Link>
      </p>
      <ul className="activity-list">
        {goals.data.map((g) => (
          <GoalCard key={g.id} goal={g} />
        ))}
      </ul>
    </Page>
  )
}

export function GoalCard({ goal: g }: { goal: Goal }) {
  const { t } = useTranslation()
  const today = localDayKey(new Date())
  const days = daysBetween(today, g.eventDate)
  const tot = goalTotals(g)
  return (
    <li className="activity-item">
      <Link to={`/metas/${g.id}`} className={`activity-link${g.priority === 'primary' && days >= 0 ? ' goal-hero' : ''}`}>
        <span className={`icon-tile activity-tile${g.priority === 'primary' ? '' : ' icon-tile-soft'}`} aria-hidden="true">
          <Icon name="flag" />
        </span>
        <span className="activity-sport">
          {t(`sports.${g.sport}`)}
          {g.subSport && ` · ${t(`subSports.${g.subSport}`)}`} · {g.goalType === 'stage' ? t('goals.stagesCount', { count: g.stages.length }) : t('goals.single')}
        </span>
        <strong className="activity-title">{g.name}</strong>
        <span>
          {formatDate(`${g.eventDate}T12:00:00Z`)} · {days >= 0 ? t('goals.inDays', { count: days }) : t('goals.past')}
        </span>
        <span className="num">
          {tot.distanceM > 0 && formatDistance(tot.distanceM)}
          {tot.elevationGainM > 0 && ` · ↑ ${formatElevation(tot.elevationGainM)}`}
        </span>
        <span className="row" style={{ gap: 'var(--space-2)' }}>
          <span className={`badge ${g.priority === 'primary' ? 'badge-info' : 'badge-neutral'}`}>{g.priority === 'primary' ? `★ ${t('goals.primary')}` : t('goals.secondary')}</span>
          <span className="badge badge-neutral">{g.objective === 'time' && g.targetTimeS ? t('goals.targetTime', { time: formatClock(g.targetTimeS) }) : t('goals.finishOnly')}</span>
        </span>
      </Link>
    </li>
  )
}
