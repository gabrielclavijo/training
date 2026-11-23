import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { NumberField, RadioGroup, SelectField, TextField, parseClock, parseNum, toClock } from '../../components/ui/Field'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import type { Sport, SubSport } from '../../core/activity/types'
import { computeStats } from '../../core/activity/summarize'
import { localDayKey } from '../../core/dates'
import { parseRouteGpx } from '../../core/parsers/gpx'
import { formatDistance, formatElevation } from '../../core/units'
import { useRepo } from '../../data/RepoProvider'
import type { Goal, GoalStage, Terrain } from '../../data/types'
import { SPORTS, SUBSPORTS } from '../activities/sports'

const TERRAINS: Terrain[] = ['paved', 'unpaved', 'mixed', 'technical', 'track', 'pool', 'open_water']
const TOTAL_STEPS = 4

interface StageDraft {
  km: string
  elev: string
  terrain: Terrain | ''
  time: string
}

export function GoalFormPage() {
  const { id } = useParams()
  const repo = useRepo()
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['goal', id], queryFn: () => repo.getGoal(id!), enabled: Boolean(id) })
  if (id && q.isLoading) return <Page title={t('goals.edit')}><Spinner /></Page>
  return <GoalForm initial={q.data ?? null} />
}

function GoalForm({ initial }: { initial: Goal | null }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const [step, setStep] = useState(1)
  const [goalType, setGoalType] = useState<'single' | 'stage'>(initial?.goalType ?? 'single')
  const [name, setName] = useState(initial?.name ?? '')
  const [sport, setSport] = useState<Sport>(initial?.sport ?? 'cycling')
  const [subSport, setSubSport] = useState<SubSport | ''>(initial?.subSport ?? '')
  const [date, setDate] = useState(initial?.eventDate ?? '')
  const [priority, setPriority] = useState<'primary' | 'secondary'>(initial?.priority ?? 'primary')
  const [km, setKm] = useState(initial?.distanceM ? String(initial.distanceM / 1000) : '')
  const [elev, setElev] = useState(initial?.elevationGainM ? String(initial.elevationGainM) : '')
  const [terrain, setTerrain] = useState<Terrain | ''>(initial?.terrain ?? '')
  const [maxAlt, setMaxAlt] = useState(initial?.maxAltitudeM ? String(initial.maxAltitudeM) : '')
  const [stages, setStages] = useState<StageDraft[]>(
    initial?.stages.length
      ? initial.stages.map((s) => ({ km: String(s.distanceM / 1000), elev: String(s.elevationGainM), terrain: s.terrain ?? '', time: toClock(s.targetTimeS, 'hh:mm') }))
      : [{ km: '', elev: '', terrain: '', time: '' }],
  )
  const [objective, setObjective] = useState<'finish' | 'time'>(initial?.objective ?? 'finish')
  const [target, setTarget] = useState(toClock(initial?.targetTimeS, 'hh:mm'))
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [gpxInfo, setGpxInfo] = useState<string | null>(null)
  const [gpxError, setGpxError] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    stepHeading.current?.focus()
  }, [step])

  function validate(s: number) {
    const e: Record<string, string> = {}
    if (s === 2) {
      if (!name.trim()) e.name = t('goals.requiredName')
      if (!date) e.date = t('goals.requiredDate')
      if (goalType === 'single') {
        const d = parseNum(km)
        if (d === null || Number.isNaN(d) || d <= 0) e.km = t('goals.requiredDistance')
        const up = parseNum(elev)
        if (up !== null && (Number.isNaN(up) || up < 0)) e.elev = t('activities.mustBePositive')
      } else {
        stages.forEach((st, i) => {
          const d = parseNum(st.km)
          if (d === null || Number.isNaN(d) || d <= 0) e[`stage-${i}`] = t('goals.requiredDistance')
        })
      }
    }
    if (s === 3 && objective === 'time') {
      const v = parseClock(target, 'hh:mm')
      if (goalType === 'single' || target.trim()) {
        if (v === null || Number.isNaN(v)) e.target = t('goals.timeInvalid')
      }
      stages.forEach((st, i) => {
        if (st.time.trim() && Number.isNaN(parseClock(st.time, 'hh:mm'))) e[`time-${i}`] = t('goals.timeInvalid')
      })
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (validate(step)) setStep(step + 1)
  }

  async function onGpx(file: File | undefined) {
    if (!file) return
    setGpxError(false)
    try {
      const { samples, maxAltitudeM } = parseRouteGpx(await file.text())
      const stats = computeStats(samples)
      if (stats.distanceM) setKm(String(Math.round(stats.distanceM / 100) / 10))
      if (stats.elevationGainM !== null) setElev(String(stats.elevationGainM))
      if (maxAltitudeM !== null) setMaxAlt(String(maxAltitudeM))
      setGpxInfo(
        t('goals.gpxRead', {
          distance: formatDistance(stats.distanceM ?? 0),
          elevation: formatElevation(stats.elevationGainM ?? 0),
          altitude: maxAltitudeM !== null ? formatElevation(maxAltitudeM) : '—',
        }),
      )
    } catch {
      setGpxError(true)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (step < TOTAL_STEPS) return next()
    if (!validate(2) || !validate(3)) return
    setSaving(true)
    setFailed(false)
    const stageList: GoalStage[] =
      goalType === 'stage'
        ? stages.map((s, i) => ({
            stageNumber: i + 1,
            dayOffset: i,
            distanceM: (parseNum(s.km) ?? 0) * 1000,
            elevationGainM: parseNum(s.elev) ?? 0,
            terrain: s.terrain || null,
            targetTimeS: objective === 'time' ? parseClock(s.time, 'hh:mm') : null,
          }))
        : []
    const stageTimes = stageList.map((s) => s.targetTimeS ?? 0)
    const total = parseClock(target, 'hh:mm') ?? (stageTimes.every((x) => x > 0) ? stageTimes.reduce((a, b) => a + b, 0) : null)
    try {
      const id = await repo.saveGoal({
        id: initial?.id,
        name: name.trim(),
        sport,
        subSport: subSport || null,
        eventDate: date,
        priority,
        goalType,
        objective,
        targetTimeS: objective === 'time' ? total : null,
        distanceM: goalType === 'single' ? (parseNum(km) ?? 0) * 1000 : stageList.reduce((a, s) => a + s.distanceM, 0),
        elevationGainM: goalType === 'single' ? parseNum(elev) : stageList.reduce((a, s) => a + s.elevationGainM, 0),
        terrain: terrain || null,
        maxAltitudeM: parseNum(maxAlt),
        gpxPath: initial?.gpxPath ?? null,
        notes: notes.trim() || null,
        status: initial?.status ?? 'active',
        isDemo: initial?.isDemo,
        stages: stageList,
      })
      await qc.invalidateQueries()
      navigate(`/metas/${id}`)
    } catch (err) {
      console.error(err)
      setFailed(true)
      setSaving(false)
    }
  }

  const stageTotals = stages.reduce((a, s) => ({ d: a.d + (parseNum(s.km) || 0) * 1000, e: a.e + (parseNum(s.elev) || 0) }), { d: 0, e: 0 })
  const titles = [t('goals.typeStep'), t('goals.dataStep'), t('goals.objectiveStep'), t('goals.gpxStep')]

  return (
    <Page title={initial ? t('goals.edit') : t('goals.new')}>
      <p className="muted">{t('goals.step', { current: step, total: TOTAL_STEPS })}</p>
      <progress className="progress" max={TOTAL_STEPS} value={step} aria-label={t('goals.step', { current: step, total: TOTAL_STEPS })} />
      <form className="card" onSubmit={onSubmit} noValidate>
        <h2 ref={stepHeading} tabIndex={-1}>
          {titles[step - 1]}
        </h2>
        {failed && <Alert kind="error">{t('errors.generic')}</Alert>}

        {step === 1 && (
          <RadioGroup
            legend={t('goals.typeStep')}
            name="goalType"
            value={goalType}
            onChange={setGoalType}
            options={[
              { value: 'single', label: t('goals.single'), help: t('goals.typeSingleHelp') },
              { value: 'stage', label: t('goals.stage'), help: t('goals.typeStageHelp') },
            ]}
          />
        )}

        {step === 2 && (
          <>
            <TextField label={t('goals.name')} placeholder={t('goals.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
            <div className="grid-2">
              <SelectField label={t('goals.sport')} value={sport} onChange={(e) => { setSport(e.target.value as Sport); setSubSport('') }}>
                {SPORTS.filter((s) => s !== 'strength').map((s) => (
                  <option key={s} value={s}>
                    {t(`sports.${s}`)}
                  </option>
                ))}
              </SelectField>
              {SUBSPORTS[sport].length > 0 && (
                <SelectField label={t('goals.subSport')} optional value={subSport} onChange={(e) => setSubSport(e.target.value as SubSport)}>
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
              <label htmlFor="g-date">{goalType === 'stage' ? t('goals.dateFirstStage') : t('goals.date')}</label>
              <input
                id="g-date"
                type="date"
                value={date}
                min={localDayKey(new Date())}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={errors.date ? true : undefined}
                aria-describedby={errors.date ? 'g-date-err' : undefined}
              />
              {errors.date && (
                <span id="g-date-err" className="error" role="alert">
                  {errors.date}
                </span>
              )}
            </div>
            <RadioGroup
              legend={t('goals.priority')}
              hint={t('goals.priorityHelp')}
              name="priority"
              value={priority}
              onChange={setPriority}
              options={[
                { value: 'primary', label: t('goals.primary') },
                { value: 'secondary', label: t('goals.secondary') },
              ]}
            />
            {goalType === 'single' ? (
              <>
                <div className="grid-2">
                  <NumberField label={t('goals.distanceKm')} value={km} onChange={(e) => setKm(e.target.value)} error={errors.km} />
                  <NumberField label={t('goals.elevationM')} optional value={elev} onChange={(e) => setElev(e.target.value)} error={errors.elev} inputMode="numeric" />
                </div>
                <div className="grid-2">
                  <SelectField label={t('goals.terrain')} optional value={terrain} onChange={(e) => setTerrain(e.target.value as Terrain)}>
                    <option value="">—</option>
                    {TERRAINS.map((x) => (
                      <option key={x} value={x}>
                        {t(`terrain.${x}`)}
                      </option>
                    ))}
                  </SelectField>
                  <NumberField label={t('goals.maxAltitude')} optional value={maxAlt} onChange={(e) => setMaxAlt(e.target.value)} inputMode="numeric" />
                </div>
              </>
            ) : (
              <fieldset>
                <legend className="legend">{t('goals.stages')}</legend>
                {stages.map((s, i) => (
                  <div key={i} className="stage-box">
                    <div className="row-between">
                      <h3>
                        {t('goals.stageN', { n: i + 1 })} <span className="muted">({t('goals.stageDay', { n: i + 1 })})</span>
                      </h3>
                      {stages.length > 1 && (
                        <button type="button" className="btn-link" onClick={() => setStages(stages.filter((_, j) => j !== i))}>
                          {t('goals.removeStage', { n: i + 1 })}
                        </button>
                      )}
                    </div>
                    <div className="grid-3">
                      <NumberField
                        label={t('goals.distanceKm')}
                        value={s.km}
                        error={errors[`stage-${i}`]}
                        onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, km: e.target.value } : x)))}
                      />
                      <NumberField
                        label={t('goals.elevationM')}
                        inputMode="numeric"
                        value={s.elev}
                        onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, elev: e.target.value } : x)))}
                      />
                      <SelectField
                        label={t('goals.terrain')}
                        value={s.terrain}
                        onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, terrain: e.target.value as Terrain } : x)))}
                      >
                        <option value="">—</option>
                        {TERRAINS.map((x) => (
                          <option key={x} value={x}>
                            {t(`terrain.${x}`)}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                  </div>
                ))}
                <p className="muted">{t('goals.totals', { distance: formatDistance(stageTotals.d), elevation: formatElevation(stageTotals.e) })}</p>
                <button type="button" className="btn btn-secondary" onClick={() => setStages([...stages, { km: '', elev: '', terrain: '', time: '' }])}>
                  {t('goals.addStage')}
                </button>
              </fieldset>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <RadioGroup
              legend={t('goals.objective')}
              name="objective"
              value={objective}
              onChange={setObjective}
              options={[
                { value: 'finish', label: t('goals.objectiveFinish') },
                { value: 'time', label: t('goals.objectiveTime') },
              ]}
            />
            {objective === 'time' && (
              <>
                <TextField label={t('goals.targetTotal')} placeholder={t('goals.timePlaceholder')} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} error={errors.target} optional={goalType === 'stage'} />
                {goalType === 'stage' && (
                  <fieldset>
                    <legend className="legend">{t('goals.targetPerStage')}</legend>
                    <div className="grid-3">
                      {stages.map((s, i) => (
                        <TextField
                          key={i}
                          label={t('goals.stageN', { n: i + 1 })}
                          placeholder="4:30"
                          inputMode="numeric"
                          value={s.time}
                          error={errors[`time-${i}`]}
                          onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))}
                        />
                      ))}
                    </div>
                  </fieldset>
                )}
              </>
            )}
            <div className="field">
              <label htmlFor="g-notes">
                {t('goals.notes')} <span className="muted">({t('common.optional')})</span>
              </label>
              <textarea id="g-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <p className="muted">{t('goals.gpxHelp')}</p>
            <div className="field">
              <label htmlFor="g-gpx">{t('goals.gpxChoose')}</label>
              <input id="g-gpx" type="file" accept=".gpx,application/gpx+xml" onChange={(e) => void onGpx(e.target.files?.[0])} />
            </div>
            <div aria-live="polite">
              {gpxInfo && <Alert kind="success">{gpxInfo}</Alert>}
              {gpxError && <Alert kind="error">{t('goals.gpxError')}</Alert>}
            </div>
            {goalType === 'single' && gpxInfo && (
              <div className="grid-2">
                <NumberField label={t('goals.distanceKm')} value={km} onChange={(e) => setKm(e.target.value)} />
                <NumberField label={t('goals.elevationM')} value={elev} onChange={(e) => setElev(e.target.value)} />
              </div>
            )}
          </>
        )}

        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          {step > 1 && (
            <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)}>
              {t('common.back')}
            </button>
          )}
          {step < TOTAL_STEPS ? (
            <button type="submit" className="btn btn-primary">
              {t('common.continue')}
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('common.saving') : t('goals.save')}
            </button>
          )}
        </div>
      </form>
    </Page>
  )
}
