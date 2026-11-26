import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { BusyButton } from '../../components/ui/Busy'
import { NumberField, RadioGroup, parseNum } from '../../components/ui/Field'
import { Icon, type IconName } from '../../components/ui/Icon'
import { DEFAULT_STRENGTH, EQUIPMENT, type Discomfort, type Equip, type StrengthLocation, type StrengthPrefs } from '../../core/strength/library'
import { useRepoMutation, useStrengthPrefs } from '../../data/hooks'
import { useRepo } from '../../data/RepoProvider'

const LOCATIONS: { v: StrengthLocation; icon: IconName }[] = [
  { v: 'home', icon: 'home' },
  { v: 'gym', icon: 'dumbbell' },
  { v: 'both', icon: 'refresh' },
]
const DISCOMFORT: Discomfort[] = ['knee', 'low_back', 'shoulder']

/** «Tu fuerza»: si va en el plan, dónde, con qué equipo y qué molestias cuidar. */
export function StrengthPrefsCard({ id = 'tu-fuerza' }: { id?: string }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const { data, isLoading } = useStrengthPrefs()
  const [p, setP] = useState<StrengthPrefs | null>(null)
  const [kg, setKg] = useState('')
  const [kgError, setKgError] = useState<string>()
  useEffect(() => {
    if (isLoading || p) return
    const v = data ?? DEFAULT_STRENGTH
    setP(v)
    setKg(v.dumbbellMaxKg ? String(v.dumbbellMaxKg).replace('.', ',') : '')
  }, [data, isLoading, p])
  const save = useRepoMutation((x: StrengthPrefs) => repo.saveStrengthPrefs(x), 'all', { success: t('strength.saved'), icon: 'dumbbell' })
  if (!p) return null

  const set = (patch: Partial<StrengthPrefs>) => setP({ ...p, ...patch })
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const home = p.location !== 'gym'

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    let max: number | null = null
    if (p!.equipment.includes('dumbbells') && kg.trim()) {
      max = parseNum(kg)
      if (max === null || Number.isNaN(max) || max < 0.5 || max > 100) {
        setKgError(t('strength.kgInvalid'))
        return
      }
    }
    setKgError(undefined)
    save.mutate({ ...p!, dumbbellMaxKg: max })
  }

  return (
    <form className="card strength-prefs" onSubmit={onSubmit} noValidate aria-labelledby={id}>
      <h2 id={id} className="sp-title">
        <Icon name="dumbbell" /> {t('strength.title')}
      </h2>
      <p className="muted">{t('strength.help')}</p>

      <label className="switch-row">
        <span>{t('strength.enabled')}</span>
        <input type="checkbox" role="switch" checked={p.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        <span className="switch" aria-hidden="true" />
      </label>
      {!p.enabled && <p className="hint">{t('strength.disabledHint')}</p>}

      {p.enabled && (
        <>
          <fieldset>
            <legend className="legend">{t('strength.where')}</legend>
            <div className="place-opts">
              {LOCATIONS.map(({ v, icon }) => (
                <label key={v} className={`place-opt${p.location === v ? ' is-on' : ''}`}>
                  <input type="radio" name="sp-location" className="visually-hidden" checked={p.location === v} onChange={() => set({ location: v })} />
                  <Icon name={icon} />
                  <strong>{t(`strength.location.${v}`)}</strong>
                  <span>{t(`strength.locationHint.${v}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {home && (
            <fieldset>
              <legend className="legend">{t('strength.equipment')}</legend>
              <p className="hint">{t('strength.equipmentHint')}</p>
              <div className="tag-row">
                <label className={`tag-opt${p.equipment.length === 0 ? ' is-on' : ''}`}>
                  <input type="checkbox" className="visually-hidden" checked={p.equipment.length === 0} onChange={() => set({ equipment: [] })} />
                  {p.equipment.length === 0 && <Icon name="check" />}
                  {t('strength.nothing')}
                </label>
                {EQUIPMENT.map((q: Equip) => {
                  const on = p.equipment.includes(q)
                  return (
                    <label key={q} className={`tag-opt${on ? ' is-on' : ''}`}>
                      <input type="checkbox" className="visually-hidden" checked={on} onChange={() => set({ equipment: toggle(p.equipment, q) })} />
                      {on && <Icon name="check" />}
                      {t(`strength.equip.${q}`)}
                    </label>
                  )
                })}
              </div>
              {p.equipment.includes('dumbbells') && (
                <NumberField label={t('strength.dumbbellKg')} inputMode="decimal" value={kg} error={kgError} optional onChange={(e) => setKg(e.target.value)} />
              )}
            </fieldset>
          )}

          <RadioGroup
            legend={t('strength.experience')}
            name="sp-exp"
            value={p.experience}
            onChange={(v) => set({ experience: v })}
            options={(['new', 'some', 'regular'] as const).map((v) => ({ value: v, label: t(`strength.exp.${v}`), help: t(`strength.expMinutes.${v}`) }))}
          />

          <fieldset>
            <legend className="legend">{t('strength.discomfort')}</legend>
            <p className="hint">{t('strength.discomfortHint')}</p>
            <div className="tag-row">
              {DISCOMFORT.map((d) => {
                const on = p.discomfort.includes(d)
                return (
                  <label key={d} className={`tag-opt${on ? ' is-on' : ''}`}>
                    <input type="checkbox" className="visually-hidden" checked={on} onChange={() => set({ discomfort: toggle(p.discomfort, d) })} />
                    {on && <Icon name="check" />}
                    {t(`strength.disc.${d}`)}
                  </label>
                )
              })}
            </div>
          </fieldset>
        </>
      )}

      <BusyButton type="submit" className="btn btn-primary" busy={save.isPending}>
        {t('strength.save')}
      </BusyButton>
    </form>
  )
}
