import { Icon, TitleIcon } from '../../components/ui/Icon'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { addDays } from '../../core/dates'
import { effectiveRange, labStatus } from '../../core/labs/catalog'
import { DISMISS_DAYS, evaluate, visible, type RecContext, type Recommendation } from '../../core/recommendations/rules'
import { physiologyOn } from '../../data/analysis'
import { useCheckins, useFitness, useGoals, useHealth, usePhysiology, useProfile, useRepoMutation, useWeights } from '../../data/hooks'
import { groupLabs } from '../../data/labs'
import { useRepo } from '../../data/RepoProvider'
import type { Goal, PhysiologyEntry, WeightEntry } from '../../data/types'
import { goalEstimatedHours, goalTotals } from '../goals/goalUtils'
import { usePlan } from '../plan/usePlan'

function hrRestTrend(entries: PhysiologyEntry[], today: string): RecContext['hrRest'] {
  const withHr = entries.filter((e) => e.hrRest && e.effectiveFrom >= addDays(today, -120)).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  if (withHr.length < 3) return null
  const latest = withHr[withHr.length - 1]
  if (latest.effectiveFrom < addDays(today, -7)) return null
  const prev = withHr.slice(0, -1).map((e) => e.hrRest!)
  return { latest: latest.hrRest!, baseline: Math.round(prev.reduce((a, x) => a + x, 0) / prev.length) }
}

function weightTrend(weights: WeightEntry[], today: string): RecContext['weight'] {
  const sorted = [...weights].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
  const latest = sorted.at(-1)
  if (!latest || latest.measuredOn < addDays(today, -7)) return null
  const prev = sorted.filter((w) => w.measuredOn <= addDays(latest.measuredOn, -10) && w.measuredOn >= addDays(latest.measuredOn, -21)).at(-1)
  if (!prev) return null
  const days = Math.round((Date.parse(latest.measuredOn) - Date.parse(prev.measuredOn)) / 86_400_000)
  return { latestKg: latest.weightKg, previousKg: prev.weightKg, days }
}

function goalInfo(goals: Goal[], today: string): RecContext['goal'] {
  const g = goals
    .filter((x) => x.status === 'active' && x.eventDate >= today)
    .sort((a, b) => (a.priority === b.priority ? a.eventDate.localeCompare(b.eventDate) : a.priority === 'primary' ? -1 : 1))[0]
  if (!g) return null
  const stage = g.goalType === 'stage' && g.stages.length > 0
  const days = stage ? Math.max(1, ...g.stages.map((s) => s.dayOffset + 1)) : 1
  const hours = g.targetTimeS ? g.targetTimeS / 3600 : goalEstimatedHours(g)
  const elevation = stage ? Math.max(...g.stages.map((s) => s.elevationGainM)) : goalTotals(g).elevationGainM
  return { id: g.id, name: g.name, eventDate: g.eventDate, hoursPerDay: hours / days, elevationGainM: elevation || null }
}

/** Arma el contexto con los datos de la persona y evalúa las reglas. */
export function useRecommendations() {
  const { t } = useTranslation()
  const fit = useFitness()
  const goals = useGoals()
  const plan = usePlan()
  const phys = usePhysiology()
  const weights = useWeights()
  const health = useHealth()
  const profile = useProfile()
  const checkins = useCheckins(7)
  const derived = plan.derived

  return useMemo(() => {
    if (!fit.loaded || !goals.data || !phys.data || !weights.data) return null
    const today = fit.today
    const from28 = addDays(today, -28)
    const recent = fit.loaded.filter((l) => l.day >= from28 && l.day <= today)
    const ph = physiologyOn(phys.data, today)
    const sex = profile.data?.sexForFormulas ?? null
    const labsOut = groupLabs(health.data ?? [], (k) => t(`labs.catalog.${k}`))
      .filter((g) => {
        const last = g.results[g.results.length - 1]
        const s = labStatus(last.data.value!, effectiveRange(last.data, sex).range)
        return s === 'low' || s === 'high'
      })
      .map((g) => g.name)
    const recentSessions = derived
      ? derived.plan.sessions
          .filter((s) => s.date >= addDays(today, -14) && s.date < today && s.kind !== 'rest')
          .map((s) => ({ date: s.date, status: derived.matches.get(s.id)?.status ?? 'pending' }))
      : []
    const ctx: RecContext = {
      today,
      snapshot: fit.overview?.snapshot ?? null,
      weeks: fit.overview?.weeks ?? [],
      recentSessions,
      goal: goalInfo(goals.data, today),
      longestMin: Math.round(Math.max(0, ...recent.map((l) => (l.activity.movingS || l.activity.elapsedS) / 60))),
      elevationM: recent.reduce((a, l) => a + (l.activity.elevationGainM ?? 0), 0),
      hasThreshold: Boolean(ph?.hrThreshold || ph?.ftpW),
      hasHrMax: Boolean(ph?.hrMax),
      hasActivities: fit.loaded.length > 0,
      hrRest: hrRestTrend(phys.data, today),
      weight: weightTrend(weights.data, today),
      labsOutOfRange: labsOut,
      checkins: checkins.data ?? [],
    }
    return { today, all: evaluate(ctx) }
  }, [fit.loaded, fit.overview, fit.today, goals.data, phys.data, weights.data, health.data, profile.data, derived, checkins.data, t])
}

