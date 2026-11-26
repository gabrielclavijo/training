import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BusyButton } from '../../components/ui/Busy'
import { useToast } from '../../components/fx/Toast'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ClockField, NumberField, RadioGroup, SelectField, TextField, parseClock, parseNum, parseWhole, toClock } from '../../components/ui/Field'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import type { Sport, SubSport } from '../../core/activity/types'
import { computeStats } from '../../core/activity/summarize'
import { localDayKey } from '../../core/dates'
import { parseRouteGpx } from '../../core/parsers/gpx'
import { formatDistance, formatElevation } from '../../core/units'
import { useRepo } from '../../data/RepoProvider'
import type { Goal, GoalStage, Terrain } from '../../data/types'
import { presetInfo, suggestSplit, TRI_PRESETS, type TriLeg, type TriPreset } from '../../core/triathlon'
import { Icon } from '../../components/ui/Icon'
import { SPORTS, SUBSPORTS } from '../activities/sports'

const TERRAINS: Terrain[] = ['paved', 'unpaved', 'mixed', 'technical', 'track', 'pool', 'open_water']
const TOTAL_STEPS = 4

interface StageDraft {
  km: string
  elev: string
  terrain: Terrain | ''
  time: string
}

/** Límites de sentido común (más que esto, casi seguro es un error al escribir) */
const MAX_KM_PER_DAY = { cycling: 600, running: 250, swimming: 40, other: 600 }
const MAX_KMH = { cycling: 50, running: 22, swimming: 7, other: 60 }

export function GoalFormPage() {
  const { id } = useParams()
  const location = useLocation()
  const repo = useRepo()
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['goal', id],
    queryFn: () => repo.getGoal(id!),
    enabled: Boolean(id),
  })
  if (id && q.isLoading)
    return (
      <Page title={t('goals.edit')}>
        <Spinner full />
      </Page>
    )
  // Cada vez que se abre la pantalla, el formulario empieza de cero (aunque la
  // pantalla anterior aún esté cargando)
  return <GoalForm key={location.key} initial={q.data ?? null} />
}

