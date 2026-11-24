import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui/EmptyState'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { addDays, formatDate, formatLongDate, weekStart } from '../../core/dates'
import { formatNumber } from '../../core/units'
import { usePlanChanges } from './usePlanChanges'
import { Icon, type IconName } from '../../components/ui/Icon'
import type { StoredSession } from '../../data/types'
import type { MatchResult } from '../../core/planner/adapt'
import { LegalNotice, SessionCard, ZonesNotice } from './SessionView'
import { usePlan } from './usePlan'
import { PausesSection } from '../season/SeasonPage'

const fmt = (d: string) => formatDate(`${d}T12:00:00Z`)

export function PlanPage() {
  const { t } = useTranslation()
  const { derived, isLoading, error } = usePlan()
  const [offset, setOffset] = useState(0)

  if (isLoading) return <Page title={t('plan.title')}><Spinner /></Page>
  if (error || !derived) return <Page title={t('plan.title')}><Alert kind="error">{t('errors.generic')}</Alert></Page>
  const { plan, today, matches, zones, ctx } = derived

  const hasGoals = ctx.goals.some((g) => g.status === 'active')
  const ws = addDays(weekStart(today), offset * 7)
  const week = plan.weeks.find((w) => w.weekStart === ws)
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const weekSessions = plan.sessions.filter((s) => s.date >= ws && s.date <= addDays(ws, 6))
  const doneLoad = ctx.loaded.filter((l) => l.day >= ws && l.day <= addDays(ws, 6)).reduce((s, l) => s + (l.load.load ?? 0), 0)
  const firstWeek = plan.weeks[0]?.weekStart ?? ws
  const lastWeek = plan.weeks.at(-1)?.weekStart ?? ws

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
      {!hasGoals && (
        <EmptyState icon="goal" title={t('plan.noPlan')} body={t('plan.noPlanBody')} actionLabel={t('plan.createGoal')} actionTo="/metas/nueva" />
      )}

      <section className="card" aria-labelledby="week-h">
        <div className="week-nav">
          <button type="button" className="btn btn-secondary" onClick={() => setOffset(offset - 1)} disabled={ws <= firstWeek && ws <= weekStart(today)}>
            ← <span className="visually-hidden">{t('plan.prevWeek')}</span>
          </button>
          <h2 id="week-h" className="week-title">
            {offset === 0 ? t('plan.thisWeek') : t('plan.week', { date: fmt(ws) })}
            {week && <span className="muted phase-label"> · {t(`plan.phase.${week.phase}`)}</span>}
          </h2>
          <button type="button" className="btn btn-secondary" onClick={() => setOffset(offset + 1)} disabled={ws >= lastWeek}>
            → <span className="visually-hidden">{t('plan.nextWeek')}</span>
          </button>
        </div>
        {week && (
          <p className="muted" style={{ marginTop: 'var(--space-3)' }}>
            {ws <= today
              ? t('plan.weekLoad', { planned: formatNumber(week.targetLoad), done: formatNumber(doneLoad) })
              : t('plan.weekLoadPlannedOnly', { planned: formatNumber(week.targetLoad) })}
          </p>
        )}
        {week?.notes.map((n) => (
          <p key={n} className="callout">
            {t(`plan.notes.${n}`)}
          </p>
        ))}
        <WeekStrip days={days} today={today} sessions={weekSessions} matches={matches} pct={week && week.targetLoad > 0 && ws <= today ? Math.round((doneLoad / week.targetLoad) * 100) : null} />
        <ol className="day-list">
          {days.map((d) => {
            const list = weekSessions.filter((s) => s.date === d)
            const isToday = d === today
            return (
              <li key={d} id={`dia-${d}`} tabIndex={-1} className={isToday ? 'day day-today' : 'day'} aria-current={isToday ? 'date' : undefined}>
                <h3 className="day-title capitalize-first">
                  {formatLongDate(`${d}T12:00:00Z`)}
                  {isToday && <span className="badge badge-info"> {t('plan.today')}</span>}
                </h3>
                {list.length === 0 ? (
                  <p className="muted">{t('plan.kind.rest')}</p>
                ) : (
                  list.map((s) => <SessionCard key={s.id} session={s} match={matches.get(s.id)} zones={zones} compact={!isToday} />)
                )}
              </li>
            )
          })}
        </ol>
      </section>

      <UpcomingWeeks />
      <PausesSection />
      <ChangesList />
    </Page>
  )
}

