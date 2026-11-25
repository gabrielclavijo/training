import { Icon, TitleIcon } from '../../components/ui/Icon'
import { BusyButton, useAction } from '../../components/ui/Busy'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LoadBadge } from '../../components/ui/Badges'
import { EmptyState } from '../../components/ui/EmptyState'
import { SelectField, TextField } from '../../components/ui/Field'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import type { Sport, SubSport } from '../../core/activity/types'
import { formatDate, formatDateTime } from '../../core/dates'
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatNumber,
  formatPacePer100m,
  formatPacePerKm,
  formatPower,
  formatSpeed,
} from '../../core/units'
import { loadsFor } from '../../data/analysis'
import { useHealth, usePhysiology, useProfile } from '../../data/hooks'
import { undoMerge } from '../../data/importer'
import { useRepo } from '../../data/RepoProvider'
import type { Activity, MergeRecord, StoredSource } from '../../data/types'
import { RpeSelect } from './RpeSelect'
import { SPORTS, SUBSPORTS } from './sports'
import { PoweredByStrava, ViewOnStrava } from '../strava/Brand'
import { stravaActivityUrl } from '../strava/strava'

export function ActivityDetailPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const repo = useRepo()
  const q = useQuery({
    queryKey: ['activity', id],
    queryFn: () => repo.getActivity(id),
  })

  if (q.isLoading)
    return (
      <Page title={t('activities.detail')}>
        <Spinner full />
      </Page>
    )
  if (q.error)
    return (
      <Page title={t('activities.detail')}>
        <Alert kind="error">{t('errors.generic')}</Alert>
      </Page>
    )
  if (!q.data) {
    // También es lo que ve alguien que intenta abrir la actividad de otra persona
    return (
      <Page title={t('errors.notFoundTitle')}>
        <EmptyState title={t('activities.notFound')} body={t('errors.notFoundBody')} actionLabel={t('activities.title')} actionTo="/actividades" />
      </Page>
    )
  }
  return <Detail activity={q.data.activity} merges={q.data.merges} />
}

function Detail({ activity: a, merges }: { activity: Activity; merges: MergeRecord[] }) {
  const { t } = useTranslation()
  const phys = usePhysiology()
  const profile = useProfile()
  const health = useHealth()
  const load = loadsFor([a], {
    physiology: phys.data ?? [],
    profile: profile.data ?? null,
    health: health.data ?? [],
  })[0].load
  const dur = a.movingS || a.elapsedS

  const stats: [string, string][] = [
    [t('activities.duration'), formatDuration(a.elapsedS)],
    ...(a.movingS && a.movingS !== a.elapsedS ? [[t('activities.moving'), formatDuration(a.movingS)] as [string, string]] : []),
    ...(a.distanceM ? [[t('activities.distance'), formatDistance(a.distanceM)] as [string, string]] : []),
    ...(a.elevationGainM ? [[t('activities.elevation'), formatElevation(a.elevationGainM)] as [string, string]] : []),
    ...(a.distanceM && a.sport === 'cycling' ? [[t('activities.speed'), formatSpeed(a.distanceM / dur)] as [string, string]] : []),
    ...(a.distanceM && a.sport === 'running' ? [[t('activities.pace'), formatPacePerKm(a.distanceM, dur)] as [string, string]] : []),
    ...(a.distanceM && a.sport === 'swimming' ? [[t('activities.pace'), formatPacePer100m(a.distanceM, dur)] as [string, string]] : []),
    ...(a.avgHr ? [[t('activities.avgHr'), formatHeartRate(a.avgHr)] as [string, string]] : []),
    ...(a.maxHr ? [[t('activities.maxHr'), formatHeartRate(a.maxHr)] as [string, string]] : []),
    ...(a.avgPowerW ? [[t('activities.avgPower'), formatPower(a.avgPowerW)] as [string, string]] : []),
    ...(a.normalizedPowerW ? [[t('activities.np'), formatPower(a.normalizedPowerW)] as [string, string]] : []),
    ...(a.avgCadence ? [[t('activities.cadence'), `${a.avgCadence}`] as [string, string]] : []),
  ]
  const channels = [
    ['hasHr', a.hasHr],
    ['hasPower', a.hasPower],
    ['hasGps', a.hasGps],
    ['hasCadence', a.hasCadence],
  ] as const

  return (
    <Page title={a.title ?? t(`sports.${a.sport}`)}>
      <p className="muted">
        {t(`sports.${a.sport}`)}
        {a.subSport && ` · ${t(`subSports.${a.subSport}`)}`} · {formatDateTime(a.startTime, { timeZone: a.timezone ?? undefined })}
      </p>

      <section className="card" aria-labelledby="stats-h">
        <h2 id="stats-h" className="visually-hidden">
          {t('activities.detail')}
        </h2>
        <dl className="stat-grid">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="muted" style={{ marginTop: 'var(--space-3)' }}>
          {t('activities.dataAvailable')}:{' '}
          {channels.map(([k, v], i) => (
            <span key={k}>
              {i > 0 && ' · '}
              {v ? '✓' : '✗'} {t(`activities.${k}`)}
              {!v && <span className="visually-hidden"> ({t('activities.no')})</span>}
            </span>
          ))}
        </p>
      </section>

      <section className="card" aria-labelledby="load-h">
        <h2 id="load-h" className="card-title-icon">
          <TitleIcon name="bolt" tone="coral" />
          {t('activities.loadTitle')}
        </h2>
        <p className="big-number">
          <Icon name="bolt" /> {load.load !== null ? t('load.points', { value: formatNumber(load.load) }) : t('load.noLoad')}
        </p>
        <p>
          {t('activities.loadMethod')}: <LoadBadge method={load.method} confidence={load.confidence} />
        </p>
        {load.hints.length > 0 && (
          <>
            <h3>{t('activities.howToImprove')}</h3>
            <ul className="step-chips">
              {load.hints.map((h) => (
                <li key={h}>
                  <Icon name="bulb" /> {t(`load.hints.${h}`)}
                </li>
              ))}
            </ul>
          </>
        )}
        <RpeForm activity={a} />
      </section>

      <StravaNotice activity={a} />
      <SourcesSection activity={a} merges={merges} />
      <EditSection activity={a} />
    </Page>
  )
}

