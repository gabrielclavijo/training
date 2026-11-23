import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '../../components/ui/Page'
import { NumberField, RadioGroup, TextField, parseClock, parseNum, toClock } from '../../components/ui/Field'
import { formatDate, localDayKey } from '../../core/dates'
import { formatWeight } from '../../core/units'
import { keys, usePhysiology, useProfile, useRepoMutation, useWeights } from '../../data/hooks'
import { useRepo } from '../../data/RepoProvider'
import type { SexForFormulas } from '../../data/types'

const today = () => localDayKey(new Date())

/** Datos básicos: nombre, nacimiento, sexo para fórmulas, estatura y peso actual. */
export function BasicsForm({ onSaved, submitLabel, askWeight = false }: { onSaved?: () => void; submitLabel?: string; askWeight?: boolean }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const profile = useProfile()
  const [name, setName] = useState('')
  const [birth, setBirth] = useState('')
  const [sex, setSex] = useState<SexForFormulas | 'none'>('none')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [adult, setAdult] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const p = profile.data
    if (!p) return
    setName(p.displayName ?? '')
    setBirth(p.birthDate ?? '')
    setSex(p.sexForFormulas ?? 'none')
    setHeight(p.heightCm ? String(p.heightCm) : '')
    setAdult(p.adultConfirmed)
  }, [profile.data])

  const save = useRepoMutation(
    async () => {
      await repo.updateProfile({
        displayName: name.trim() || null,
        birthDate: birth || null,
        sexForFormulas: sex === 'none' ? null : sex,
        heightCm: parseNum(height),
        adultConfirmed: adult,
      })
      const w = parseNum(weight)
      if (w) await repo.saveWeight({ measuredOn: today(), weightKg: w })
    },
    [keys.profile, keys.weights],
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = t('activities.required')
    if (!adult) errs.adult = t('profile.adultRequired')
    const h = parseNum(height)
    if (h !== null && (Number.isNaN(h) || h < 100 || h > 250)) errs.height = t('activities.mustBePositive')
    const w = parseNum(weight)
    if (w !== null && (Number.isNaN(w) || w < 25 || w > 350)) errs.weight = t('activities.mustBePositive')
    if (birth && birth > today()) errs.birth = t('activities.required')
    setErrors(errs)
    if (Object.keys(errs).length) return
    await save.mutateAsync(undefined)
    setSaved(true)
    onSaved?.()
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {save.isError && <Alert kind="error">{t('errors.generic')}</Alert>}
      {saved && !onSaved && <Alert kind="success">{t('common.saved')}</Alert>}
      <TextField label={t('profile.name')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" error={errors.name} />
      <div className="field">
        <label htmlFor="birth">
          {t('profile.birthDate')} <span className="muted">({t('common.optional')})</span>
        </label>
        <input id="birth" type="date" value={birth} max={today()} onChange={(e) => setBirth(e.target.value)} autoComplete="bday" />
      </div>
      <RadioGroup
        legend={t('profile.sex')}
        name="sex"
        hint={t('profile.sexHelp')}
        value={sex}
        onChange={setSex}
        options={[
          { value: 'female', label: t('profile.sexFemale') },
          { value: 'male', label: t('profile.sexMale') },
          { value: 'none', label: t('profile.sexNone') },
        ]}
      />
      <NumberField label={t('profile.height')} optional value={height} onChange={(e) => setHeight(e.target.value)} error={errors.height} />
      {askWeight && <NumberField label={t('profile.weightKg')} optional value={weight} onChange={(e) => setWeight(e.target.value)} error={errors.weight} />}
      <div className="field">
        <label className="choice">
          <input
            type="checkbox"
            checked={adult}
            onChange={(e) => setAdult(e.target.checked)}
            aria-invalid={errors.adult ? true : undefined}
            aria-describedby={errors.adult ? 'adult-error' : undefined}
          />
          {t('profile.adult')}
        </label>
        {errors.adult && (
          <span id="adult-error" className="error" role="alert">
            {errors.adult}
          </span>
        )}
      </div>
      <button className="btn btn-primary" type="submit" disabled={save.isPending}>
        {save.isPending ? t('common.saving') : (submitLabel ?? t('common.save'))}
      </button>
    </form>
  )
}

