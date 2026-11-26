import { useEffect, useState } from 'react'
import { BusyButton } from '../../components/ui/Busy'
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
import { PlanSection } from '../plan/PlanCalendar'
import { RaceFuelCard } from './RaceFuelCard'
import { goalEstimatedHours, goalTotals } from './goalUtils'
import { TriIcons } from './GoalsPage'
import type { TriLegs } from '../../core/triathlon'
import type { GoalDiagnosis } from '../../data/planService'

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
        {g.sport === 'triathlon' ? <TriIcons /> : <Icon name={SPORT_ICON[g.sport] ?? 'activity'} />}
      </span>
      <div className="goal-hero-text">
        <span className="goal-hero-sport">
          {t(`sports.${g.sport}`)}
          {g.subSport && ` · ${t(`subSports.${g.subSport}`)}`}
          {g.goalType === 'stage' && ` · ${t('goals.stagesCount', { count: g.stages.length })}`}
          {g.sport === 'triathlon' && ` · ${t(`triathlon.presets.${g.triPreset ?? 'custom'}`)}`}
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
      {d.tri && <TriDiagnosis tri={d.tri} targetTimeS={d.targetTimeS} weeksToEvent={x.weeksToEvent} />}
    </section>
  )
}

const LEG_TONE = { swim: 'sky', bike: 'mint', run: 'coral' } as const
const LEG_ICON = { swim: 'swim', bike: 'bike', run: 'run' } as const

/** Triatlón: barra por disciplina, recomendación para la más atrasada y tiempos por tramo. */
function TriDiagnosis({ tri, targetTimeS, weeksToEvent }: { tri: NonNullable<GoalDiagnosis['tri']>; targetTimeS: number | null; weeksToEvent: number }) {
  const { t } = useTranslation()
  const weak = tri.legs.find((l) => l.leg === tri.weakest)
  const hasTimes = tri.legs.some((l) => l.estimateS || l.targetS)
  return (
    <div className="tri-diag">
      <h3 className="tri-diag-title">{t('triathlon.byDiscipline')}</h3>
      <ul className="tri-diag-bars">
        {tri.legs.map((l, i) => (
          <li key={l.leg} className={`tri-diag-row lstatus-${l.status}`} style={{ animationDelay: `${i * 90}ms` }}>
            <span className={`kpi-icon kpi-${LEG_TONE[l.leg]}`} aria-hidden="true">
              <Icon name={LEG_ICON[l.leg]} />
            </span>
            <span className="tri-diag-main">
              <span className="tri-diag-head">
                <strong>{t(`triathlon.legs.${l.leg}`)}</strong>
                <span className={`gstatus gstatus-${l.status === 'on_track' ? 'good' : l.status === 'tight' ? 'caution' : 'alert'}`}>
                  {l.status === 'no_data' ? t('triathlon.noData') : `${Math.min(l.pct, 199)} %`}
                </span>
              </span>
              <span
                className="goal-card-bar"
                role="img"
                aria-label={
                  l.status === 'no_data'
                    ? `${t(`triathlon.legs.${l.leg}`)}: ${t('triathlon.noData')}`
                    : t('triathlon.barLabel', { leg: t(`triathlon.legs.${l.leg}`), pct: l.pct, now: l.ctl, target: l.targetCtl })
                }
              >
                <span
                  className={`goal-card-fill fill-${l.status === 'on_track' ? 'good' : l.status === 'tight' ? 'caution' : 'alert'}`}
                  style={{ width: `${l.status === 'no_data' ? 0 : Math.min(100, l.pct)}%` }}
                />
              </span>
            </span>
          </li>
        ))}
      </ul>
      {weak && (
        <p className="tri-advice">
          <Icon name="bulb" />{' '}
          {weeksToEvent < 2
            ? t('triathlon.adviceNear')
            : weak.status === 'no_data'
              ? t('triathlon.adviceNoData', { leg: t(`triathlon.legs.${weak.leg}`).toLowerCase() })
              : t(`triathlon.advice.${weak.leg}`)}
        </p>
      )}
      {hasTimes && (
        <table className="tri-times">
          <caption>{t('triathlon.timesTitle')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('triathlon.leg')}</th>
              <th scope="col">{t('triathlon.estimated')}</th>
              <th scope="col">{t('triathlon.target')}</th>
            </tr>
          </thead>
          <tbody>
            {tri.legs.map((l) => (
              <tr key={l.leg}>
                <th scope="row">
                  <Icon name={LEG_ICON[l.leg]} /> {t(`triathlon.legs.${l.leg}`)}
                </th>
                <td className={`num${l.estimateS && l.targetS && l.estimateS > l.targetS * 1.05 ? ' is-behind' : ''}`}>
                  {l.estimateS ? formatClock(l.estimateS) : '—'}
                </td>
                <td className="num">{l.targetS ? formatClock(l.targetS) : '—'}</td>
              </tr>
            ))}
            <tr className="tri-times-total">
              <th scope="row">{t('triathlon.total')}</th>
              <td className="num">{tri.estimateS ? formatClock(tri.estimateS) : '—'}</td>
              <td className="num">{targetTimeS ? formatClock(targetTimeS) : tri.cutoffS ? `${t('triathlon.cutoff')} ${formatClock(tri.cutoffS)}` : '—'}</td>
            </tr>
          </tbody>
        </table>
      )}
      {tri.legs.some((l) => !l.estimateS) && <p className="muted small">{t('triathlon.estimateNeeds')}</p>}
    </div>
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
  const [deleting, setDeleting] = useState(false)
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
    setDeleting(true)
    try {
      await repo.deleteGoal(g!.id)
      await qc.invalidateQueries()
    } catch {
      setDeleting(false)
      toast(t('errors.saveFailed'), { icon: 'alert' })
      return
    }
    toast(t('toast.goalDeleted'), { icon: 'trash' })
    navigate('/metas')
  }

  return (
    <Page title={g.name} headerTitle={t('goals.title')}>
      <GoalHero goal={g} days={days} />

      {g.sport === 'triathlon' && g.legs && <TriLegsCard legs={g.legs} />}
      <ul className="goal-tiles">
        {g.sport !== 'triathlon' && tot.distanceM > 0 && (
          <Tile icon="route" tone="mint" label={t('activities.distance')} value={formatDistance(tot.distanceM)} />
        )}
        {tot.elevationGainM > 0 && (
          <Tile
            icon="mountain"
            tone="amber"
            label={g.sport === 'triathlon' ? t('goals.triBikeElevationShort') : t('goals.elevationGain')}
            value={`↑ ${formatElevation(tot.elevationGainM)}`}
          />
        )}
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

      <RaceFuelCard goal={g} />

      {g.status === 'active' && <PlanSection goalName={g.name} until={addDays(g.eventDate, Math.max(0, ...g.stages.map((x) => x.dayOffset)) + 7)} />}

      <div className="row">
        <Link className="btn btn-primary" to={`/metas/${g.id}/editar`}>
          {t('goals.edit')}
        </Link>
        <Link className="btn btn-secondary" to="/plan">
          {t('plan.title')}
        </Link>
        <Link className="btn btn-secondary" to="/temporada">
          {t('season.title')}
        </Link>
        <BusyButton type="button" className="btn btn-danger" busy={deleting} busyLabel={t('common.deleting')} onClick={() => void remove()}>
          {t('goals.delete')}
        </BusyButton>
      </div>
    </Page>
  )
}

