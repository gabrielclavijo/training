import { useEffect } from 'react'
import { celebrateOnce } from '../../components/fx/motion'
import { Icon, TitleIcon, type IconName } from '../../components/ui/Icon'
import { ArcGauge, CountUp, Semaphore } from '../../components/ui/Status'
import { usePlan } from '../plan/usePlan'
import type { Goal } from '../../data/types'
import { useToast } from '../../components/fx/Toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui/EmptyState'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { addDays, daysBetween, formatDate, localDayKey } from '../../core/dates'
import { formatClock, formatDistance, formatElevation, formatNumber } from '../../core/units'
import { useRepo } from '../../data/RepoProvider'
import { DiagnosisCard } from './DiagnosisCard'
import { goalEstimatedHours, goalTotals } from './goalUtils'

const SPORT_ICON: Record<string, IconName> = { cycling: 'bike', running: 'run', swimming: 'swim', strength: 'dumbbell', other: 'activity' }

function Tile({ icon, tone, label, value }: { icon: IconName; tone: string; label: string; value: string }) {
  return (
    <li className={`goal-tile kpi-${tone}`}>
      <span className="kpi-icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className="kpi-label">{label}</span>
      <strong className="goal-tile-value">{value}</strong>
    </li>
  )
}

/** Encabezado de la meta: deporte, nombre, fecha y cuenta regresiva. */
function GoalHero({ goal: g, days }: { goal: Goal; days: number }) {
  const { t } = useTranslation()
  return (
    <section className={`goal-hero goal-hero-${g.sport}`} aria-label={g.name}>
      <span className="goal-hero-icon" aria-hidden="true">
        <Icon name={SPORT_ICON[g.sport] ?? 'activity'} />
      </span>
      <div className="goal-hero-text">
        <span className="goal-hero-sport">
          {t(`sports.${g.sport}`)}
          {g.subSport && ` · ${t(`subSports.${g.subSport}`)}`}
          {g.goalType === 'stage' && ` · ${t('goals.stagesCount', { count: g.stages.length })}`}
        </span>
        <p className="goal-hero-name">{g.name}</p>
        <span className="goal-hero-date">
          <Icon name="calendar" /> {formatDate(`${g.eventDate}T12:00:00Z`)}
          {g.priority === 'primary' && <span className="goal-hero-chip">★ {t('goals.primary')}</span>}
        </span>
      </div>
      <div className="goal-countdown" aria-label={days >= 0 ? t('goals.inDays', { count: days }) : t('goals.past')}>
        {days >= 0 ? (
          <>
            <strong className="num">
              <CountUp value={days} format={(n) => String(Math.round(n))} />
            </strong>
            <span>{t('goals.daysLeftShort', { count: days })}</span>
          </>
        ) : (
          <span>{t('goals.past')}</span>
        )}
      </div>
    </section>
  )
}

const DIAG_LEVEL = { on_track: 'good', tight: 'caution', behind: 'alert', past: 'good' } as const

/** Medidor: forma de hoy frente a la recomendada para el evento. */
function FormToGoal({ goalId }: { goalId: string }) {
  const { t } = useTranslation()
  const { derived } = usePlan()
  const d = derived?.diagnoses.find((x) => x.goalId === goalId)
  if (!d || d.diagnosis.status === 'past' || d.diagnosis.targetCtl <= 0) return null
  const x = d.diagnosis
  const pctNow = Math.round((x.currentCtl / x.targetCtl) * 100)
  const pctEvent = Math.round((x.projectedCtl / x.targetCtl) * 100)
  return (
    <section className="card form-card goal-form" aria-labelledby="gform-h">
      <div className="row-between">
        <h2 id="gform-h" className="card-title-icon">
          <span className="icon-tile">
            <Icon name="gauge" />
          </span>
          {t('goals.howGoing')}
        </h2>
        <Semaphore level={DIAG_LEVEL[x.status]} label={t(`diagnosis.status.${x.status}`)} />
      </div>
      <ArcGauge
        scale={{
          min: 0,
          max: x.targetCtl * 1.2,
          zones: [
            { to: x.targetCtl * 0.6, level: 'alert' },
            { to: x.targetCtl * 0.9, level: 'caution' },
            { to: x.targetCtl * 1.2, level: 'good' },
          ],
        }}
        value={x.currentCtl}
        label={t('goals.gaugeLabel', { now: formatNumber(x.currentCtl), target: formatNumber(x.targetCtl), pct: pctNow, event: pctEvent })}
      >
        <p className="form-state num">{pctNow} %</p>
        <p className="form-value">{t('goals.gaugeCaption')}</p>
      </ArcGauge>
      <ul className="rating-row">
        <li className="rating">
          <span className="rating-label">{t('fitness.goalFormNow')}</span>
          <span className="rating-value num">{formatNumber(x.currentCtl)}</span>
        </li>
        <li className="rating">
          <span className="rating-label">{t('fitness.goalFormProjected')}</span>
          <span className="rating-value num">{formatNumber(x.projectedCtl)}</span>
        </li>
        <li className="rating">
          <span className="rating-label">{t('fitness.goalFormTarget')}</span>
          <span className="rating-value num">{formatNumber(x.targetCtl)}</span>
        </li>
      </ul>
      <p className="form-verdict">{t(`diagnosis.statusHelp.${x.status}`)}</p>
    </section>
  )
}

