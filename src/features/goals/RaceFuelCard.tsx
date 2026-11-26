import { useState } from 'react'
import { Link } from 'react-router'
import { LegalNotice } from '../plan/SessionView'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../../components/ui/Icon'
import { raceFuelPlan, type RaceSegment, type RaceSport } from '../../core/nutrition/race'
import { estimateHours } from '../../core/season'
import { formatClock, formatNumber } from '../../core/units'
import { latestWeight } from '../../data/analysis'
import { useWeights } from '../../data/hooks'
import { triLegMinutes } from '../../data/planService'
import type { Goal } from '../../data/types'
import { usePlan } from '../plan/usePlan'
import { goalEstimatedHours } from './goalUtils'

const SPORT_ICON: Record<RaceSport, IconName> = { swimming: 'swim', cycling: 'bike', running: 'run', other: 'activity' }
const asRaceSport = (s: string): RaceSport => (s === 'swimming' || s === 'cycling' || s === 'running' ? s : 'other')

/** Tramos de la carrera (o de cada etapa) con su duración prevista. */
function raceDays(g: Goal, estimateS: number | null): RaceSegment[][] {
  if (g.sport === 'triathlon' && g.legs) {
    const m = triLegMinutes(g.legs)
    return [
      [
        { sport: 'swimming', minutes: m.swim },
        { sport: 'cycling', minutes: m.bike },
        { sport: 'running', minutes: m.run },
      ],
    ]
  }
  const sport = asRaceSport(g.sport)
  if (g.goalType === 'stage' && g.stages.length) {
    return g.stages.map((st) => [
      { sport, minutes: st.targetTimeS ? st.targetTimeS / 60 : estimateHours(g.sport, st.distanceM, st.elevationGainM, st.terrain ?? g.terrain) * 60 },
    ])
  }
  const secs = g.objective === 'time' && g.targetTimeS ? g.targetTimeS : (estimateS ?? goalEstimatedHours(g) * 3600)
  return [[{ sport, minutes: secs / 60 }]]
}

