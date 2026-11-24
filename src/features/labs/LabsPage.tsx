import { Icon, TitleIcon } from '../../components/ui/Icon'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { LineChart } from '../../components/ui/Charts'
import { NumberField, SelectField, TextField, parseNum } from '../../components/ui/Field'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { formatDate, localDayKey } from '../../core/dates'
import { effectiveRange, LAB_CATALOG, labDef, labStatus, type LabStatus } from '../../core/labs/catalog'
import { useHasHealthConsent, useHealth, useProfile, useRepoMutation } from '../../data/hooks'
import { useRepo } from '../../data/RepoProvider'
import { groupLabs, type LabGroup } from '../../data/labs'
import { LegalNotice } from '../plan/SessionView'

const d = (day: string) => formatDate(`${day}T12:00:00Z`)
const OTHER = '__otro__'

export function LabsPage() {
  const { t } = useTranslation()
  const consent = useHasHealthConsent()
  const health = useHealth()
  const profile = useProfile()
  const sex = profile.data?.sexForFormulas ?? null
  const groups = useMemo(() => groupLabs(health.data ?? [], (k) => t(`labs.catalog.${k}`)), [health.data, t])

  return (
    <Page title={t('labs.title')}>
      <LegalNotice text={t('labs.legal')} />
      <p>{t('labs.intro')}</p>
      {consent.isLoading ? (
        <Spinner />
      ) : !consent.data ? (
        <div className="empty-visual card">
          <span className="ai-orb" aria-hidden="true">
            <Icon name="lab" />
          </span>
          <p>{t('labs.needConsent')}</p>
          <Link className="btn btn-primary" to="/perfil">
            <Icon name="shield" /> {t('labs.giveConsent')}
          </Link>
        </div>
      ) : (
        <>
          <section className="card" aria-labelledby="addlab-h">
            <h2 id="addlab-h" className="card-title-icon">
              <TitleIcon name="lab" tone="sky" />
              {t('labs.add')}
            </h2>
            <AddLabForm />
          </section>
          {health.isLoading && <Spinner />}
          {health.isError && <Alert kind="error">{t('errors.generic')}</Alert>}
          {health.data && groups.length === 0 && <p className="muted">{t('labs.empty')}</p>}
          {groups.map((g) => (
            <LabCard key={g.id} group={g} sex={sex} />
          ))}
        </>
      )}
    </Page>
  )
}

function rangeText(t: TFunction, range: { low: number | null; high: number | null } | null) {
  if (!range || (range.low === null && range.high === null)) return t('labs.noRange')
  if (range.low !== null && range.high !== null) return `${range.low}–${range.high}`
  return range.low !== null ? t('labs.rangeFrom', { low: range.low }) : t('labs.rangeTo', { high: range.high })
}

const STATUS_ICON: Record<LabStatus, string> = { low: '▼', in_range: '✓', high: '▲', unknown: '•' }

