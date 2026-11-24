import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { NumberField, RadioGroup, SelectField, TextField } from '../../components/ui/Field'
import { addDays, formatDate, formatDateTime, formatLongDate, localDayKey, weekStart as weekOf } from '../../core/dates'
import { sessionFueling, type DaySession } from '../../core/nutrition/needs'
import { formatNumber } from '../../core/units'
import { keys, useNutrition, useRepoMutation } from '../../data/hooks'
import { useRepo } from '../../data/RepoProvider'
import { DEFAULT_NUTRITION, type MealPlan, type NutritionPrefs } from '../../data/types'
import { LegalNotice } from '../plan/SessionView'
import { toMenuRequest, useWeekNeeds, type DayRow } from './useWeekNeeds'

const MENUS_PER_DAY = 3
const d = (day: string) => formatDate(`${day}T12:00:00Z`)
const longDay = (day: string) => formatLongDate(`${day}T12:00:00Z`)
const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

export function NutritionPage() {
  const { t } = useTranslation()
  const nutrition = useNutrition()
  const today = localDayKey(new Date())
  const [week, setWeek] = useState<'this' | 'next'>('this')
  const start = week === 'this' ? weekOf(today) : addDays(weekOf(today), 7)

  if (nutrition.isLoading) return <Page title={t('nutrition.title')}><Spinner full /></Page>
  const prefs = nutrition.data ?? null

  return (
    <Page title={t('nutrition.title')}>
      <LegalNotice text={t('nutrition.legal')} />
      <p>{t('nutrition.intro')}</p>
      <ProfileCard prefs={prefs} />
      <fieldset className="toolbar-item week-toggle">
        <legend className="toolbar-label">{t('nutrition.weekOf', { date: d(start) })}</legend>
        <div className="pill-toggle">
          <label>
            <input type="radio" name="nweek" checked={week === 'this'} onChange={() => setWeek('this')} />
            <span>{t('nutrition.thisWeek')}</span>
          </label>
          <label>
            <input type="radio" name="nweek" checked={week === 'next'} onChange={() => setWeek('next')} />
            <span>{t('nutrition.nextWeek')}</span>
          </label>
        </div>
      </fieldset>
      <Week key={start} start={start} prefs={prefs} />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Perfil de alimentación
// ---------------------------------------------------------------------------

function ProfileCard({ prefs }: { prefs: NutritionPrefs | null }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(!prefs)
  if (!editing && prefs) {
    return (
      <section className="card" aria-labelledby="nprofile-h">
        <h2 id="nprofile-h">{t('nutrition.profileTitle')}</h2>
        <p>
          <strong>{t(`nutrition.goals.${prefs.goal}`)}</strong>
          <br />
          {t('nutrition.summary', {
            diet: t(`nutrition.diets.${prefs.dietType}`),
            meals: prefs.mealsPerDay,
            minutes: prefs.cookingMinutes,
            budget: t(`nutrition.budgets.${prefs.budget}`).toLowerCase(),
          })}
          <br />
          {prefs.foodAllergies.length ? t('nutrition.summaryAllergies', { list: prefs.foodAllergies.join(', ') }) : t('nutrition.noAllergies')}
        </p>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
          {t('nutrition.editProfile')}
        </button>
      </section>
    )
  }
  return (
    <section className="card" aria-labelledby="nprofile-h">
      <h2 id="nprofile-h">{t('nutrition.profileTitle')}</h2>
      <p className="muted">{t('nutrition.profileHelp')}</p>
      <NutritionForm prefs={prefs} onSaved={() => setEditing(false)} />
    </section>
  )
}

export function NutritionForm({ prefs, onSaved }: { prefs: NutritionPrefs | null; onSaved?: () => void }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const p = prefs ?? DEFAULT_NUTRITION
  const [goal, setGoal] = useState(p.goal)
  const [diet, setDiet] = useState(p.dietType)
  const [allergies, setAllergies] = useState(p.foodAllergies.join(', '))
  const [excluded, setExcluded] = useState(p.excludedFoods.join(', '))
  const [pantry, setPantry] = useState(p.pantry.join(', '))
  const [meals, setMeals] = useState(String(p.mealsPerDay))
  const [minutes, setMinutes] = useState(String(p.cookingMinutes))
  const [budget, setBudget] = useState(p.budget)
  const [error, setError] = useState<string | null>(null)
  const save = useRepoMutation(
    () =>
      repo.saveNutrition({
        goal,
        dietType: diet,
        foodAllergies: splitList(allergies).slice(0, 30),
        excludedFoods: splitList(excluded).slice(0, 30),
        pantry: splitList(pantry).slice(0, 40),
        mealsPerDay: Number(meals),
        cookingMinutes: Number(minutes),
        budget,
      }),
    [keys.nutrition],
  )
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const m = Number(minutes)
    if (!Number.isInteger(m) || m < 5 || m > 180) return setError(t('activities.mustBePositive'))
    setError(null)
    await save.mutateAsync(undefined)
    onSaved?.()
  }
  return (
    <form onSubmit={onSubmit} noValidate>
      {save.isError && <Alert kind="error">{t('errors.generic')}</Alert>}
      <RadioGroup
        legend={t('nutrition.goal')}
        name="ngoal"
        value={goal}
        onChange={setGoal}
        options={(['perform', 'maintain', 'lose', 'gain'] as const).map((value) => ({ value, label: t(`nutrition.goals.${value}`) }))}
      />
      <RadioGroup
        legend={t('nutrition.diet')}
        name="ndiet"
        value={diet}
        onChange={setDiet}
        options={(['omnivore', 'vegetarian', 'vegan'] as const).map((value) => ({ value, label: t(`nutrition.diets.${value}`) }))}
      />
      <TextField label={t('nutrition.allergies')} hint={t('nutrition.allergiesHelp')} optional value={allergies} onChange={(e) => setAllergies(e.target.value)} maxLength={600} />
      <TextField label={t('nutrition.excluded')} hint={t('nutrition.excludedHelp')} optional value={excluded} onChange={(e) => setExcluded(e.target.value)} maxLength={600} />
      <TextField label={t('nutrition.pantry')} hint={t('nutrition.pantryHelp')} optional value={pantry} onChange={(e) => setPantry(e.target.value)} maxLength={800} />
      <SelectField label={t('nutrition.mealsPerDay')} value={meals} onChange={(e) => setMeals(e.target.value)}>
        {[3, 4, 5, 6].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </SelectField>
      <NumberField label={t('nutrition.cookingMinutes')} value={minutes} onChange={(e) => setMinutes(e.target.value)} error={error} inputMode="numeric" />
      <RadioGroup
        legend={t('nutrition.budget')}
        name="nbudget"
        value={budget}
        onChange={setBudget}
        options={(['low', 'medium', 'high'] as const).map((value) => ({ value, label: t(`nutrition.budgets.${value}`) }))}
      />
      <button className="btn btn-primary" type="submit" disabled={save.isPending}>
        {save.isPending ? t('common.saving') : t('nutrition.save')}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Necesidades y menú de la semana
// ---------------------------------------------------------------------------

function Week({ start, prefs }: { start: string; prefs: NutritionPrefs | null }) {
  const { t } = useTranslation()
  const { person, missing, days, hasPlan, isLoading } = useWeekNeeds(start, prefs)
  if (isLoading) return <Spinner />
  return (
    <>
      <section className="card" aria-labelledby="needs-h">
        <h2 id="needs-h">{t('nutrition.needsTitle')}</h2>
        <p className="muted">{t('nutrition.needsHelp')}</p>
        {missing.length > 0 && (
          <Alert kind="info">
            {t('nutrition.missingData', { list: missing.map((m) => t(`nutrition.missing.${m}`)).join(', ') })}{' '}
            <Link to="/perfil">{t('nutrition.goToProfile')}</Link>
          </Alert>
        )}
        {days && !hasPlan && <p className="notice-estimate">{t('nutrition.noPlan')}</p>}
        {days && person && <NeedsList days={days} weightKg={person.weightKg} />}
      </section>
      <MenuSection start={start} prefs={prefs} days={days} />
    </>
  )
}

function NeedsList({ days, weightKg }: { days: DayRow[]; weightKg: number }) {
  const { t } = useTranslation()
  return (
    <ul className="plain-list needs-list">
      {days.map((day) => (
        <li key={day.date} className="needs-day">
          <div className="row-between">
            <strong className="capitalize-first">
              {longDay(day.date)}
            </strong>
            <span className="badge">{t(`nutrition.dayType.${day.needs.dayType}`)}</span>
          </div>
          <span className="muted">{day.sessions.length ? day.sessions.map((s) => `${t(`plan.kind.${s.kind}`)} · ${t('plan.minutes', { count: s.durationMin })}`).join(' + ') : t('nutrition.rest')}</span>
          <dl className="macro-row">
            <div>
              <dt>{t('nutrition.kcal')}</dt>
              <dd>{formatNumber(day.needs.kcal)}</dd>
            </div>
            <div>
              <dt>{t('nutrition.protein')}</dt>
              <dd>{t('nutrition.grams', { value: day.needs.proteinG })}</dd>
            </div>
            <div>
              <dt>{t('nutrition.carbs')}</dt>
              <dd>{t('nutrition.grams', { value: day.needs.carbsG })}</dd>
            </div>
            <div>
              <dt>{t('nutrition.fat')}</dt>
              <dd>{t('nutrition.grams', { value: day.needs.fatG })}</dd>
            </div>
          </dl>
          {day.sessions.map((s, i) => (
            <FuelingNote key={i} session={s} weightKg={weightKg} />
          ))}
        </li>
      ))}
    </ul>
  )
}

function FuelingNote({ session, weightKg }: { session: DaySession; weightKg: number }) {
  const { t } = useTranslation()
  const f = sessionFueling(session, weightKg)
  const lines: string[] = []
  if (f.before) lines.push(t('nutrition.before', { from: f.before.carbsFromG, to: f.before.carbsToG, hours: f.before.hoursBefore }))
  if (f.during) {
    const o = { from: f.during.carbsPerHourFrom, to: f.during.carbsPerHourTo, fluidFrom: f.during.fluidMlPerHourFrom, fluidTo: f.during.fluidMlPerHourTo }
    lines.push(f.during.carbsPerHourTo > 0 && f.during.carbsPerHourFrom > 0 ? t('nutrition.during', o) : t('nutrition.duringWater', o))
    if (f.during.sodium) lines.push(t('nutrition.sodium'))
  }
  if (f.after) lines.push(f.after.carbsG ? t('nutrition.after', { protein: f.after.proteinG, carbs: f.after.carbsG }) : t('nutrition.afterProtein', { protein: f.after.proteinG }))
  if (!lines.length) return null
  return (
    <ul className="fueling">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  )
}

function errorText(t: TFunction, e: unknown) {
  const code = e instanceof Error ? e.message : ''
  const known = ['ai_not_configured', 'daily_limit', 'nutrition_profile_required', 'ai_busy', 'ai_failed', 'bad_request']
  return known.includes(code) ? t(`nutrition.errors.${code}`) : t('nutrition.errors.generic')
}

function MenuSection({ start, prefs, days }: { start: string; prefs: NutritionPrefs | null; days: DayRow[] | null }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const qc = useQueryClient()
  const plans = useQuery({ queryKey: ['mealPlans'], queryFn: () => repo.listMealPlans() })
  const plan = plans.data?.find((p) => p.weekStart === start) ?? null
  const generate = useRepoMutation(() => repo.generateMenu(toMenuRequest(start, days!)), [['mealPlans']])
  const del = useRepoMutation((id: string) => repo.deleteMealPlan(id), [['mealPlans']])

  const canGenerate = Boolean(prefs && days)
  return (
    <section className="card" aria-labelledby="menu-h">
      <h2 id="menu-h">{t('nutrition.menuTitle')}</h2>
      <p className="muted">{t('nutrition.menuHelp', { count: MENUS_PER_DAY })}</p>
      {repo.kind === 'memory' && <p className="notice-estimate">{t('nutrition.localNotice')}</p>}
      {!prefs && <Alert kind="info">{t('nutrition.needProfile')}</Alert>}
      {prefs && !days && <Alert kind="info">{t('nutrition.needData')}</Alert>}
      {generate.isError && <Alert kind="error">{errorText(t, generate.error)}</Alert>}
      {generate.isPending ? (
        <Spinner label={t('nutrition.generating')} />
      ) : (
        <p>
          <button type="button" className="btn btn-primary" disabled={!canGenerate} onClick={() => generate.mutate(undefined)}>
            {plan ? t('nutrition.regenerate') : t('nutrition.generate')}
          </button>
        </p>
      )}
      {plans.isLoading && <Spinner />}
      {plan && !generate.isPending && (
        <MenuView
          plan={plan}
          onChanged={(p) => qc.setQueryData<MealPlan[]>(['mealPlans'], (old) => [p, ...(old ?? []).filter((x) => x.id !== p.id)])}
          onDelete={() => {
            if (window.confirm(t('nutrition.deleteConfirm'))) del.mutate(plan.id)
          }}
        />
      )}
    </section>
  )
}

function MenuView({ plan, onChanged, onDelete }: { plan: MealPlan; onChanged: (p: MealPlan) => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const [swapping, setSwapping] = useState<string | null>(null)
  const [swapError, setSwapError] = useState<string | null>(null)
  const targets = new Map(plan.inputs.days.map((x) => [x.date, x.kcal]))

  async function swap(date: string, index: number) {
    setSwapping(`${date}-${index}`)
    setSwapError(null)
    try {
      onChanged(await repo.swapMeal(plan.id, date, index))
    } catch (e) {
      setSwapError(errorText(t, e))
    } finally {
      setSwapping(null)
    }
  }

  return (
    <div className="menu-view">
      <p className="muted">{t('nutrition.createdAt', { date: formatDateTime(plan.updatedAt) })}</p>
      {swapError && <Alert kind="error">{swapError}</Alert>}
      {plan.menu.days.map((day) => {
        const total = day.meals.reduce((a, m) => a + m.kcal, 0)
        return (
          <details key={day.date} className="menu-day">
            <summary>
              <span className="capitalize-first">
                {longDay(day.date)}
              </span>{' '}
              <span className="muted">· {t('nutrition.kcalValue', { value: formatNumber(total) })}</span>
            </summary>
            {day.note && <p className="notice-estimate">{day.note}</p>}
            <p className="muted">{t('nutrition.dayTotal', { kcal: formatNumber(total), target: formatNumber(targets.get(day.date) ?? 0) })}</p>
            <ol className="plain-list">
              {day.meals.map((m, i) => {
                const busy = swapping === `${day.date}-${i}`
                return (
                  <li key={i} className="meal">
                    <div className="row-between">
                      <h3 className="meal-title">
                        {m.label}
                        {m.time && <span className="muted"> · {m.time}</span>}
                      </h3>
                    </div>
                    <p className="meal-dish">{m.dish}</p>
                    <ul>
                      {m.items.map((it, j) => (
                        <li key={j}>
                          {it.food}: {it.amount}
                        </li>
                      ))}
                    </ul>
                    <p className="muted">{t('nutrition.mealKcal', { kcal: m.kcal, p: m.proteinG, c: m.carbsG, f: m.fatG })}</p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small no-print"
                      disabled={swapping !== null}
                      aria-label={t('nutrition.swapLabel', { meal: m.label, date: d(day.date) })}
                      onClick={() => swap(day.date, i)}
                    >
                      {busy ? t('nutrition.swapping') : t('nutrition.swap')}
                    </button>
                  </li>
                )
              })}
            </ol>
          </details>
        )
      })}

      <h3>{t('nutrition.shoppingTitle')}</h3>
      {plan.menu.shopping.map((list) => (
        <section key={list.from} className="shopping">
          <h4>{t('nutrition.shoppingRange', { from: d(list.from).slice(0, 5), to: d(list.to).slice(0, 5) })}</h4>
          <ul>
            {list.items.map((it, i) => (
              <li key={i}>
                {it.food}: {it.amount}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {plan.menu.tips.length > 0 && (
        <>
          <h3>{t('nutrition.tips')}</h3>
          <ul>
            {plan.menu.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </>
      )}

      <div className="row no-print">
        <button type="button" className="btn btn-secondary" onClick={() => {
            // Abre todos los días para que salgan en la impresión
            document.querySelectorAll<HTMLDetailsElement>('details.menu-day').forEach((el) => (el.open = true))
            window.print()
          }}>
          {t('nutrition.print')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onDelete}>
          {t('nutrition.delete')}
        </button>
      </div>

      <details className="no-print sent">
        <summary>{t('nutrition.sentTitle')}</summary>
        <p className="muted">{t('nutrition.sentHelp')}</p>
        <pre tabIndex={0}>{JSON.stringify(plan.inputs, null, 2)}</pre>
      </details>
    </div>
  )
}