export function GoalDetailPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const toast = useToast()
  const repo = useRepo()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['goal', id], queryFn: () => repo.getGoal(id) })
  // Celebración (una vez) cuando llega o acaba de pasar el día de la meta
  const eventDate = q.data?.eventDate
  useEffect(() => {
    if (!eventDate || q.data?.status === 'cancelled') return
    const since = daysBetween(eventDate, localDayKey(new Date()))
    if (since >= 0 && since <= 7) {
      const tm = setTimeout(() => celebrateOnce(`meta-${id}`), 600)
      return () => clearTimeout(tm)
    }
  }, [eventDate, id, q.data?.status])

  if (q.isLoading)
    return (
      <Page title={t('goals.title')}>
        <Spinner full />
      </Page>
    )
  if (q.error)
    return (
      <Page title={t('goals.title')}>
        <Alert kind="error">{t('errors.generic')}</Alert>
      </Page>
    )
  const g = q.data
  if (!g) {
    return (
      <Page title={t('errors.notFoundTitle')}>
        <EmptyState title={t('goals.notFound')} body={t('errors.notFoundBody')} actionLabel={t('goals.title')} actionTo="/metas" />
      </Page>
    )
  }
  const today = localDayKey(new Date())
  const days = daysBetween(today, g.eventDate)
  const tot = goalTotals(g)
  const est = goalEstimatedHours(g)

  async function remove() {
    if (!window.confirm(t('goals.deleteConfirm'))) return
    await repo.deleteGoal(g!.id)
    await qc.invalidateQueries()
    toast(t('toast.goalDeleted'), { icon: 'trash' })
    navigate('/metas')
  }

  return (
    <Page title={g.name} headerTitle={t('goals.title')}>
      <GoalHero goal={g} days={days} />

      <ul className="goal-tiles">
        {tot.distanceM > 0 && <Tile icon="route" tone="mint" label={t('activities.distance')} value={formatDistance(tot.distanceM)} />}
        {tot.elevationGainM > 0 && <Tile icon="mountain" tone="amber" label={t('goals.elevationGain')} value={`↑ ${formatElevation(tot.elevationGainM)}`} />}
        {g.maxAltitudeM ? <Tile icon="flag" tone="sky" label={t('goals.maxAltitude')} value={formatElevation(g.maxAltitudeM)} /> : null}
        {g.terrain && <Tile icon="leaf" tone="soft" label={t('goals.terrain')} value={t(`terrain.${g.terrain}`)} />}
        <Tile
          icon={g.objective === 'time' ? 'timer' : 'check'}
          tone="coral"
          label={t('goals.objective')}
          value={g.objective === 'time' && g.targetTimeS ? formatClock(g.targetTimeS) : t('goals.finishOnly')}
        />
        {g.objective !== 'time' && <Tile icon="clock" tone="soft" label={t('goals.estimatedShort')} value={formatClock(est * 3600)} />}
      </ul>
      <p className="muted small">{t('goals.estimatedHelp')}</p>

      <FormToGoal goalId={g.id} />

      {g.goalType === 'stage' && (
        <section className="card" aria-labelledby="stages-h">
          <h2 id="stages-h" className="card-title-icon">
            <TitleIcon name="route" tone="sky" />
            {t('goals.stages')}
          </h2>
          <ol className="stage-cards">
            {g.stages.map((st, i) => (
              <li key={st.stageNumber} style={{ animationDelay: `${i * 60}ms` }}>
                <span className="stage-num" aria-hidden="true">
                  {st.stageNumber}
                </span>
                <div className="stage-body">
                  <strong>{t('goals.stageN', { n: st.stageNumber })}</strong>
                  <span className="muted">{formatDate(`${addDays(g.eventDate, st.dayOffset)}T12:00:00Z`)}</span>
                  <ul className="chips">
                    <li className="chip">
                      <Icon name="route" /> {formatDistance(st.distanceM)}
                    </li>
                    <li className="chip">
                      <Icon name="mountain" /> {formatElevation(st.elevationGainM)}
                    </li>
                    {st.terrain && (
                      <li className="chip">
                        <Icon name="leaf" /> {t(`terrain.${st.terrain}`)}
                      </li>
                    )}
                    {g.objective === 'time' && st.targetTimeS ? (
                      <li className="chip chip-strong">
                        <Icon name="timer" /> {formatClock(st.targetTimeS)}
                      </li>
                    ) : null}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {g.notes && (
        <section className="card">
          <h2 className="card-title-icon">
            <TitleIcon name="book" tone="soft" />
            {t('goals.notes')}
          </h2>
          <p>{g.notes}</p>
        </section>
      )}

      <DiagnosisCard goalId={g.id} />

      <div className="row">
        <Link className="btn btn-primary" to={`/metas/${g.id}/editar`}>
          {t('goals.edit')}
        </Link>
        <Link className="btn btn-secondary" to="/temporada">
          {t('season.title')}
        </Link>
        <button type="button" className="btn btn-danger" onClick={() => void remove()}>
          {t('goals.delete')}
        </button>
      </div>
    </Page>
  )
}