/** Plan de alimentación para el día de la carrera (todas las metas; por etapa si hay varias). */
export function RaceFuelCard({ goal }: { goal: Goal }) {
  const { t } = useTranslation()
  const weights = useWeights()
  const { derived } = usePlan()
  const [hot, setHot] = useState(false)
  const [stage, setStage] = useState(0)
  const kg = latestWeight(weights.data ?? [])
  const est = derived?.diagnoses.find((x) => x.goalId === goal.id)?.estimate?.seconds ?? null
  const days = raceDays(goal, est)
  const segments = days[Math.min(stage, days.length - 1)]
  const plan = kg ? raceFuelPlan({ segments, weightKg: kg, hot }) : null
  const nums = (r: [number, number]) => (r[0] === r[1] ? formatNumber(r[0]) : `${formatNumber(r[0])}–${formatNumber(r[1])}`)

  return (
    <section className="card race-fuel" aria-labelledby="fuel-h">
      <h2 id="fuel-h" className="card-title-icon">
        <span className="icon-tile icon-tile-coral">
          <Icon name="food" />
        </span>
        {t('raceFuel.title')}
      </h2>
      <p className="muted">{t('raceFuel.intro')}</p>
      {!kg ? (
        <p className="tri-advice">
          <Icon name="scale" /> {t('raceFuel.needWeight')} <Link to="/perfil">{t('nav.profile')} →</Link>
        </p>
      ) : (
        <>
          <div className="race-fuel-controls">
            {days.length > 1 && (
              <div className="tag-row" role="group" aria-label={t('raceFuel.stage')}>
                {days.map((_, i) => (
                  <button key={i} type="button" className={`tag-opt${i === stage ? ' is-on' : ''}`} aria-pressed={i === stage} onClick={() => setStage(i)}>
                    {t('goals.stageN', { n: i + 1 })}
                  </button>
                ))}
              </div>
            )}
            <label className={`tag-opt${hot ? ' is-on' : ''}`}>
              <input type="checkbox" className="visually-hidden" checked={hot} onChange={(e) => setHot(e.target.checked)} />
              <Icon name="sun" /> {t('raceFuel.hot')}
            </label>
          </div>

          <ol className="fuel-steps">
            {plan!.carbLoading && (
              <li>
                <span className="fuel-step-icon tone-amber" aria-hidden="true">
                  <Icon name="wheat" />
                </span>
                <div>
                  <strong>{t('raceFuel.loadingTitle')}</strong>
                  <p>{t('raceFuel.loading', { from: formatNumber(plan!.carbLoading.fromG), to: formatNumber(plan!.carbLoading.toG) })}</p>
                </div>
              </li>
            )}
            <li>
              <span className="fuel-step-icon tone-mint" aria-hidden="true">
                <Icon name="sunrise" />
              </span>
              <div>
                <strong>{t('raceFuel.breakfastTitle', { hours: plan!.breakfast.hoursBefore })}</strong>
                <p>{t('raceFuel.breakfast', { carbs: formatNumber(plan!.breakfast.carbsG), ml: formatNumber(plan!.breakfast.fluidMl) })}</p>
              </div>
            </li>
            {plan!.segments.map((s, i) => (
              <li key={i} className={`fuel-seg fuel-seg-${s.sport}`}>
                <span className={`fuel-step-icon tone-${s.sport === 'swimming' ? 'sky' : s.sport === 'running' ? 'coral' : 'mint'}`} aria-hidden="true">
                  <Icon name={SPORT_ICON[s.sport]} />
                </span>
                <div>
                  <strong>
                    {goal.sport === 'triathlon' ? t(`raceFuel.leg.${s.sport}`) : t('raceFuel.during')}{' '}
                    <span className="muted num">~{formatClock(Math.round(s.minutes * 60))}</span>
                  </strong>
                  {s.carbsG === 0 && s.fluidMl === 0 ? (
                    <p>{t(`raceFuel.tip.${s.tip}`)}</p>
                  ) : (
                    <>
                      <ul className="fuel-rates">
                        <li>
                          <Icon name="flame" /> {t('raceFuel.carbsRate', { r: nums(s.carbsPerHour) })}
                        </li>
                        <li>
                          <Icon name="drop" /> {t('raceFuel.fluidRate', { r: nums(s.fluidMlPerHour) })}
                        </li>
                        {s.sodiumMgPerHour && (
                          <li>
                            <Icon name="sparkles" /> {t('raceFuel.sodiumRate', { r: nums(s.sodiumMgPerHour) })}
                          </li>
                        )}
                      </ul>
                      <p className="fuel-count">
                        ≈ <strong>{t('raceFuel.gels', { count: s.gels })}</strong> ·{' '}
                        <strong>{t('raceFuel.bottles', { count: s.bottles, n: formatNumber(s.bottles, s.bottles % 1 ? 1 : 0) })}</strong>
                      </p>
                      <p className="muted small">{t(`raceFuel.tip.${s.tip}`)}</p>
                    </>
                  )}
                </div>
              </li>
            ))}
            <li>
              <span className="fuel-step-icon tone-sky" aria-hidden="true">
                <Icon name="egg" />
              </span>
              <div>
                <strong>{t('raceFuel.afterTitle')}</strong>
                <p>{t('raceFuel.after', { protein: formatNumber(plan!.after.proteinG), carbs: formatNumber(plan!.after.carbsG) })}</p>
              </div>
            </li>
          </ol>

          {plan!.totals.carbsG > 0 && (
            <ul className="fuel-totals" aria-label={t('raceFuel.totalsLabel')}>
              <li>
                <strong className="num">{formatNumber(plan!.totals.carbsG)} g</strong>
                <span>{t('raceFuel.totalCarbs')}</span>
              </li>
              <li>
                <strong className="num">{plan!.totals.gels}</strong>
                <span>{t('raceFuel.totalGels')}</span>
              </li>
              <li>
                <strong className="num">{formatNumber(plan!.totals.bottles, 1)}</strong>
                <span>{t('raceFuel.totalBottles')}</span>
              </li>
              {plan!.totals.sodiumMg > 0 && (
                <li>
                  <strong className="num">{formatNumber(plan!.totals.sodiumMg)} mg</strong>
                  <span>{t('raceFuel.totalSodium')}</span>
                </li>
              )}
            </ul>
          )}
          <LegalNotice id="race" text={t('raceFuel.legal')} />
        </>
      )}
    </section>
  )
}
