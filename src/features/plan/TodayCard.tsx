import { TitleIcon } from '../../components/ui/Icon'
import { useTranslation } from 'react-i18next'
import { addDays } from '../../core/dates'
import { SessionCard } from './SessionView'
import { usePlan } from './usePlan'

/** Inicio → «Hoy»: la sesión del día y la de mañana. */
export function TodayCard() {
  const { t } = useTranslation()
  const { derived } = usePlan()
  if (!derived || derived.plan.sessions.length === 0) return null
  const { plan, today, matches, zones } = derived
  const todays = plan.sessions.filter((s) => s.date === today)
  const tomorrow = plan.sessions.filter((s) => s.date === addDays(today, 1))
  return (
    <section className="card" aria-labelledby="today-h">
      <h2 id="today-h" className="card-title-icon">
        <TitleIcon name="calendar" />
        {t('plan.today')}
      </h2>
      {todays.length === 0 ? <p>{t('plan.todayRest')}</p> : todays.map((s) => <SessionCard key={s.id} session={s} match={matches.get(s.id)} zones={zones} />)}
      {tomorrow.length > 0 && (
        <>
          <h3>{t('plan.tomorrow')}</h3>
          {tomorrow.map((s) => (
            <SessionCard key={s.id} session={s} zones={zones} compact />
          ))}
        </>
      )}
    </section>
  )
}
