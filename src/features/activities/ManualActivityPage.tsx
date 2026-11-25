import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { NumberField, SelectField, TextField, parseNum, parseWhole } from '../../components/ui/Field'
import { Alert, Page } from '../../components/ui/Page'
import type { Sport, SubSport } from '../../core/activity/types'
import { emptySummary } from '../../core/activity/types'
import { localDayKey } from '../../core/dates'
import { importOne } from '../../data/importer'
import { useRepo } from '../../data/RepoProvider'
import { RpeSelect } from './RpeSelect'
import { SPORTS, SUBSPORTS } from './sports'

const BOGOTA_OFFSET_H = 5

/** Registro manual: para el gimnasio o actividades sin reloj. */
export function ManualActivityPage() {
  const { t } = useTranslation()
  const repo = useRepo()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [sport, setSport] = useState<Sport>('strength')
  const [subSport, setSubSport] = useState<SubSport | ''>('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(localDayKey(new Date()))
  const [time, setTime] = useState('06:00')
  const [minutes, setMinutes] = useState('')
  const [km, setKm] = useState('')
  const [elev, setElev] = useState('')
  const [hr, setHr] = useState('')
  const [rpe, setRpe] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const min = parseWhole(minutes)
    if (min === null) errs.minutes = t('activities.required')
    else if (Number.isNaN(min) || min <= 0 || min > 24 * 60) errs.minutes = t('activities.mustBePositive')
    const dist = parseNum(km)
    if (dist !== null && (Number.isNaN(dist) || dist < 0)) errs.km = t('activities.mustBePositive')
    const up = parseWhole(elev)
    if (up !== null && (Number.isNaN(up) || up < 0)) errs.elev = t('activities.mustBePositive')
    const avgHr = parseWhole(hr)
    if (avgHr !== null && (Number.isNaN(avgHr) || avgHr < 40 || avgHr > 230)) errs.hr = '40–230'
    setErrors(errs)
    if (Object.keys(errs).length) return

    const [y, m, d] = date.split('-').map(Number)
    const [hh, mm] = time.split(':').map(Number)
    const start = new Date(Date.UTC(y, m - 1, d, hh + BOGOTA_OFFSET_H, mm))
    const summary = emptySummary({
      sport,
      subSport: subSport || null,
      title: title.trim() || null,
      startTime: start.toISOString(),
      timezone: 'America/Bogota',
      elapsedS: Math.round(min! * 60),
      distanceM: dist ? dist * 1000 : null,
      elevationGainM: up,
      avgHr,
      hasHr: Boolean(avgHr),
      rpe,
    })
    setBusy(true)
    setFailed(false)
    try {
      const r = await importOne(repo, { name: t('activities.manualTitle'), parsed: { summary, streams: null, format: 'manual', originHint: 'other' }, sha256: null }, { jobId: null })
      await qc.invalidateQueries()
      navigate(`/actividades/${r.activityId}`)
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <Page title={t('activities.manualTitle')}>
      <p className="muted">{t('activities.manualHelp')}</p>
      <form className="card" onSubmit={onSubmit} noValidate>
        {failed && <Alert kind="error">{t('errors.generic')}</Alert>}
        <SelectField label={t('activities.sport')} value={sport} onChange={(e) => {
          setSport(e.target.value as Sport)
          setSubSport('')
        }}>
          {SPORTS.map((s) => (
            <option key={s} value={s}>
              {t(`sports.${s}`)}
            </option>
          ))}
        </SelectField>
        {SUBSPORTS[sport].length > 0 && (
          <SelectField label={t('activities.subSport')} optional value={subSport} onChange={(e) => setSubSport(e.target.value as SubSport)}>
            <option value="">{t('subSports.none')}</option>
            {SUBSPORTS[sport].map((s) => (
              <option key={s} value={s}>
                {t(`subSports.${s}`)}
              </option>
            ))}
          </SelectField>
        )}
        <TextField label={t('activities.titleField')} optional value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid-2">
          <div className="field">
            <label htmlFor="m-date">{t('activities.date')}</label>
            <input id="m-date" type="date" value={date} max={localDayKey(new Date())} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="m-time">{t('activities.time')}</label>
            <input id="m-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <NumberField label={t('activities.durationMin')} value={minutes} onChange={(e) => setMinutes(e.target.value)} error={errors.minutes} inputMode="numeric" />
        {sport !== 'strength' && (
          <div className="grid-2">
            <NumberField label={t('activities.distanceKm')} optional value={km} onChange={(e) => setKm(e.target.value)} error={errors.km} />
            <NumberField label={t('activities.elevationM')} optional value={elev} onChange={(e) => setElev(e.target.value)} error={errors.elev} inputMode="numeric" />
          </div>
        )}
        <NumberField label={t('activities.avgHrOptional')} optional value={hr} onChange={(e) => setHr(e.target.value)} error={errors.hr} inputMode="numeric" />
        <RpeSelect value={rpe} onChange={setRpe} />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? t('common.saving') : t('activities.saveManual')}
        </button>
      </form>
    </Page>
  )
}
