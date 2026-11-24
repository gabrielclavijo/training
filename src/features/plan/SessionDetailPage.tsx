import { TitleIcon } from '../../components/ui/Icon'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui/EmptyState'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { formatLongDate } from '../../core/dates'
import { LegalNotice, StatusBadge, useDescribeBlocks, ZonesNotice } from './SessionView'
import { usePlan } from './usePlan'

export function SessionDetailPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const { derived, isLoading, error } = usePlan()
  const describe = useDescribeBlocks()
  if (isLoading)
    return (
      <Page title={t('plan.session')}>
        <Spinner full />
      </Page>
    )
  if (error || !derived)
    return (
      <Page title={t('plan.session')}>
        <Alert kind="error">{t('errors.generic')}</Alert>
      </Page>
    )
  const s = derived.plan.sessions.find((x) => x.id === id)
  if (!s) {
    return (
      <Page title={t('errors.notFoundTitle')}>
        <EmptyState title={t('plan.sessionNotFound')} body={t('errors.notFoundBody')} actionLabel={t('plan.title')} actionTo="/plan" />
      </Page>
    )
  }
  const match = derived.matches.get(s.id)
  const activity = match?.activityId ? derived.ctx.activities.find((a) => a.id === match.activityId) : null
  const goal = s.goalId ? derived.ctx.goals.find((g) => g.id === s.goalId) : null
  const week = derived.plan.weeks.find((w) => s.date >= w.weekStart && s.date <= addDaysSafe(w.weekStart, 6))
  return (
    <Page title={`${t(`plan.kind.${s.kind}`)} · ${t(`sports.${s.sport}`)}`}>
      <p className="muted capitalize-first">
        {formatLongDate(`${s.date}T12:00:00Z`)} · {t('plan.minutes', { count: s.durationMin })} · {t('plan.load', { value: Math.round(s.plannedLoad) })}
      </p>
      {match && (
        <p>
          <StatusBadge status={match.status} />
          {activity && (
            <>
              {' '}
              <Link to={`/actividades/${activity.id}`}>{t('plan.doneWith', { title: activity.title ?? t(`sports.${activity.sport}`) })}</Link>
            </>
          )}
        </p>
      )}
      <LegalNotice />
      <ZonesNotice zones={derived.zones} />
      <section className="card" aria-labelledby="what-h">
        <h2 id="what-h" className="card-title-icon">
          <TitleIcon name="activity" />
          {t('plan.whatToDo')}
        </h2>
        <p>{t(`plan.kindHelp.${s.kind}`)}</p>
        <div className="session-profile" aria-hidden="true">
          {s.blocks.map((b, i) => (
            <span key={i} className={`zone-seg z${b.zone}`} style={{ flex: b.minutes * (b.repeat ?? 1) }}>
              Z{b.zone}
            </span>
          ))}
        </div>
        <ol className="block-list">
          {describe(s.blocks, derived.zones, s.sport).map((l, i) => (
            <li key={i} style={{ animationDelay: `${i * 60}ms` }}>
              <span className={`zone-pill z${s.blocks[i]?.zone}`} aria-hidden="true">
                Z{s.blocks[i]?.zone}
              </span>
              <span>{l}</span>
            </li>
          ))}
        </ol>
      </section>
      <section className="card" aria-labelledby="why-h">
        <h2 id="why-h" className="card-title-icon">
          <TitleIcon name="bulb" tone="sky" />
          {t('plan.why')}
        </h2>
        {week && (
          <p>
            {t(`plan.phase.${week.phase}`)}
            {goal ? ` · ${goal.name}` : ''}
          </p>
        )}
        {s.note && <p>{t(`plan.sessionNote.${s.note}`)}</p>}
        {week?.notes.map((n) => (
          <p key={n}>{t(`plan.notes.${n}`)}</p>
        ))}
      </section>
      <Link to="/plan">← {t('plan.title')}</Link>
    </Page>
  )
}

function addDaysSafe(d: string, n: number) {
  const [y, m, dd] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10)
}