function RpeForm({ activity }: { activity: Activity }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const qc = useQueryClient()
  const [rpe, setRpe] = useState<number | null>(activity.rpe)
  const [saved, setSaved] = useState(false)
  const save = useAction(async () => {
    await repo.updateActivity(activity.id, { rpe, rpeIsEstimated: false })
    await qc.invalidateQueries()
  })
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (await save.run()) setSaved(true)
  }
  return (
    <form onSubmit={onSubmit} noValidate style={{ marginTop: 'var(--space-4)' }}>
      {saved && <Alert kind="success">{t('common.saved')}</Alert>}
      <RpeSelect
        value={rpe}
        onChange={(v) => {
          setRpe(v)
          setSaved(false)
        }}
      />
      <BusyButton type="submit" className="btn btn-secondary" busy={save.busy}>
        {t('rpe.save')}
      </BusyButton>
    </form>
  )
}

function sourceLabel(t: (k: string) => string, s: StoredSource) {
  const kind =
    s.provider === 'demo'
      ? t('activities.sourceDemo')
      : s.format === 'manual' && s.originHint !== 'strava_export'
        ? t('activities.sourceManual')
        : t('activities.sourceFile')
  const origin =
    s.originHint === 'strava_export'
      ? t('activities.originStrava')
      : s.originHint === 'garmin_export'
        ? t('activities.originGarmin')
        : s.originHint === 'device_file'
          ? t('activities.originDevice')
          : null
  return `${kind} ${s.format !== 'manual' ? `.${s.format.toUpperCase()}` : ''}${origin ? ` (${origin})` : ''}`
}