/** Umbrales fisiológicos con fecha de vigencia. */
export function PhysiologyForm({ onSaved, submitLabel }: { onSaved?: () => void; submitLabel?: string }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const phys = usePhysiology()
  const last = phys.data?.at(-1)
  const [from, setFrom] = useState(today())
  const [f, setF] = useState({ hrRest: '', hrMax: '', hrThreshold: '', ftp: '', run: '', swim: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!last) return
    setF({
      hrRest: last.hrRest ? String(last.hrRest) : '',
      hrMax: last.hrMax ? String(last.hrMax) : '',
      hrThreshold: last.hrThreshold ? String(last.hrThreshold) : '',
      ftp: last.ftpW ? String(last.ftpW) : '',
      run: toClock(last.runThresholdSPerKm, 'mm:ss'),
      swim: toClock(last.swimThresholdSPer100m, 'mm:ss'),
    })
  }, [last])

  const save = useRepoMutation(
    (entry: Parameters<typeof repo.savePhysiology>[0]) => repo.savePhysiology(entry),
    [keys.physiology],
  )

  const ranges = { hrRest: [25, 120], hrMax: [100, 230], hrThreshold: [80, 220], ftp: [50, 600] } as const

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const nums: Record<string, number | null> = {}
    for (const k of Object.keys(ranges) as (keyof typeof ranges)[]) {
      const v = parseNum(f[k])
      if (v !== null && (Number.isNaN(v) || v < ranges[k][0] || v > ranges[k][1])) errs[k] = `${ranges[k][0]}–${ranges[k][1]}`
      nums[k] = v
    }
    const run = parseClock(f.run, 'mm:ss')
    const swim = parseClock(f.swim, 'mm:ss')
    if (Number.isNaN(run)) errs.run = t('profile.paceInvalid')
    if (Number.isNaN(swim)) errs.swim = t('profile.paceInvalid')
    setErrors(errs)
    if (Object.keys(errs).length) return
    await save.mutateAsync({
      effectiveFrom: from,
      hrRest: nums.hrRest,
      hrMax: nums.hrMax,
      hrMaxSource: nums.hrMax ? 'measured' : null,
      hrThreshold: nums.hrThreshold,
      ftpW: nums.ftp,
      runThresholdSPerKm: run,
      swimThresholdSPer100m: swim,
    })
    setSaved(true)
    onSaved?.()
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="muted">{t('profile.physiologyHelp')}</p>
      {save.isError && <Alert kind="error">{t('errors.generic')}</Alert>}
      {saved && !onSaved && <Alert kind="success">{t('common.saved')}</Alert>}
      <div className="grid-2">
        <NumberField label={t('profile.hrRest')} hint={t('profile.hrRestHelp')} optional value={f.hrRest} onChange={set('hrRest')} error={errors.hrRest} />
        <NumberField label={t('profile.hrMax')} hint={t('profile.hrMaxHelp')} optional value={f.hrMax} onChange={set('hrMax')} error={errors.hrMax} />
        <NumberField label={t('profile.hrThreshold')} hint={t('profile.hrThresholdHelp')} optional value={f.hrThreshold} onChange={set('hrThreshold')} error={errors.hrThreshold} />
        <NumberField label={t('profile.ftp')} hint={t('profile.ftpHelp')} optional value={f.ftp} onChange={set('ftp')} error={errors.ftp} />
        <TextField label={t('profile.runPace')} optional placeholder={t('profile.pacePlaceholder')} value={f.run} onChange={set('run')} error={errors.run} inputMode="numeric" />
        <TextField label={t('profile.swimPace')} optional placeholder="1:50" value={f.swim} onChange={set('swim')} error={errors.swim} inputMode="numeric" />
      </div>
      <div className="field">
        <label htmlFor="eff-from">{t('profile.effectiveFrom')}</label>
        <span id="eff-help" className="hint">
          {t('profile.effectiveHelp')}
        </span>
        <input id="eff-from" type="date" value={from} max={today()} onChange={(e) => setFrom(e.target.value)} aria-describedby="eff-help" />
      </div>
      <button className="btn btn-primary" type="submit" disabled={save.isPending}>
        {save.isPending ? t('common.saving') : (submitLabel ?? t('profile.savePhysiology'))}
      </button>
    </form>
  )
}

export function WeightSection() {
  const { t } = useTranslation()
  const repo = useRepo()
  const weights = useWeights()
  const [kg, setKg] = useState('')
  const [date, setDate] = useState(today())
  const [error, setError] = useState<string | null>(null)
  const add = useRepoMutation((w: { measuredOn: string; weightKg: number }) => repo.saveWeight(w), [keys.weights])
  const del = useRepoMutation((id: string) => repo.deleteWeight(id), [keys.weights])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const v = parseNum(kg)
    if (v === null || Number.isNaN(v) || v < 25 || v > 350) return setError(t('activities.mustBePositive'))
    setError(null)
    await add.mutateAsync({ measuredOn: date, weightKg: v })
    setKg('')
  }

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="grid-2">
        <NumberField label={t('profile.weightKg')} value={kg} onChange={(e) => setKg(e.target.value)} error={error} />
        <div className="field">
          <label htmlFor="w-date">{t('profile.weightDate')}</label>
          <input id="w-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <button className="btn btn-secondary" type="submit" disabled={add.isPending}>
            {t('profile.addWeight')}
          </button>
        </div>
      </form>
      <h3 style={{ marginTop: 'var(--space-4)' }}>{t('profile.weightHistory')}</h3>
      {weights.data && weights.data.length === 0 && <p className="muted">{t('profile.noWeights')}</p>}
      <ul className="plain-list">
        {[...(weights.data ?? [])].reverse().map((w) => (
          <li key={w.id} className="row-between">
            <span>
              {formatDate(`${w.measuredOn}T12:00:00Z`)} · <strong>{formatWeight(w.weightKg)}</strong>
            </span>
            <button
              type="button"
              className="btn-link"
              onClick={() => del.mutate(w.id)}
              aria-label={`${t('profile.delete')} ${formatDate(`${w.measuredOn}T12:00:00Z`)}`}
            >
              {t('profile.delete')}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
