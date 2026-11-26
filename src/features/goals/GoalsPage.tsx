import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui/EmptyState'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { daysBetween, formatDate, localDayKey } from '../../core/dates'
import { formatClock, formatDistance, formatElevation } from '../../core/units'
import { useGoals } from '../../data/hooks'
import type { Goal } from '../../data/types'
import { goalTotals } from './goalUtils'
import { Icon, type IconName } from '../../components/ui/Icon'
import { Explainer } from '../../components/ui/Explainer'
import { usePlan } from '../plan/usePlan'

export function GoalsPage() {
  const { t } = useTranslation()
  const goals = useGoals()
  const actions = (
    <Link className="btn btn-primary" to="/metas/nueva">
      {t('goals.new')}
    </Link>
  )
  if (goals.isLoading)
    return (
      <Page title={t('goals.title')}>
        <Spinner full />
      </Page>
    )
  if (goals.error)
    return (
      <Page title={t('goals.title')}>
        <Alert kind="error">{t('errors.generic')}</Alert>
      </Page>
    )
  if (!goals.data?.length) {
    return (
      <Page title={t('goals.title')}>
        <EmptyState icon="goal" title={t('empty.goals.title')} body={t('empty.goals.body')} actionLabel={t('empty.goals.action')} actionTo="/metas/nueva" />
      </Page>
    )
  }
  const today = localDayKey(new Date())
  const upcoming = goals.data
    .filter((g) => g.status === 'active' && g.eventDate >= today)
    .sort((a, b) => (a.priority === b.priority ? a.eventDate.localeCompare(b.eventDate) : a.priority === 'primary' ? -1 : 1))
  const past = goals.data.filter((g) => !upcoming.includes(g))
  return (
    <Page title={t('goals.title')} actions={actions}>
      <GoalsExplainer />
      <ul className="goal-list">
        {upcoming.map((g, i) => (
          <GoalCard key={g.id} goal={g} index={i} />
        ))}
      </ul>
      {past.length > 0 && (
        <>
          <h2 className="section-title goal-past-title">{t('goals.pastTitle')}</h2>
          <ul className="goal-list">
            {past.map((g, i) => (
              <GoalCard key={g.id} goal={g} index={i} />
            ))}
          </ul>
        </>
      )}
      <Link to="/temporada" className="goal-season-link">
        <span className="icon-tile icon-tile-sky" aria-hidden="true">
          <Icon name="calendar" />
        </span>
        <span>
          <strong>{t('season.title')}</strong>
          <span className="muted">{t('goals.seasonLink')}</span>
        </span>
        <Icon name="chevronRight" />
      </Link>
    </Page>
  )
}

export function GoalsExplainer() {
  const { t } = useTranslation()
  return (
    <Explainer
      id="goals"
      icon="flag"
      title={t('goals.whatTitle')}
      points={[
        ['star', t('goals.whatPrimary')],
        ['plan', t('goals.whatPlan')],
        ['food', t('goals.whatFood')],
      ]}
    >
      {t('goals.whatBody')}
    </Explainer>
  )
}

const SPORT_ICON: Record<string, IconName> = { cycling: 'bike', running: 'run', swimming: 'swim', strength: 'dumbbell', other: 'activity' }
const DIAG = { on_track: 'good', tight: 'caution', behind: 'alert', past: 'good' } as const

export function GoalCard({ goal: g, index = 0 }: { goal: Goal; index?: number }) {
  const { t } = useTranslation()
  const { derived } = usePlan()
  const today = localDayKey(new Date())
  const days = daysBetween(today, g.eventDate)
  const tot = goalTotals(g)
  const primary = g.priority === 'primary' && days >= 0
  const d = derived?.diagnoses.find((x) => x.goalId === g.id)?.diagnosis
  const pct = d && d.targetCtl > 0 && d.status !== 'past' ? Math.round((d.currentCtl / d.targetCtl) * 100) : null
  return (
    <li className="goal-item" style={{ animationDelay: `${index * 60}ms` }}>
      <Link to={`/metas/${g.id}`} className={`goal-card goal-card-${g.sport}${primary ? ' is-primary' : ''}${days < 0 ? ' is-past' : ''}`}>
        <span className="goal-card-top">
          <span className="goal-card-icon" aria-hidden="true">
            {g.sport === 'triathlon' ? <TriIcons /> : <Icon name={SPORT_ICON[g.sport] ?? 'activity'} />}
          </span>
          <span className="goal-card-text">
            <span className="goal-card-sport">
              {t(`sports.${g.sport}`)}
              {g.subSport && ` · ${t(`subSports.${g.subSport}`)}`} ·{' '}
              {g.sport === 'triathlon'
                ? t(`triathlon.presets.${g.triPreset ?? 'custom'}`)
                : g.goalType === 'stage'
                  ? t('goals.stagesCount', { count: g.stages.length })
                  : t('goals.single')}
            </span>
            <strong className="goal-card-name">{g.name}</strong>
            <span className="goal-card-date">
              <Icon name="calendar" /> {formatDate(`${g.eventDate}T12:00:00Z`)}
            </span>
          </span>
          <span className="goal-card-count">
            {days >= 0 ? (
              <>
                <strong className="num">{days}</strong>
                <span>{t('goals.daysLeftShort', { count: days })}</span>
              </>
            ) : (
              <span>{t('goals.past')}</span>
            )}
          </span>
        </span>
        <span className="goal-card-chips">
          {g.priority === 'primary' ? (
            <span className="gchip gchip-star">
              <Icon name="star" /> {t('goals.primary')}
            </span>
          ) : (
            <span className="gchip">{t('goals.secondary')}</span>
          )}
          {g.sport === 'triathlon' && g.legs ? (
            <>
              <span className="gchip">
                <Icon name="swim" /> {formatDistance(g.legs.swimM)}
              </span>
              <span className="gchip">
                <Icon name="bike" /> {formatDistance(g.legs.bikeM)}
              </span>
              <span className="gchip">
                <Icon name="run" /> {formatDistance(g.legs.runM)}
              </span>
            </>
          ) : (
            tot.distanceM > 0 && (
              <span className="gchip">
                <Icon name="route" /> {formatDistance(tot.distanceM)}
              </span>
            )
          )}
          {tot.elevationGainM > 0 && (
            <span className="gchip">
              <Icon name="mountain" /> {formatElevation(tot.elevationGainM)}
            </span>
          )}
          <span className="gchip">
            <Icon name={g.objective === 'time' ? 'timer' : 'check'} />{' '}
            {g.objective === 'time' && g.targetTimeS ? formatClock(g.targetTimeS) : t('goals.finishOnly')}
          </span>
        </span>
        {pct !== null && d && (
          <span className="goal-card-form">
            <span className="goal-card-form-head">
              <span>{t('goals.formShort', { pct })}</span>
              <span className={`gstatus gstatus-${DIAG[d.status]}`}>{t(`diagnosis.status.${d.status}`)}</span>
            </span>
            <span className="goal-card-bar" aria-hidden="true">
              <span className={`goal-card-fill fill-${DIAG[d.status]}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </span>
          </span>
        )}
        <span className="goal-card-more">
          {t('goals.seeDetail')} <Icon name="chevronRight" />
        </span>
      </Link>
    </li>
  )
}

/** Ícono de triatlón: natación, bici y running juntos. */
export function TriIcons() {
  return (
    <span className="tri-icons">
      <Icon name="swim" />
      <Icon name="bike" />
      <Icon name="run" />
    </span>
  )
}