const LEGS = [
  { k: 'swim', icon: 'swim', tone: 'sky', m: 'swimM', s: 'swimS' },
  { k: 'bike', icon: 'bike', tone: 'mint', m: 'bikeM', s: 'bikeS' },
  { k: 'run', icon: 'run', tone: 'coral', m: 'runM', s: 'runS' },
] as const

/** Los tres tramos del triatlón: distancia y objetivo de cada uno. */
function TriLegsCard({ legs }: { legs: TriLegs }) {
  const { t } = useTranslation()
  const total = legs.swimM + legs.bikeM + legs.runM
  return (
    <section className="card tri-legs-card" aria-labelledby="legs-h">
      <h2 id="legs-h" className="card-title-icon">
        <span className="icon-tile">
          <Icon name="route" />
        </span>
        {t('goals.triLegsTitle')}
      </h2>
      <ol className="tri-legs">
        {LEGS.map((x, i) => (
          <li key={x.k} className={`tri-leg tri-leg-${x.k}`} style={{ animationDelay: `${i * 80}ms` }}>
            <span className={`kpi-icon tri-leg-tile kpi-${x.tone}`} aria-hidden="true">
              <Icon name={x.icon} />
            </span>
            <span className="tri-leg-text">
              <strong>{t(`triathlon.legs.${x.k}`)}</strong>
              <span className="num">{formatDistance(legs[x.m])}</span>
            </span>
            {legs[x.s] ? (
              <span className="tri-leg-target">
                <Icon name="timer" /> <span className="num">{formatClock(legs[x.s]!)}</span>
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="tri-bar" aria-hidden="true">
        {LEGS.map((x) => (
          <span key={x.k} className={`tri-bar-${x.k}`} style={{ flexGrow: legs[x.s] ?? legs[x.m] / total }} />
        ))}
      </div>
      <p className="muted small">{t('goals.triNoTransitions')}</p>
    </section>
  )
}
