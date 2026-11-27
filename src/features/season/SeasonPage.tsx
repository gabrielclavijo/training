import { Icon, TitleIcon, type IconName } from '../../components/ui/Icon'
import { BusyButton } from '../../components/ui/Busy'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { PlanSection } from '../plan/PlanCalendar'
import { useToast } from '../../components/fx/Toast'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui/EmptyState'
import { Explainer } from '../../components/ui/Explainer'
import { NumberField, parseWhole } from '../../components/ui/Field'
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

function SeasonExplainer() {
  const { t } = useTranslation()
  return (
    <Explainer
      id="season"
      icon="calendar"
      title={t('season.whatTitle')}
      points={[
        ['flag', t('season.whatMany')],
        ['star', t('season.whatPrimary')],
        ['trend', t('season.whatBlocks')],
      ]}
    >
      {t('season.whatBody')}
    </Explainer>
  )
}

export function SeasonPage() {
  const { t } = useTranslation()
  const goals = useGoals()
  const pauses = usePauses()
  const today = localDayKey(new Date())

  if (goals.isLoading)
    return (
      <Page title={t('season.title')}>
        <Spinner full />
      </Page>
    )
  if (goals.error)
    return (
      <Page title={t('season.title')}>
        <Alert kind="error">{t('errors.generic')}</Alert>
      </Page>
    )

  const active = (goals.data ?? []).filter((g) => g.status === 'active')
  if (active.length === 0) {
    return (
      <Page title={t('season.title')}>
        <SeasonExplainer />
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
    <Page
      title={t('season.title')}
      actions={
        <Link className="btn btn-secondary" to="/plan">
          {t('plan.title')}
        </Link>
      }
    >
      <SeasonExplainer />

      {season.warnings.map((w) => (
        <Alert key={w.goalId + w.kind} kind="warning">
          {w.kind === 'overlap'
            ? t('season.warningOverlap', {
                goal: byId.get(w.goalId)?.name,
                previous: byId.get(w.previousGoalId)?.name,
                days: w.daysBetween,
                recovery: w.recoveryDays,
              })
            : t('season.warningTight', { goal: byId.get(w.goalId)?.name, previous: byId.get(w.previousGoalId)?.name })}
          <br />
          <strong>{t('season.suggestionsTitle')}</strong>
          <ul className="step-chips season-sugg">
            {w.suggestions.map((s) => (
              <li key={s}>
                <Icon name="bulb" /> {t(`season.suggestions.${s}`)}
              </li>
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
        {(pauses.data ?? [])
          .filter((p) => p.startsOn >= today)
          .map((p) => (
            <div
              key={p.id}
              className="tl-pause"
              style={{ left: `${pct(p.startsOn)}%`, width: `${Math.max(0.8, pct(p.endsOn ?? p.startsOn) - pct(p.startsOn))}%` }}
            />
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

      <PlanSection />

      <h2 className="card-title-icon">
        <TitleIcon name="calendar" tone="sky" />
        {t('season.listView')}
      </h2>
      <ol className="season-list">
        {season.goals.map((g) => (
          <li key={g.id} className="card">
            <h3 className="card-title-icon">
              <TitleIcon name="flag" tone={g.priority === 'primary' ? undefined : 'soft'} />
              <span>
                <Link to={`/metas/${g.id}`} className="tap-link">
                  {g.name}
                </Link>{' '}
                <span className="muted">({g.priority === 'primary' ? t('goals.primary') : t('goals.secondary')})</span>
              </span>
            </h3>
            <ol className="season-steps">
              {season.blocks
                .filter((b) => b.goalId === g.id)
                .map((b, i, arr) => {
                  const days = daysBetween(b.startsOn, b.endsOn) + 1
                  const maxDays = Math.max(...arr.map((x) => daysBetween(x.startsOn, x.endsOn) + 1))
                  return (
                    <li key={b.kind} style={{ animationDelay: `${i * 80}ms` }}>
                      <span className={`season-dot tl-${b.kind}`} aria-hidden="true">
                        {BLOCK_ICON[b.kind]}
                      </span>
                      <div className="season-step-body">
                        <div className="row-between">
                          <strong>{t(`season.blocks.${b.kind}`)}</strong>
                          <span className="chip">{t('season.days', { count: days })}</span>
                        </div>
                        <span className="muted">{t('season.from', { from: fmt(b.startsOn), to: fmt(b.endsOn) })}</span>
                        <span className="season-len" aria-hidden="true">
                          <span className={`tl-${b.kind}`} style={{ width: `${Math.max(4, (days / maxDays) * 100)}%` }} />
                        </span>
                      </div>
                    </li>
                  )
                })}
            </ol>
          </li>
        ))}
      </ol>
      <PausesSection />
    </Page>
  )
}

const PAUSE_ICON: Record<PauseKind, IconName> = { illness: 'heart', injury: 'alert', travel: 'route', vacation: 'sun', other: 'pause' }
const AVAIL_ICON: Record<string, IconName> = { bike: 'bike', run: 'run', gym: 'dumbbell', pool: 'swim', none: 'bed' }

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
  const toast = useToast()
  const details = useRef<HTMLDetailsElement>(null)
  const location = useLocation()
  // Desde el botón «+» → «Registrar pausa»: abre el formulario y lleva el foco ahí
  useEffect(() => {
    if (!(location.state as { newPause?: boolean } | null)?.newPause || !details.current) return
    details.current.open = true
    details.current.scrollIntoView({ block: 'start', behavior: 'smooth' })
    details.current.querySelector<HTMLInputElement>('input[name="pkind"]:checked')?.focus({ preventScroll: true })
  }, [location.state, pauses.data])
  const save = useRepoMutation(
    () =>
      repo.savePause({
        kind,
        startsOn: from,
        endsOn: to || null,
        canTrain,
        available: canTrain ? available : ['none'],
        minutesPerDay: canTrain ? parseWhole(minutes) : 0,
        notes: null,
      }),
    [keys.pauses, ['plan']],
  )
  const del = useRepoMutation((id: string) => repo.deletePause(id), [keys.pauses, ['plan']], { success: t('toast.deleted'), icon: 'trash' })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (to && to < from) return setError(t('activities.mustBePositive'))
    setError(null)
    await save.mutateAsync(undefined)
    toast(t('season.pauseSaved'), { icon: 'pause' })
    if (details.current) details.current.open = false
    setTo('')
    setAvailable([])
    setMinutes('')
  }
  const isIllness = kind === 'illness' || kind === 'injury'

  return (
    <section className="card" aria-labelledby="pauses-h">
      <h2 id="pauses-h" className="card-title-icon">
        <TitleIcon name="pause" tone="soft" />
        {t('season.pauses')}
      </h2>
      <p className="muted">{t('season.pausePhase2')}</p>
      <ul className="pause-list">
        {(pauses.data ?? []).map((p, i) => {
          const today = localDayKey(new Date())
          const state = p.startsOn > today ? 'upcoming' : !p.endsOn || p.endsOn >= today ? 'active' : 'past'
          const days = p.endsOn ? daysBetween(p.startsOn, p.endsOn) + 1 : null
          const trains = p.canTrain && p.available.length > 0 && !p.available.includes('none')
          return (
            <li key={p.id} className={`pause-card pause-${state}`} style={{ animationDelay: `${i * 60}ms` }}>
              <span className={`icon-tile pause-tile pause-tile-${p.kind}`} aria-hidden="true">
                <Icon name={PAUSE_ICON[p.kind]} />
              </span>
              <div className="pause-body">
                <div className="pause-top">
                  <strong>{t(`season.pauseKinds.${p.kind}`)}</strong>
                  <span className={`badge pause-state-${state}`}>{t(`season.pauseState.${state}`)}</span>
                  <button
                    type="button"
                    className="btn-icon"
                    disabled={del.isPending}
                    aria-busy={(del.isPending && del.variables === p.id) || undefined}
                    onClick={() => del.mutate(p.id)}
                    aria-label={`${t('season.deletePause')}: ${t(`season.pauseKinds.${p.kind}`)} ${fmt(p.startsOn)}`}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
                <span className="pause-dates">{t('season.from', { from: fmt(p.startsOn), to: p.endsOn ? fmt(p.endsOn) : '…' })}</span>
                <ul className="chips pause-chips">
                  {days && (
                    <li className="chip">
                      <Icon name="calendar" /> {t('season.days', { count: days })}
                    </li>
                  )}
                  {trains ? (
                    <>
                      {p.available.map((a) => (
                        <li key={a} className="chip">
                          <Icon name={AVAIL_ICON[a] ?? 'activity'} /> {t(`season.available.${a}`)}
                        </li>
                      ))}
                      {p.minutesPerDay ? (
                        <li className="chip chip-strong">
                          <Icon name="clock" /> {p.minutesPerDay} min/día
                        </li>
                      ) : null}
                    </>
                  ) : (
                    <li className="chip">
                      <Icon name="bed" /> {t('season.pauseNone')}
                    </li>
                  )}
                </ul>
              </div>
            </li>
          )
        })}
      </ul>
      <details className="add-toggle" id="nueva-pausa" ref={details}>
        <summary className="btn btn-primary">
          <Icon name="pause" /> {t('season.addPause')}
        </summary>
        <form onSubmit={onSubmit} noValidate className="pause-form">
          {error && <Alert kind="error">{error}</Alert>}
          <fieldset>
            <legend className="legend">{t('season.pauseKind')}</legend>
            <div className="kind-grid">
              {KINDS.map((k) => (
                <label key={k} className="kind-option">
                  <input type="radio" name="pkind" checked={kind === k} onChange={() => setKind(k)} />
                  <span>
                    <span className={`icon-tile pause-tile pause-tile-${k}`} aria-hidden="true">
                      <Icon name={PAUSE_ICON[k]} />
                    </span>
                    {t(`season.pauseKinds.${k}`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {kind === 'injury' && (
            <div className="notice-health" role="note">
              <Icon name="alert" />
              <p>{t('season.injuryFormWarn')}</p>
            </div>
          )}
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
              <fieldset className="toolbar-item">
                <legend className="legend">{t('season.pauseCanTrain')}</legend>
                <div className="pill-toggle">
                  <label>
                    <input type="radio" name="can" checked={canTrain === true} onChange={() => setCanTrain(true)} />
                    <span>{t('season.yes')}</span>
                  </label>
                  <label>
                    <input type="radio" name="can" checked={canTrain === false} onChange={() => setCanTrain(false)} />
                    <span>{t('season.no')}</span>
                  </label>
                </div>
              </fieldset>
              {canTrain && (
                <>
                  <fieldset>
                    <legend className="legend">{t('season.pauseWith')}</legend>
                    <div className="kind-grid kind-grid-4">
                      {AVAILABLE.map((a) => (
                        <label key={a} className="kind-option">
                          <input
                            type="checkbox"
                            checked={available.includes(a)}
                            onChange={(e) => setAvailable(e.target.checked ? [...available, a] : available.filter((x) => x !== a))}
                          />
                          <span>
                            <span className="icon-tile icon-tile-soft" aria-hidden="true">
                              <Icon name={AVAIL_ICON[a]} />
                            </span>
                            {t(`season.available.${a}`)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <NumberField label={t('season.pauseMinutes')} optional inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                </>
              )}
            </>
          )}
          <BusyButton type="submit" busy={save.isPending}>
            <Icon name="check" /> {t('season.savePause')}
          </BusyButton>
        </form>
      </details>
    </section>
  )
}