function GoalForm({ initial }: { initial: Goal | null }) {
  const { t } = useTranslation()
  const toast = useToast()
  const repo = useRepo()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const [step, setStep] = useState(1)
  const [goalType, setGoalType] = useState<'single' | 'stage' | 'triathlon'>(initial?.sport === 'triathlon' ? 'triathlon' : (initial?.goalType ?? 'single'))
  const isTri = goalType === 'triathlon'
  const [preset, setPreset] = useState<TriPreset>(initial?.triPreset ?? 'olympic')
  const [legKm, setLegKm] = useState<Record<TriLeg, string>>({
    swim: initial?.legs ? String(initial.legs.swimM / 1000) : '',
    bike: initial?.legs ? String(initial.legs.bikeM / 1000) : '',
    run: initial?.legs ? String(initial.legs.runM / 1000) : '',
  })
  const [legTime, setLegTime] = useState<Record<TriLeg, string>>({
    swim: toClock(initial?.legs?.swimS ?? null, 'hh:mm'),
    bike: toClock(initial?.legs?.bikeS ?? null, 'hh:mm'),
    run: toClock(initial?.legs?.runS ?? null, 'hh:mm'),
  })
  const [name, setName] = useState(initial?.name ?? '')
  const [sport, setSport] = useState<Sport>(initial?.sport && initial.sport !== 'triathlon' ? initial.sport : 'cycling')
  const [subSport, setSubSport] = useState<SubSport | ''>(initial?.subSport ?? '')
  const [date, setDate] = useState(initial?.eventDate ?? '')
  const [priority, setPriority] = useState<'primary' | 'secondary'>(initial?.priority ?? 'primary')
  const [km, setKm] = useState(initial?.distanceM ? String(initial.distanceM / 1000) : '')
  const [elev, setElev] = useState(initial?.elevationGainM ? String(initial.elevationGainM) : '')
  const [terrain, setTerrain] = useState<Terrain | ''>(initial?.terrain ?? '')
  const [maxAlt, setMaxAlt] = useState(initial?.maxAltitudeM ? String(initial.maxAltitudeM) : '')
  const [stages, setStages] = useState<StageDraft[]>(
    initial?.stages.length
      ? initial.stages.map((s) => ({
          km: String(s.distanceM / 1000),
          elev: String(s.elevationGainM),
          terrain: s.terrain ?? '',
          time: toClock(s.targetTimeS, 'hh:mm'),
        }))
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

  /** Distancias de los tres tramos (catálogo o las escritas) */
  function triDistances() {
    const p = presetInfo(preset)
    if (p) return { swimM: p.swimM, bikeM: p.bikeM, runM: p.runM }
    const m = (k: TriLeg) => (parseNum(legKm[k]) ?? 0) * 1000
    return { swimM: m('swim'), bikeM: m('bike'), runM: m('run') }
  }
  /** Objetivos por tramo: los escritos y, si solo hay total, el reparto sugerido */
  function triTargets() {
    const given = Object.fromEntries((['swim', 'bike', 'run'] as const).map((k) => [k, parseClock(legTime[k], 'hh:mm')])) as Record<TriLeg, number | null>
    const total = parseClock(target, 'hh:mm')
    const d = triDistances()
    if (total && !Number.isNaN(total)) return suggestSplit({ ...d, swimS: given.swim, bikeS: given.bike, runS: given.run }, total)
    if (given.swim && given.bike && given.run) return given as Record<TriLeg, number>
    return null
  }

  function validate(s: number) {
    const e: Record<string, string> = {}
    if (s === 2) {
      if (!name.trim()) e.name = t('goals.requiredName')
      if (!date) e.date = t('goals.requiredDate')
      // Una meta nueva no puede ser en el pasado (editar una pasada sí se puede)
      else if (!initial && date < localDayKey(new Date())) e.date = t('goals.datePast')
      if (isTri) {
        if (preset === 'custom')
          (['swim', 'bike', 'run'] as const).forEach((k) => {
            const d = parseNum(legKm[k])
            if (d === null || Number.isNaN(d) || d <= 0) e[`leg-${k}`] = t('goals.requiredDistance')
          })
      } else if (goalType === 'single') {
        const d = parseNum(km)
        if (d === null || Number.isNaN(d) || d <= 0) e.km = t('goals.requiredDistance')
        else if (d > MAX_KM_PER_DAY[sport as keyof typeof MAX_KM_PER_DAY])
          e.km = t('goals.distanceTooLong', { km: MAX_KM_PER_DAY[sport as keyof typeof MAX_KM_PER_DAY] })
        const up = parseWhole(elev)
        if (up !== null && !Number.isNaN(up) && d && up > d * 100) e.elev = t('goals.elevTooHigh')
        if (up !== null && (Number.isNaN(up) || up < 0)) e.elev = t('activities.mustBePositive')
      } else {
        stages.forEach((st, i) => {
          const d = parseNum(st.km)
          if (d === null || Number.isNaN(d) || d <= 0) e[`stage-${i}`] = t('goals.requiredDistance')
          else if (d > MAX_KM_PER_DAY[sport as keyof typeof MAX_KM_PER_DAY])
            e[`stage-${i}`] = t('goals.distanceTooLong', { km: MAX_KM_PER_DAY[sport as keyof typeof MAX_KM_PER_DAY] })
        })
      }
    }
    if (s === 3 && objective === 'time' && isTri) {
      ;(['swim', 'bike', 'run'] as const).forEach((k) => {
        if (legTime[k].trim() && Number.isNaN(parseClock(legTime[k], 'hh:mm'))) e[`ltime-${k}`] = t('goals.timeInvalid')
      })
      const v = parseClock(target, 'hh:mm')
      if (target.trim() && (v === null || Number.isNaN(v))) e.target = t('goals.timeInvalid')
      if (!target.trim() && !(['swim', 'bike', 'run'] as const).every((k) => legTime[k].trim())) e.target = t('goals.triTargetNeeded')
    } else if (s === 3 && objective === 'time') {
      const v = parseClock(target, 'hh:mm')
      if (goalType === 'single' || target.trim()) {
        if (v === null || Number.isNaN(v)) e.target = t('goals.timeInvalid')
        else {
          // ¿Un tiempo posible? Velocidad media por encima de récords mundiales → revisar
          const totalKm = goalType === 'single' ? (parseNum(km) ?? 0) : stages.reduce((a, st) => a + (parseNum(st.km) ?? 0), 0)
          const kmh = v > 0 ? totalKm / (v / 3600) : Infinity
          if (kmh > MAX_KMH[sport as keyof typeof MAX_KMH]) e.target = t('goals.timeImpossible')
        }
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
      if (stats.distanceM) {
        const kmText = String(Math.round(stats.distanceM / 100) / 10)
        if (isTri) {
          setPreset('custom')
          setLegKm((l) => ({ ...l, ...(preset !== 'custom' ? kmOf(presetInfo(preset)) : {}), bike: kmText }))
        } else setKm(kmText)
      }
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
    if (isTri) {
      const d = triDistances()
      const tt = objective === 'time' ? triTargets() : null
      try {
        const id = await repo.saveGoal({
          id: initial?.id,
          name: name.trim(),
          sport: 'triathlon',
          subSport: null,
          eventDate: date,
          priority,
          goalType: 'single',
          objective,
          targetTimeS: tt ? tt.swim + tt.bike + tt.run : null,
          distanceM: d.swimM + d.bikeM + d.runM,
          elevationGainM: parseWhole(elev),
          terrain: null,
          maxAltitudeM: null,
          gpxPath: initial?.gpxPath ?? null,
          notes: notes.trim() || null,
          status: initial?.status ?? 'active',
          isDemo: initial?.isDemo,
          stages: [],
          triPreset: preset,
          legs: { ...d, swimS: tt?.swim ?? null, bikeS: tt?.bike ?? null, runS: tt?.run ?? null },
        })
        await qc.invalidateQueries()
        toast(t('toast.goalSaved'), { icon: 'flag' })
        navigate(`/metas/${id}`)
      } catch (err) {
        console.error(err)
        setFailed(true)
        setSaving(false)
      }
      return
    }
    const stageList: GoalStage[] =
      goalType === 'stage'
        ? stages.map((s, i) => ({
            stageNumber: i + 1,
            dayOffset: i,
            distanceM: (parseNum(s.km) ?? 0) * 1000,
            elevationGainM: parseWhole(s.elev) ?? 0,
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
        goalType: goalType === 'stage' ? 'stage' : 'single',
        objective,
        targetTimeS: objective === 'time' ? total : null,
        distanceM: goalType === 'single' ? (parseNum(km) ?? 0) * 1000 : stageList.reduce((a, s) => a + s.distanceM, 0),
        elevationGainM: goalType === 'single' ? parseWhole(elev) : stageList.reduce((a, s) => a + s.elevationGainM, 0),
        terrain: terrain || null,
        maxAltitudeM: parseWhole(maxAlt),
        gpxPath: initial?.gpxPath ?? null,
        notes: notes.trim() || null,
        status: initial?.status ?? 'active',
        isDemo: initial?.isDemo,
        stages: stageList,
      })
      await qc.invalidateQueries()
      toast(t('toast.goalSaved'), { icon: 'flag' })
      navigate(`/metas/${id}`)
    } catch (err) {
      console.error(err)
      setFailed(true)
      setSaving(false)
    }
  }

  const stageTotals = stages.reduce(
    (a, s) => ({
      d: a.d + (parseNum(s.km) || 0) * 1000,
      e: a.e + (parseWhole(s.elev) || 0),
    }),
    { d: 0, e: 0 },
  )
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
            hideLegend
            name="goalType"
            value={goalType}
            onChange={setGoalType}
            options={[
              {
                value: 'single',
                label: t('goals.single'),
                help: t('goals.typeSingleHelp'),
              },
              {
                value: 'stage',
                label: t('goals.stage'),
                help: t('goals.typeStageHelp'),
              },
              {
                value: 'triathlon',
                label: t('goals.triathlon'),
                help: t('goals.typeTriHelp'),
              },
            ]}
          />
        )}

        {step === 2 && (
          <>
            <TextField
              label={t('goals.name')}
              placeholder={t('goals.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
            />
            {!isTri && (
              <div className="grid-2">
                <SelectField
                  label={t('goals.sport')}
                  value={sport}
                  onChange={(e) => {
                    setSport(e.target.value as Sport)
                    setSubSport('')
                  }}
                >
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
            )}
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
            {isTri ? (
              <TriDistancePicker preset={preset} onPreset={setPreset} legKm={legKm} onLegKm={setLegKm} errors={errors} elev={elev} onElev={setElev} />
            ) : goalType === 'single' ? (
              <>
                <div className="grid-2">
                  <NumberField label={t('goals.distanceKm')} value={km} onChange={(e) => setKm(e.target.value)} error={errors.km} />
                  <NumberField
                    label={t('goals.elevationM')}
                    optional
                    value={elev}
                    onChange={(e) => setElev(e.target.value)}
                    error={errors.elev}
                    inputMode="numeric"
                  />
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
                <p className="muted">
                  {t('goals.totals', {
                    distance: formatDistance(stageTotals.d),
                    elevation: formatElevation(stageTotals.e),
                  })}
                </p>
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
            {objective === 'time' && isTri && (
              <TriTargets
                target={target}
                onTarget={setTarget}
                legTime={legTime}
                onLegTime={setLegTime}
                errors={errors}
                split={triTargets()}
                cutoffS={presetInfo(preset)?.cutoffS ?? null}
              />
            )}
            {objective === 'time' && !isTri && (
              <>
                <ClockField
                  label={t('goals.targetTotal')}
                  hint={t('goals.clockHint')}
                  placeholder={t('goals.timePlaceholder')}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  error={errors.target}
                  optional={goalType === 'stage'}
                />
                {goalType === 'stage' && (
                  <fieldset>
                    <legend className="legend">{t('goals.targetPerStage')}</legend>
                    <div className="grid-3">
                      {stages.map((s, i) => (
                        <ClockField
                          key={i}
                          label={t('goals.stageN', { n: i + 1 })}
                          placeholder="4:30"
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
            <p className="muted">{isTri ? t('goals.gpxHelpTri') : t('goals.gpxHelp')}</p>
            <div className="field">
              <label htmlFor="g-gpx">{t('goals.gpxChoose')}</label>
              <input id="g-gpx" type="file" onChange={(e) => void onGpx(e.target.files?.[0])} />
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
            <BusyButton type="submit" className="btn btn-primary" busy={saving}>
              {t('goals.save')}
            </BusyButton>
          )}
        </div>
      </form>
    </Page>
  )
}

const LEG_ICON = { swim: 'swim', bike: 'bike', run: 'run' } as const
const kmOf = (p: { swimM: number; bikeM: number; runM: number } | null) =>
  p ? { swim: String(p.swimM / 1000), bike: String(p.bikeM / 1000), run: String(p.runM / 1000) } : {}

/** Distancias del triatlón: catálogo (incluye IRONMAN) o personalizada. */
function TriDistancePicker({
  preset,
  onPreset,
  legKm,
  onLegKm,
  errors,
  elev,
  onElev,
}: {
  preset: TriPreset
  onPreset: (p: TriPreset) => void
  legKm: Record<TriLeg, string>
  onLegKm: (v: Record<TriLeg, string>) => void
  errors: Record<string, string>
  elev: string
  onElev: (v: string) => void
}) {
  const { t } = useTranslation()
  const km = (m: number) => formatDistance(m)
  return (
    <fieldset className="tri-presets">
      <legend className="legend">{t('goals.triDistance')}</legend>
      <div className="tri-preset-grid">
        {[...TRI_PRESETS.map((p) => p.key), 'custom' as const].map((k) => {
          const p = presetInfo(k)
          return (
            <label key={k} className={`tri-preset${preset === k ? ' is-on' : ''}${p?.ironman ? ' is-im' : ''}`}>
              <input
                type="radio"
                name="tri-preset"
                className="visually-hidden"
                checked={preset === k}
                onChange={() => {
                  onPreset(k)
                  if (k === 'custom' && !legKm.swim) onLegKm({ ...legKm, ...kmOf(presetInfo(preset)) })
                }}
              />
              <strong>{t(`triathlon.presets.${k}`)}</strong>
              {p ? (
                <span className="tri-preset-legs">
                  <span>
                    <Icon name="swim" /> {km(p.swimM)}
                  </span>
                  <span>
                    <Icon name="bike" /> {km(p.bikeM)}
                  </span>
                  <span>
                    <Icon name="run" /> {km(p.runM)}
                  </span>
                </span>
              ) : (
                <span className="muted">{t('goals.triCustomHelp')}</span>
              )}
            </label>
          )
        })}
      </div>
      {preset === 'custom' && (
        <div className="grid-3">
          {(['swim', 'bike', 'run'] as const).map((k) => (
            <NumberField
              key={k}
              label={t(`triathlon.legKm.${k}`)}
              value={legKm[k]}
              error={errors[`leg-${k}`]}
              onChange={(e) => onLegKm({ ...legKm, [k]: e.target.value })}
            />
          ))}
        </div>
      )}
      <NumberField label={t('goals.triBikeElevation')} optional value={elev} onChange={(e) => onElev(e.target.value)} inputMode="numeric" />
    </fieldset>
  )
}

/** Tiempo objetivo total y por tramo (sin transiciones), con reparto sugerido. */
function TriTargets({
  target,
  onTarget,
  legTime,
  onLegTime,
  errors,
  split,
  cutoffS,
}: {
  target: string
  onTarget: (v: string) => void
  legTime: Record<TriLeg, string>
  onLegTime: (v: Record<TriLeg, string>) => void
  errors: Record<string, string>
  split: Record<TriLeg, number> | null
  cutoffS: number | null
}) {
  const { t } = useTranslation()
  return (
    <>
      <ClockField
        label={t('goals.targetTotal')}
        hint={t('goals.triTotalHint')}
        placeholder={t('goals.timePlaceholder')}
        value={target}
        onChange={(e) => onTarget(e.target.value)}
        error={errors.target}
        optional
      />
      <fieldset>
        <legend className="legend">{t('goals.triPerLeg')}</legend>
        <p className="hint">{t('goals.triPerLegHint')}</p>
        <div className="grid-3">
          {(['swim', 'bike', 'run'] as const).map((k) => (
            <ClockField
              key={k}
              label={t(`triathlon.legs.${k}`)}
              placeholder={split ? toClock(split[k], 'hh:mm') : '0:45'}
              value={legTime[k]}
              error={errors[`ltime-${k}`]}
              onChange={(e) => onLegTime({ ...legTime, [k]: e.target.value })}
            />
          ))}
        </div>
      </fieldset>
      {split && (
        <div className="tri-split" aria-live="polite">
          <p className="tri-split-title">
            <Icon name="sparkles" /> {t('goals.triSplitTitle')}
          </p>
          <ul>
            {(['swim', 'bike', 'run'] as const).map((k) => (
              <li key={k}>
                <span className="tri-leg-icon" aria-hidden="true">
                  <Icon name={LEG_ICON[k]} />
                </span>
                {t(`triathlon.legs.${k}`)} <strong className="num">{toClock(split[k], 'hh:mm')}</strong>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => onLegTime({ swim: toClock(split.swim, 'hh:mm'), bike: toClock(split.bike, 'hh:mm'), run: toClock(split.run, 'hh:mm') })}
          >
            {t('goals.triUseSplit')}
          </button>
        </div>
      )}
      {cutoffS && <p className="muted small">{t('goals.triCutoff', { time: toClock(cutoffS, 'hh:mm') })}</p>}
    </>
  )
}
