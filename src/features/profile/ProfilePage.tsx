import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Page } from '../../components/ui/Page'
import { RadioGroup, TextField } from '../../components/ui/Field'
import { formatDate } from '../../core/dates'
import { formatPower } from '../../core/units'
import { keys, useNutrition, usePhysiology, useRepoMutation } from '../../data/hooks'
import { useRepo } from '../../data/RepoProvider'
import type { DietType } from '../../data/types'
import { HealthSection } from './HealthSection'
import { BasicsForm, PhysiologyForm, WeightSection } from './forms'

export function ProfilePage() {
  const { t } = useTranslation()
  return (
    <Page title={t('profile.title')}>
      <section className="card" aria-labelledby="basics-h">
        <h2 id="basics-h">{t('profile.basics')}</h2>
        <BasicsForm />
      </section>
      <section className="card" aria-labelledby="weight-h">
        <h2 id="weight-h">{t('profile.weight')}</h2>
        <WeightSection />
      </section>
      <section className="card" aria-labelledby="phys-h">
        <h2 id="phys-h">{t('profile.physiology')}</h2>
        <PhysiologyForm />
        <PhysiologyHistory />
      </section>
      <section className="card" aria-labelledby="health-h">
        <h2 id="health-h">{t('profile.health')}</h2>
        <HealthSection />
      </section>
      <section className="card" aria-labelledby="nutrition-h">
        <h2 id="nutrition-h">{t('profile.nutrition')}</h2>
        <NutritionForm />
      </section>
    </Page>
  )
}

function PhysiologyHistory() {
  const { t } = useTranslation()
  const phys = usePhysiology()
  const repo = useRepo()
  const del = useRepoMutation((id: string) => repo.deletePhysiology(id), [keys.physiology])
  if (!phys.data) return null
  if (phys.data.length === 0) return <p className="muted" style={{ marginTop: 'var(--space-4)' }}>{t('profile.noPhysiology')}</p>
  return (
    <>
      <h3 style={{ marginTop: 'var(--space-5)' }}>{t('profile.physiologyHistory')}</h3>
      <ul className="plain-list">
        {[...phys.data].reverse().map((p) => {
          const parts = [
            p.hrRest && `${t('profile.hrRest')}: ${p.hrRest}`,
            p.hrMax && `${t('profile.hrMax')}: ${p.hrMax}`,
            p.hrThreshold && `${t('profile.hrThreshold')}: ${p.hrThreshold}`,
            p.ftpW && `FTP: ${formatPower(p.ftpW)}`,
          ].filter(Boolean)
          const label = `${t('profile.effectiveFrom')} ${formatDate(`${p.effectiveFrom}T12:00:00Z`)}`
          return (
            <li key={p.id} className="row-between">
              <span>
                <strong>{label}</strong>
                <br />
                <span className="muted">{parts.join(' · ') || '—'}</span>
              </span>
              <button type="button" className="btn-link" onClick={() => del.mutate(p.id)} aria-label={`${t('profile.delete')}: ${label}`}>
                {t('profile.delete')}
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function NutritionForm() {
  const { t } = useTranslation()
  const repo = useRepo()
  const nutrition = useNutrition()
  const [diet, setDiet] = useState<DietType>('omnivore')
  const [excluded, setExcluded] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (nutrition.data) {
      setDiet(nutrition.data.dietType)
      setExcluded(nutrition.data.excludedFoods.join(', '))
    }
  }, [nutrition.data])
  const save = useRepoMutation(
    () =>
      repo.saveNutrition({
        dietType: diet,
        excludedFoods: excluded
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    [keys.nutrition],
  )
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    await save.mutateAsync(undefined)
    setSaved(true)
  }
  return (
    <form onSubmit={onSubmit} noValidate>
      {saved && <Alert kind="success">{t('common.saved')}</Alert>}
      <RadioGroup
        legend={t('profile.diet')}
        name="diet"
        value={diet}
        onChange={setDiet}
        options={[
          { value: 'omnivore', label: t('profile.dietOmnivore') },
          { value: 'vegetarian', label: t('profile.dietVegetarian') },
          { value: 'vegan', label: t('profile.dietVegan') },
        ]}
      />
      <TextField label={t('profile.excluded')} hint={t('profile.excludedHelp')} optional value={excluded} onChange={(e) => setExcluded(e.target.value)} />
      <button className="btn btn-primary" type="submit" disabled={save.isPending}>
        {t('profile.saveNutrition')}
      </button>
    </form>
  )
}