function LabCard({ group, sex }: { group: LabGroup; sex: 'female' | 'male' | null }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const del = useRepoMutation((id: string) => repo.deleteHealth(id), 'all')
  const last = group.results[group.results.length - 1]
  const { range, source } = effectiveRange(last.data, sex)
  const status = labStatus(last.data.value!, range)
  const headingId = `lab-${group.id.replace(/[^a-z0-9]/gi, '-')}`
  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="row-between">
        <h2 id={headingId} className="card-title-icon">
          <TitleIcon name="lab" tone="sky" />
          {group.name}
        </h2>
        <span className={`badge ${status === 'in_range' ? 'badge-info' : status === 'unknown' ? '' : 'badge-warning'}`}>
          {STATUS_ICON[status]} {t(`labs.status.${status}`)}
        </span>
      </div>
      <p>
        <strong>{t('labs.latest', { value: last.data.value, unit: last.data.unit ?? '', date: d(last.recordedOn!) })}</strong>
        <br />
        <span className="muted">
          {t('labs.range', { range: rangeText(t, range), unit: last.data.unit ?? '' })}
          {source && ` (${t(source === 'lab' ? 'labs.rangeLab' : 'labs.rangeGeneral')})`}
        </span>
      </p>
      {group.results.length >= 2 && (
        <LineChart
          title={t('labs.chartTitle', { name: group.name })}
          summary={t('labs.chartSummary', { count: group.results.length, value: last.data.value, unit: last.data.unit ?? '' })}
          labels={group.results.map((r) => r.recordedOn!)}
          formatLabel={(l) => d(l)}
          series={[{ name: group.name, values: group.results.map((r) => r.data.value!), className: 'line-ctl' }]}
          tableEvery={1}
        />
      )}
      <h3>{t('labs.history', { name: group.name })}</h3>
      <ul className="plain-list">
        {[...group.results].reverse().map((r) => (
          <li key={r.id} className="row-between">
            <span>
              {d(r.recordedOn!)}:{' '}
              <strong>
                {r.data.value} {r.data.unit ?? ''}
              </strong>
            </span>
            <button
              type="button"
              className="btn-link"
              onClick={() => del.mutate(r.id)}
              aria-label={t('labs.deleteLabel', { name: group.name, date: d(r.recordedOn!) })}
            >
              {t('labs.delete')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function AddLabForm() {
  const { t } = useTranslation()
  const repo = useRepo()
  const today = localDayKey(new Date())
  const [key, setKey] = useState(LAB_CATALOG[0].key)
  const [custom, setCustom] = useState('')
  const [date, setDate] = useState(today)
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState(LAB_CATALOG[0].unit)
  const [low, setLow] = useState('')
  const [high, setHigh] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const save = useRepoMutation(
    () =>
      repo.saveHealth({
        category: 'lab_result',
        recordedOn: date,
        data: {
          name: key === OTHER ? custom.trim() : t(`labs.catalog.${key}`),
          labKey: key === OTHER ? undefined : key,
          value: parseNum(value)!,
          unit: unit.trim(),
          refLow: parseNum(low),
          refHigh: parseNum(high),
        },
      }),
    'all',
  )

  function onExam(k: string) {
    setKey(k)
    setUnit(labDef(k)?.unit ?? '')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (key === OTHER && !custom.trim()) errs.custom = t('activities.required')
    const v = parseNum(value)
    if (v === null || Number.isNaN(v)) errs.value = t('activities.required')
    for (const [k, s] of [
      ['low', low],
      ['high', high],
    ] as const) {
      const n = parseNum(s)
      if (n !== null && Number.isNaN(n)) errs[k] = t('activities.mustBePositive')
    }
    if (!date || date > today) errs.date = t('activities.required')
    setErrors(errs)
    setSaved(false)
    if (Object.keys(errs).length) return
    await save.mutateAsync(undefined)
    setValue('')
    setLow('')
    setHigh('')
    setSaved(true)
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {save.isError && <Alert kind="error">{t('errors.generic')}</Alert>}
      {saved && <Alert kind="success">{t('labs.saved')}</Alert>}
      <SelectField label={t('labs.exam')} value={key} onChange={(e) => onExam(e.target.value)}>
        {LAB_CATALOG.map((l) => (
          <option key={l.key} value={l.key}>
            {t(`labs.catalog.${l.key}`)}
          </option>
        ))}
        <option value={OTHER}>{t('labs.other')}</option>
      </SelectField>
      {key === OTHER && (
        <TextField label={t('labs.customName')} value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={100} error={errors.custom} />
      )}
      <div className="field">
        <label htmlFor="lab-date">{t('labs.date')}</label>
        <input id="lab-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-invalid={errors.date ? true : undefined} />
        {errors.date && (
          <span className="error" role="alert">
            {errors.date}
          </span>
        )}
      </div>
      <div className="grid-2">
        <NumberField label={t('labs.value')} value={value} onChange={(e) => setValue(e.target.value)} error={errors.value} />
        <TextField label={t('labs.unit')} value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} />
      </div>
      <p className="hint">{t('labs.refHelp')}</p>
      <div className="grid-2">
        <NumberField label={t('labs.refLow')} optional value={low} onChange={(e) => setLow(e.target.value)} error={errors.low} />
        <NumberField label={t('labs.refHigh')} optional value={high} onChange={(e) => setHigh(e.target.value)} error={errors.high} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={save.isPending}>
        {save.isPending ? t('common.saving') : t('labs.save')}
      </button>
    </form>
  )
}
