import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/fx/Toast'
import { BusyButton } from '../../components/ui/Busy'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { NumberField, SelectField, parseWhole } from '../../components/ui/Field'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import type { Availability, Weekday } from '../../core/planner/plan'
import { formatDuration } from '../../core/units'
import { useRepo } from '../../data/RepoProvider'
import { usePlan } from './usePlan'

const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]

export function AvailabilityPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const repo = useRepo()
  const qc = useQueryClient()
  const { derived, isLoading } = usePlan()
  const [mins, setMins] = useState<Record<Weekday, string> | null>(null)
  const [longDay, setLongDay] = useState<Weekday>(6)
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!derived || mins) return
    const a = derived.ctx.availability
    setMins(Object.fromEntries(DAYS.map((d) => [d, String(a.minutesByDay[d] ?? 0)])) as Record<Weekday, string>)
    setLongDay(a.longDay)
  }, [derived, mins])

  if (isLoading || !mins)
    return (
      <Page title={t('plan.availability.title')}>
        <Spinner full />
      </Page>
    )
  const total = DAYS.reduce((s, d) => s + (parseWhole(mins[d]) || 0), 0)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<number, string> = {}
    const out = {} as Availability['minutesByDay']
    for (const d of DAYS) {
      const v = parseWhole(mins![d])
      if (v === null || Number.isNaN(v) || v < 0 || v > 600) errs[d] = '0–600'
      else out[d] = Math.round(v)
    }
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    await repo.saveAvailability({ minutesByDay: out, longDay })
    await qc.invalidateQueries()
    setSaved(true)
    toast(t('common.saved'))
    setBusy(false)
  }

  return (
    <Page title={t('plan.availability.title')}>
      <p className="muted">{t('plan.availability.help')}</p>
      {derived?.ctx.availabilityIsDefault && <Alert kind="info">{t('plan.availability.suggested')}</Alert>}
      <form className="card" onSubmit={onSubmit} noValidate>
        {saved && <Alert kind="success">{t('plan.availability.saved')}</Alert>}
        <div className="grid-2">
          {DAYS.map((d) => (
            <NumberField
              key={d}
              label={t('plan.availability.minutesLabel', {
                day: t(`plan.availability.day.${d}`),
              })}
              inputMode="numeric"
              value={mins[d]}
              error={errors[d]}
              onChange={(e) => {
                setSaved(false)
                setMins({ ...mins, [d]: e.target.value })
              }}
            />
          ))}
        </div>
        <SelectField label={t('plan.availability.longDay')} value={longDay} onChange={(e) => setLongDay(Number(e.target.value) as Weekday)}>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {t(`plan.availability.day.${d}`)}
            </option>
          ))}
        </SelectField>
        <p className="muted">{t('plan.availability.weekly', { hours: formatDuration(total * 60) })}</p>
        <BusyButton type="submit" className="btn btn-primary" busy={busy}>
          {t('plan.availability.save')}
        </BusyButton>
      </form>
    </Page>
  )
}