function SourcesSection({ activity: a, merges }: { activity: Activity; merges: MergeRecord[] }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const qc = useQueryClient()
  const [done, setDone] = useState(false)
  const [error, setError] = useState(false)

  async function split(sourceId: string) {
    if (!window.confirm(t('activities.notSameConfirm'))) return
    setError(false)
    try {
      await undoMerge(repo, a.id, sourceId)
      await qc.invalidateQueries()
      setDone(true)
    } catch {
      setError(true)
    }
  }

  const used = (s: StoredSource) =>
    [
      s.id === a.primarySourceId && t('activities.usedMain'),
      s.id === a.hrSourceId && t('activities.usedHr'),
      s.id === a.powerSourceId && t('activities.usedPower'),
      s.id === a.gpsSourceId && t('activities.usedGps'),
      s.id === a.cadenceSourceId && t('activities.usedCadence'),
    ].filter(Boolean)

  const activeMerges = merges.filter((m) => !m.undoneAt)
  return (
    <section className="card" aria-labelledby="sources-h">
      <h2 id="sources-h" className="card-title-icon">
        <TitleIcon name="import" tone="soft" />
        {t('activities.sourcesTitle')}
      </h2>
      {a.sources.length > 1 && <p className="muted">{t('activities.sourcesHelp')}</p>}
      {done && <Alert kind="success">{t('activities.splitDone')}</Alert>}
      {error && <Alert kind="error">{t('errors.generic')}</Alert>}
      {activeMerges.map((m) => (
        <p key={m.id} className="callout">
          {m.matchedBy === 'device_and_time'
            ? t('activities.mergeInfoDevice')
            : t('activities.mergeInfo', {
                start: formatNumber(m.deltas.startMin, 1),
                dur: formatNumber(m.deltas.durationPct, 1),
                dist: m.deltas.distancePct === null ? '—' : formatNumber(m.deltas.distancePct, 1),
              })}
        </p>
      ))}
      <ul className="plain-list">
        {a.sources.map((s) => (
          <li key={s.id}>
            <strong>{sourceLabel(t, s)}</strong>
            {s.originalFilename && <span className="muted filename"> · {s.originalFilename}</span>}
            <br />
            <span className="muted">
              {t('activities.usedFor')} {used(s).join(', ') || '—'}
            </span>
            {a.sources.length > 1 && (
              <div>
                <button type="button" className="btn-link" onClick={() => void split(s.id)}>
                  {t('activities.notSame')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {merges
        .filter((m) => m.undoneAt)
        .map((m) => (
          <p key={m.id} className="muted">
            {t('activities.undone', { date: formatDate(m.undoneAt!) })}
          </p>
        ))}
    </section>
  )
}

function EditSection({ activity: a }: { activity: Activity }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [sport, setSport] = useState<Sport>(a.sport)
  const [sub, setSub] = useState<SubSport | ''>(a.subSport ?? '')
  const [title, setTitle] = useState(a.title ?? '')
  const [notes, setNotes] = useState(a.notes ?? '')
  const [saved, setSaved] = useState(false)
  useEffect(() => setSaved(false), [sport, sub, title, notes])

  const save = useAction(async () => {
    await repo.updateActivity(a.id, {
      sport,
      subSport: sub || null,
      title: title.trim() || null,
      notes: notes.trim() || null,
    })
    await qc.invalidateQueries()
  })
  const del = useAction(
    async () => {
      await repo.deleteActivity(a.id)
      await qc.invalidateQueries()
    },
    { success: t('toast.activityDeleted'), icon: 'trash' },
  )
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (await save.run()) setSaved(true)
  }
  async function remove() {
    if (!window.confirm(t('activities.deleteConfirm'))) return
    if (await del.run()) navigate('/actividades')
  }
  return (
    <section className="card" aria-labelledby="edit-h">
      <h2 id="edit-h" className="card-title-icon">
        <TitleIcon name="settings" tone="soft" />
        {t('activities.edit')}
      </h2>
      <form onSubmit={onSubmit} noValidate>
        {saved && <Alert kind="success">{t('common.saved')}</Alert>}
        <TextField label={t('activities.titleField')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid-2">
          <SelectField
            label={t('activities.sport')}
            value={sport}
            onChange={(e) => {
              setSport(e.target.value as Sport)
              setSub('')
            }}
          >
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sports.${s}`)}
              </option>
            ))}
          </SelectField>
          {SUBSPORTS[sport].length > 0 && (
            <SelectField label={t('activities.subSport')} value={sub} onChange={(e) => setSub(e.target.value as SubSport)}>
              <option value="">{t('subSports.none')}</option>
              {SUBSPORTS[sport].map((s) => (
                <option key={s} value={s}>
                  {t(`subSports.${s}`)}
                </option>
              ))}
            </SelectField>
          )}
        </div>
        <div className="field">
          <label htmlFor="notes">{t('activities.notes')}</label>
          <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="row">
          <BusyButton type="submit" busy={save.busy} disabled={del.busy}>
            {t('activities.saveChanges')}
          </BusyButton>
          <BusyButton
            type="button"
            className="btn btn-danger"
            busy={del.busy}
            busyLabel={t('common.deleting')}
            disabled={save.busy}
            onClick={() => void remove()}
          >
            {t('activities.delete')}
          </BusyButton>
        </div>
      </form>
    </section>
  )
}

/** Datos de Strava: enlace «View on Strava», marca y fecha en que se borran (7 días). */
function StravaNotice({ activity: a }: { activity: Activity }) {
  const { t } = useTranslation()
  const strava = a.sources.filter((s) => s.provider === 'strava')
  if (strava.length === 0) return null
  const url = stravaActivityUrl(strava[0].externalId)
  const expires = strava[0].streamsExpireAt
  const onlyStrava = strava.length === a.sources.length
  return (
    <section className="card" aria-label="Strava">
      {expires && (
        <p className="notice-estimate">
          {onlyStrava ? t('strava.expires', { date: formatDate(expires) }) : t('strava.expiresMerged', { date: formatDate(expires) })}
        </p>
      )}
      <div className="row-between">
        {url && <ViewOnStrava href={url} />}
        <PoweredByStrava />
      </div>
    </section>
  )
}