const LETTER = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** Tira de la semana: un botón por día con su estado (lleva al detalle del día). */
function WeekStrip({
  days,
  today,
  sessions,
  matches,
  pct,
}: {
  days: string[]
  today: string
  sessions: StoredSession[]
  matches: Map<string, MatchResult>
  pct: number | null
}) {
  const { t } = useTranslation()
  return (
    <div className="week-strip-wrap">
      {pct !== null && (
        <p className="week-pct">
          <span className="badge badge-soft num">{pct}%</span> <span className="muted">{t('fitness.heroWeek')}</span>
        </p>
      )}
      <ul className="week-strip">
        {days.map((d, i) => {
          const list = sessions.filter((s) => s.date === d && s.kind !== 'rest')
          const statuses = list.map((s) => matches.get(s.id)?.status ?? 'pending')
          const done = statuses.some((x) => x === 'done' || x === 'partial' || x === 'harder')
          const missed = !done && statuses.includes('missed')
          const event = list.some((s) => s.kind === 'event')
          const long = list.some((s) => s.kind === 'long')
          const icon: IconName = list.length === 0 ? 'moon' : done ? 'check' : event ? 'flag' : long ? 'mountain' : 'activity'
          const label = [
            formatLongDate(`${d}T12:00:00Z`),
            list.length === 0 ? t('plan.kind.rest') : list.map((s) => t(`plan.kind.${s.kind}`)).join(', '),
            done ? t('plan.status.done') : missed ? t('plan.status.missed') : list.length ? t('plan.status.pending') : '',
          ]
            .filter(Boolean)
            .join(' · ')
          const cls = ['day-chip', done && 'day-chip-done', missed && 'day-chip-missed', event && 'day-chip-event', d === today && 'day-chip-today'].filter(Boolean).join(' ')
          return (
            <li key={d}>
              <button
                type="button"
                className={cls}
                aria-label={label}
                aria-current={d === today ? 'date' : undefined}
                onClick={() => {
                  const el = document.getElementById(`dia-${d}`)
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  el?.focus({ preventScroll: true })
                }}
              >
                <span aria-hidden="true">{LETTER[i]}</span>
                <Icon name={icon} />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function UpcomingWeeks() {
  const { t } = useTranslation()
  const { derived } = usePlan()
  if (!derived) return null
  const goals = new Map(derived.ctx.goals.map((g) => [g.id, g.name]))
  const future = derived.plan.weeks.filter((w) => w.weekStart > weekStart(derived.today))
  if (!future.length) return null
  return (
    <section className="card" aria-labelledby="up-h">
      <h2 id="up-h">{t('plan.nextWeeks')}</h2>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={t('fitness.seeTable')}>
        <table>
          <thead>
            <tr>
              <th scope="col">{t('plan.week', { date: '' }).trim()}</th>
              <th scope="col">{t('season.title')}</th>
              <th scope="col">{t('fitness.load')}</th>
            </tr>
          </thead>
          <tbody>
            {future.map((w) => (
              <tr key={w.weekStart}>
                <th scope="row">{fmt(w.weekStart)}</th>
                <td>
                  {t(`plan.phase.${w.phase}`)}
                  {w.goalId && goals.get(w.goalId) ? ` · ${goals.get(w.goalId)}` : ''}
                </td>
                <td>{formatNumber(w.targetLoad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ChangesList() {
  const { t } = useTranslation()
  const changes = usePlanChanges()
  return (
    <section className="card" aria-labelledby="ch-h">
      <h2 id="ch-h">{t('plan.changesTitle')}</h2>
      {changes.data?.length === 0 && <p className="muted">{t('plan.noChanges')}</p>}
      <ul className="plain-list">
        {(changes.data ?? []).slice(0, 10).map((c) => (
          <li key={c.id}>
            <span className="muted">{formatDate(c.createdAt)}</span> — {t(`plan.changes.${c.reason}`, { ...c.params, defaultValue: t('plan.changes.weekly') })}
          </li>
        ))}
      </ul>
    </section>
  )
}
