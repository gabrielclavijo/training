import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui/EmptyState'
import { NumberField, SelectField, parseNum } from '../../components/ui/Field'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { daysBetween, formatDate, localDayKey } from '../../core/dates'
import { buildSeason, type BlockKind } from '../../core/season'
import { keys, useGoals, usePauses, useRepoMutation } from '../../data/hooks'
import { useRepo } from '../../data/RepoProvider'
import type { PauseAvailability, PauseKind } from '../../data/types'
import { toSeasonGoal } from '../goals/goalUtils'

const fmt = (d: string) => formatDate(`${d}T12:00:00Z`)
const BLOCK_ICON: Record<BlockKind, string> = { build: '▲', taper: '▽', event: '★', recovery: '◌' }

export { PausesSection }

export function SeasonPage() {
  const { t } = useTranslation()
  const goals = useGoals()
  const pauses = usePauses()
  const today = localDayKey(new Date())

  if (goals.isLoading) return <Page title={t('season.title')}><Spinner full /></Page>
  if (goals.error) return <Page title={t('season.title')}><Alert kind="error">{t('errors.generic')}</Alert></Page>

  const active = (goals.data ?? []).filter((g) => g.status === 'active')
  if (active.length === 0) {
    return (
      <Page title={t('season.title')}>
        <EmptyState icon="calendar" title={t('season.noGoals')} actionLabel={t('goals.new')} actionTo="/metas/nueva" />
        <PausesSection />
      </Page>
    )
  }
  const season = buildSeason(active.map(toSeasonGoal), today)
  const byId = new Map(active.map((g) => [g.id, g]))
  const lastDay = season.blocks.at(-1)?.endsOn ?? today
  const span = Math.max(1, daysBetween(today, lastDay))
  const pct = (d: string) => Math.min(100, Math.max(0, (daysBetween(today, d) / span) * 100))

  return (
    <Page title={t('season.title')}>
      <p className="muted">{t('season.intro')}</p>

      {season.warnings.map((w) => (
        <Alert key={w.goalId + w.kind} kind="warning">
          {w.kind === 'overlap'
            ? t('season.warningOverlap', { goal: byId.get(w.goalId)?.name, previous: byId.get(w.previousGoalId)?.name, days: w.daysBetween, recovery: w.recoveryDays })
            : t('season.warningTight', { goal: byId.get(w.goalId)?.name, previous: byId.get(w.previousGoalId)?.name })}
          <br />
          <strong>{t('season.suggestionsTitle')}</strong>
          <ul>
            {w.suggestions.map((s) => (
              <li key={s}>{t(`season.suggestions.${s}`)}</li>
            ))}
          </ul>
        </Alert>
      ))}

      {/* Línea de tiempo: decorativa; la información completa está en la lista de abajo */}
      <div className="timeline" aria-hidden="true">
        {season.blocks.map((b, i) => (
          <div
            key={i}
            className={`tl-block tl-${b.kind}`}
            style={{ left: `${pct(b.startsOn)}%`, width: `${Math.max(0.8, pct(b.endsOn) - pct(b.startsOn))}%` }}
            title={`${byId.get(b.goalId)?.name}: ${t(`season.blocks.${b.kind}`)}`}
          >
            {b.kind === 'event' ? '★' : ''}
          </div>
        ))}
        {(pauses.data ?? []).filter((p) => p.startsOn >= today).map((p) => (
          <div key={p.id} className="tl-pause" style={{ left: `${pct(p.startsOn)}%`, width: `${Math.max(0.8, pct(p.endsOn ?? p.startsOn) - pct(p.startsOn))}%` }} />
        ))}
      </div>
      <ul className="legend-list" aria-hidden="true">
        {(['build', 'taper', 'event', 'recovery'] as BlockKind[]).map((k) => (
          <li key={k}>
            <span className={`legend-swatch tl-${k}`} /> {BLOCK_ICON[k]} {t(`season.blocks.${k}`)}
          </li>
        ))}
        <li>
          <span className="legend-swatch tl-pause" /> {t('season.pauses')}
        </li>
      </ul>

      <h2>{t('season.listView')}</h2>
      <ol className="season-list">
        {season.goals.map((g) => (
          <li key={g.id} className="card">
            <h3>
              <Link to={`/metas/${g.id}`}>{g.name}</Link>{' '}
              <span className="muted">({g.priority === 'primary' ? t('goals.primary') : t('goals.secondary')})</span>
            </h3>
            <ul className="plain-list">
              {season.blocks
                .filter((b) => b.goalId === g.id)
                .map((b) => (
                  <li key={b.kind}>
                    <span aria-hidden="true">{BLOCK_ICON[b.kind]} </span>
                    <strong>{t(`season.blocks.${b.kind}`)}</strong>: {t('season.from', { from: fmt(b.startsOn), to: fmt(b.endsOn) })} ({t('season.days', { count: daysBetween(b.startsOn, b.endsOn) + 1 })})
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ol>
      <PausesSection />
    </Page>
  )
}

const KINDS: PauseKind[] = ['illness', 'injury', 'travel', 'vacation', 'other']
const AVAILABLE: PauseAvailability[] = ['bike', 'run', 'gym', 'pool']

function PausesSection() {
  const { t } = useTranslation()
  const repo = useRepo()
  const pauses = usePauses()
  const [kind, setKind] = useState<PauseKind>('travel')
  const [from, setFrom] = useState(localDayKey(new Date()))
  const [to, setTo] = useState('')
  const [canTrain, setCanTrain] = useState<boolean | null>(true)
  const [available, setAvailable] = useState<PauseAvailability[]>([])
  const [minutes, setMinutes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useRepoMutation(
    () =>
      repo.savePause({
        kind,
        startsOn: from,
        endsOn: to || null,
        canTrain,
        available: canTrain ? available : ['none'],
        minutesPerDay: canTrain ? parseNum(minutes) : 0,
        notes: null,
      }),
    [keys.pauses, ['plan']],
  )
  const del = useRepoMutation((id: string) => repo.deletePause(id), [keys.pauses, ['plan']])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (to && to < from) return setError(t('activities.mustBePositive'))
    setError(null)
    await save.mutateAsync(undefined)
    setTo('')
    setAvailable([])
    setMinutes('')
  }
  const isIllness = kind === 'illness' || kind === 'injury'

  return (
    <section className="card" aria-labelledby="pauses-h">
      <h2 id="pauses-h">{t('season.pauses')}</h2>
      <p className="muted">{t('season.pausePhase2')}</p>
      <ul className="plain-list">
        {(pauses.data ?? []).map((p) => (
          <li key={p.id} className="row-between">
            <span>
              <strong>{t(`season.pauseKinds.${p.kind}`)}</strong>: {t('season.from', { from: fmt(p.startsOn), to: p.endsOn ? fmt(p.endsOn) : '…' })}
              <br />
              <span className="muted">
                {p.canTrain && p.available.length && !p.available.includes('none')
                  ? `${t('season.pauseAvailable', { list: p.available.map((a) => t(`season.available.${a}`)).join(', ') })}${p.minutesPerDay ? ` · ${p.minutesPerDay} min/día` : ''}`
                  : t('season.pauseNone')}
              </span>
            </span>
            <button type="button" className="btn-link" onClick={() => del.mutate(p.id)}>
              {t('season.deletePause')}
            </button>
          </li>
        ))}
      </ul>
      <details className="table-toggle">
        <summary>{t('season.addPause')}</summary>
        <form onSubmit={onSubmit} noValidate style={{ marginTop: 'var(--space-3)' }}>
          {error && <Alert kind="error">{error}</Alert>}
          <SelectField label={t('season.pauseKind')} value={kind} onChange={(e) => setKind(e.target.value as PauseKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`season.pauseKinds.${k}`)}
              </option>
            ))}
          </SelectField>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="p-from">{t('season.pauseStart')}</label>
              <input id="p-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="p-to">
                {t('season.pauseEnd')} <span className="muted">({t('common.optional')})</span>
              </label>
              <input id="p-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          {!isIllness && (
            <>
              <fieldset>
                <legend className="legend">{t('season.pauseCanTrain')}</legend>
                <div className="row">
                  <label className="choice">
                    <input type="radio" name="can" checked={canTrain === true} onChange={() => setCanTrain(true)} /> {t('season.yes')}
                  </label>
                  <label className="choice">
                    <input type="radio" name="can" checked={canTrain === false} onChange={() => setCanTrain(false)} /> {t('season.no')}
                  </label>
                </div>
              </fieldset>
              {canTrain && (
                <>
                  <fieldset>
                    <legend className="legend">{t('season.pauseWith')}</legend>
                    <div className="row">
                      {AVAILABLE.map((a) => (
                        <label key={a} className="choice">
                          <input
                            type="checkbox"
                            checked={available.includes(a)}
                            onChange={(e) => setAvailable(e.target.checked ? [...available, a] : available.filter((x) => x !== a))}
                          />
                          {t(`season.available.${a}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <NumberField label={t('season.pauseMinutes')} optional inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                </>
              )}
            </>
          )}
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {t('season.savePause')}
          </button>
        </form>
      </details>
    </section>
  )
}