/** Recomendaciones visibles hoy (sin las ocultadas), con la acción de ocultar. */
export function useVisibleRecs() {
  const { t } = useTranslation()
  const repo = useRepo()
  const recs = useRecommendations()
  const state = useQuery({ queryKey: ['recState'], queryFn: () => repo.listRecommendationState() })
  const dismiss = useRepoMutation(
    ({ key, reaction, today }: { key: string; reaction: 'ok' | 'not_applicable'; today: string }) =>
      repo.dismissRecommendation(key, reaction, addDays(today, DISMISS_DAYS)),
    [['recState']],
    { success: t('toast.recHidden'), icon: 'check' },
  )
  const shown = recs && state.data ? visible(recs.all, state.data, recs.today) : null
  return { shown, today: recs?.today ?? '', dismiss }
}

export function RecommendationsCard({ bare = false }: { bare?: boolean }) {
  const { t } = useTranslation()
  const { shown, today, dismiss } = useVisibleRecs()
  if (!shown) return null
  if (shown.length === 0) {
    return bare ? (
      <p className="recs-empty">
        <span className="recs-empty-icon" aria-hidden="true">
          <Icon name="check" />
        </span>
        {t('recs.none')}
      </p>
    ) : null
  }
  const list = (
    <>
      <ul className="plain-list recs">
        {shown.map((r, i) => (
          <RecItem
            key={r.key}
            rec={r}
            index={i}
            onDismiss={(reaction) => dismiss.mutate({ key: r.key, reaction, today })}
            busy={dismiss.isPending}
            working={dismiss.isPending && dismiss.variables?.key === r.key ? dismiss.variables.reaction : null}
          />
        ))}
      </ul>
      <p className="muted">{t('recs.hiddenFor')}</p>
    </>
  )
  if (bare) return list
  return (
    <section className="card" aria-labelledby="recs-h" id="recomendaciones">
      <h2 id="recs-h" className="card-title-icon">
        <TitleIcon name="bulb" tone="coral" />
        {t('recs.title')}
      </h2>
      {list}
    </section>
  )
}

function RecItem({
  rec,
  index = 0,
  onDismiss,
  busy,
  working = null,
}: {
  rec: Recommendation
  index?: number
  onDismiss: (r: 'ok' | 'not_applicable') => void
  busy: boolean
  working?: 'ok' | 'not_applicable' | null
}) {
  const { t } = useTranslation()
  const id = `rec-${rec.key}`
  return (
    <li className={`rec rec-${rec.severity}`} style={{ animationDelay: `${index * 60}ms` }}>
      <h3 id={id}>
        {rec.severity === 'high' && '⚠ '}
        {t(`recs.${rec.key}.title`)}
      </h3>
      <p>{t(`recs.${rec.key}.body`)}</p>
      <p className="muted">
        <strong>{t('recs.why')}</strong>
        {t(`recs.${rec.key}.why`, rec.params)}
      </p>
      <div className="row">
        {rec.link && <Link to={rec.link.to}>{t(`recs.link.${rec.link.label}`)}</Link>}
        <button
          type="button"
          className="btn btn-secondary btn-small"
          disabled={busy}
          aria-busy={working === 'ok' || undefined}
          onClick={() => onDismiss('ok')}
          aria-label={`${t('recs.ok')}: ${t(`recs.${rec.key}.title`)}`}
        >
          {t('recs.ok')}
        </button>
        <button
          type="button"
          className="btn-link"
          disabled={busy}
          aria-busy={working === 'not_applicable' || undefined}
          onClick={() => onDismiss('not_applicable')}
          aria-label={`${t('recs.notApplicable')}: ${t(`recs.${rec.key}.title`)}`}
        >
          {t('recs.notApplicable')}
        </button>
      </div>
    </li>
  )
}
