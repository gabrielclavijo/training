import { useState, type FormEvent } from 'react'
import { useToast } from '../../components/fx/Toast'
import { BusyButton } from '../../components/ui/Busy'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { NumberField, RadioGroup, SelectField, TextField, parseWhole } from '../../components/ui/Field'
import { addDays, formatDate, formatDateTime, formatLongDate, localDayKey, weekStart as weekOf } from '../../core/dates'
import { formatNumber } from '../../core/units'
import { keys, useNutrition, useRepoMutation } from '../../data/hooks'
import { useRepo } from '../../data/RepoProvider'
import { DEFAULT_NUTRITION, type MealPlan, type NutritionPrefs } from '../../data/types'
import { LegalNotice } from '../plan/SessionView'
import { toMenuRequest, useWeekNeeds, type DayRow } from './useWeekNeeds'
import { Icon } from '../../components/ui/Icon'
import { DAY_ICON, FuelingTimeline, MacroBars, MacroDonut, MealMacros, mealIcon, ShoppingChecklist, WeekDays } from './NutritionVisuals'

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

  if (nutrition.isLoading)
    return (
      <Page title={t('nutrition.title')}>
        <Spinner full />
      </Page>
    )
  const prefs = nutrition.data ?? null

  return (
    <Page title={t('nutrition.title')}>
      <LegalNotice id="nutrition" text={t('nutrition.legal')} />
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
        <h2 id="nprofile-h" className="card-title-icon">
          <span className="icon-tile" aria-hidden="true">
            <Icon name="user" />
          </span>
          {t('nutrition.profileTitle')}
        </h2>
        <ul className="chips">
          <li className="chip chip-strong">
            <Icon name="target" /> {t(`nutrition.goals.${prefs.goal}`)}
          </li>
          <li className="chip">
            <Icon name="leaf" /> {t(`nutrition.diets.${prefs.dietType}`)}
          </li>
          <li className="chip">
            <Icon name="food" /> {t('nutrition.chipMeals', { count: prefs.mealsPerDay })}
          </li>
          <li className="chip">
            <Icon name="clock" /> {t('nutrition.chipMinutes', { count: prefs.cookingMinutes })}
          </li>
          <li className="chip">
            <Icon name="coins" />{' '}
            {t('nutrition.chipBudget', {
              value: t(`nutrition.budgets.${prefs.budget}`).toLowerCase(),
            })}
          </li>
          <li className={`chip${prefs.foodAllergies.length ? ' chip-warn' : ''}`}>
            <Icon name="alert" />{' '}
            {prefs.foodAllergies.length
              ? t('nutrition.summaryAllergies', {
                  list: prefs.foodAllergies.join(', '),
                })
              : t('nutrition.noAllergies')}
          </li>
        </ul>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
          {t('nutrition.editProfile')}
        </button>
      </section>
    )
  }
  return (
    <section className="card" aria-labelledby="nprofile-h">
      <h2 id="nprofile-h" className="card-title-icon">
        <span className="icon-tile" aria-hidden="true">
          <Icon name="user" />
        </span>
        {t('nutrition.profileTitle')}
      </h2>
      <p className="muted">{t('nutrition.profileHelp')}</p>
      <NutritionForm prefs={prefs} onSaved={() => setEditing(false)} />
    </section>
  )
}

export function NutritionForm({ prefs, onSaved }: { prefs: NutritionPrefs | null; onSaved?: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
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
        cookingMinutes: parseWhole(minutes) ?? 0,
        budget,
      }),
    [keys.nutrition],
  )
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const m = parseWhole(minutes) ?? NaN
    if (!Number.isInteger(m) || m < 5 || m > 180) return setError(t('activities.mustBePositive'))
    setError(null)
    await save.mutateAsync(undefined)
    toast(t('common.saved'))
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
      <TextField
        label={t('nutrition.allergies')}
        hint={t('nutrition.allergiesHelp')}
        optional
        value={allergies}
        onChange={(e) => setAllergies(e.target.value)}
        maxLength={600}
      />
      <TextField
        label={t('nutrition.excluded')}
        hint={t('nutrition.excludedHelp')}
        optional
        value={excluded}
        onChange={(e) => setExcluded(e.target.value)}
        maxLength={600}
      />
      <TextField
        label={t('nutrition.pantry')}
        hint={t('nutrition.pantryHelp')}
        optional
        value={pantry}
        onChange={(e) => setPantry(e.target.value)}
        maxLength={800}
      />
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
        options={(['low', 'medium', 'high'] as const).map((value) => ({
          value,
          label: t(`nutrition.budgets.${value}`),
        }))}
      />
      <BusyButton className="btn btn-primary" type="submit" busy={save.isPending}>
        {t('nutrition.save')}
      </BusyButton>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Necesidades y menú de la semana
// ---------------------------------------------------------------------------

function Week({ start, prefs }: { start: string; prefs: NutritionPrefs | null }) {
  const { t } = useTranslation()
  const today = localDayKey(new Date())
  const { person, missing, days, hasPlan, isLoading } = useWeekNeeds(start, prefs)
  const [selected, setSelected] = useState(today >= start && today <= addDays(start, 6) ? today : start)
  if (isLoading) return <Spinner />
  const day = days?.find((x) => x.date === selected) ?? days?.[0]
  return (
    <>
      <section className="card" aria-labelledby="needs-h">
        <h2 id="needs-h" className="card-title-icon">
          <span className="icon-tile icon-tile-coral" aria-hidden="true">
            <Icon name="flame" />
          </span>
          {t('nutrition.needsTitle')}
        </h2>
        <p className="muted">{t('nutrition.needsHelp')}</p>
        {missing.length > 0 && (
          <Alert kind="info">
            {t('nutrition.missingData', {
              list: missing.map((m) => t(`nutrition.missing.${m}`)).join(', '),
            })}{' '}
            <Link to="/perfil">{t('nutrition.goToProfile')}</Link>
          </Alert>
        )}
        {days && !hasPlan && <p className="notice-estimate">{t('nutrition.noPlan')}</p>}
        {days && person && day && (
          <>
            <WeekDays days={days} selected={day.date} onSelect={setSelected} today={today} />
            <DayDetail key={day.date} day={day} weightKg={person.weightKg} />
          </>
        )}
      </section>
      <MenuSection start={start} prefs={prefs} days={days} selected={day?.date ?? start} onSelect={setSelected} />
    </>
  )
}

function DayDetail({ day, weightKg }: { day: DayRow; weightKg: number }) {
  const { t } = useTranslation()
  return (
    <div className="nday-detail" aria-live="polite">
      <div className="row-between nday-head">
        <h3 className="capitalize-first">{longDay(day.date)}</h3>
        <span className={`daytype daytype-${day.needs.dayType}`}>
          <Icon name={DAY_ICON[day.needs.dayType]} /> {t(`nutrition.dayType.${day.needs.dayType}`)}
        </span>
      </div>
      <div className="nday-macros">
        <MacroDonut needs={day.needs} />
        <MacroBars needs={day.needs} weightKg={weightKg} />
      </div>
      {day.sessions.length === 0 ? (
        <p className="fuel-none">
          <span className="icon-tile icon-tile-soft" aria-hidden="true">
            <Icon name="bed" />
          </span>
          {t('nutrition.fuelingNone')}
        </p>
      ) : (
        day.sessions.map((s, i) => <FuelingTimeline key={i} session={s} weightKg={weightKg} />)
      )}
    </div>
  )
}

function errorText(t: TFunction, e: unknown) {
  const code = e instanceof Error ? e.message : ''
  const known = ['ai_not_configured', 'daily_limit', 'nutrition_profile_required', 'ai_busy', 'ai_failed', 'bad_request']
  return known.includes(code) ? t(`nutrition.errors.${code}`) : t('nutrition.errors.generic')
}

function MenuSection({
  start,
  prefs,
  days,
  selected,
  onSelect,
}: {
  start: string
  prefs: NutritionPrefs | null
  days: DayRow[] | null
  selected: string
  onSelect: (d: string) => void
}) {
  const { t } = useTranslation()
  const repo = useRepo()
  const qc = useQueryClient()
  const plans = useQuery({
    queryKey: ['mealPlans'],
    queryFn: () => repo.listMealPlans(),
  })
  const plan = plans.data?.find((p) => p.weekStart === start) ?? null
  const toast = useToast()
  const generate = useRepoMutation(async () => {
    const r = await repo.generateMenu(toMenuRequest(start, days!))
    toast(t('nutrition.menuReady'), { icon: 'sparkles' })
    return r
  }, [['mealPlans']])
  const del = useRepoMutation(
    async (id: string) => {
      await repo.deleteMealPlan(id)
      toast(t('nutrition.menuDeleted'), { icon: 'trash' })
    },
    [['mealPlans']],
  )

  const canGenerate = Boolean(prefs && days)
  return (
    <section className="card" aria-labelledby="menu-h">
      <h2 id="menu-h" className="card-title-icon">
        <span className="icon-tile" aria-hidden="true">
          <Icon name="food" />
        </span>
        {t('nutrition.menuTitle')}
      </h2>
      {repo.kind === 'memory' && <p className="notice-estimate">{t('nutrition.localNotice')}</p>}
      {!prefs && <Alert kind="info">{t('nutrition.needProfile')}</Alert>}
      {prefs && !days && <Alert kind="info">{t('nutrition.needData')}</Alert>}
      {generate.isError && <Alert kind="error">{errorText(t, generate.error)}</Alert>}
      {generate.isPending ? (
        <div className="ai-working">
          <span className="ai-orb" aria-hidden="true">
            <Icon name="sparkles" />
          </span>
          <Spinner label={t('nutrition.generating')} />
        </div>
      ) : (
        <div className={`ai-cta${plan ? ' ai-cta-small' : ''}`}>
          {!plan && (
            <>
              <span className="ai-orb" aria-hidden="true">
                <Icon name="sparkles" />
              </span>
              <p className="ai-cta-title">{t('nutrition.generateTitle')}</p>
              <p className="muted">{t('nutrition.menuHelp', { count: MENUS_PER_DAY })}</p>
            </>
          )}
          <button type="button" className={`btn ${plan ? 'btn-secondary' : 'btn-primary'}`} disabled={!canGenerate} onClick={() => generate.mutate(undefined)}>
            <Icon name={plan ? 'refresh' : 'sparkles'} /> {plan ? t('nutrition.regenerate') : t('nutrition.generate')}
          </button>
        </div>
      )}
      {plans.isLoading && <Spinner />}
      {plan && !generate.isPending && (
        <MenuView
          plan={plan}
          days={days}
          selected={selected}
          onSelect={onSelect}
          onChanged={(p) => qc.setQueryData<MealPlan[]>(['mealPlans'], (old) => [p, ...(old ?? []).filter((x) => x.id !== p.id)])}
          deleting={del.isPending}
          onDelete={() => {
            if (window.confirm(t('nutrition.deleteConfirm'))) del.mutate(plan.id)
          }}
        />
      )}
    </section>
  )
}

function MenuView({
  plan,
  days,
  selected,
  onSelect,
  onChanged,
  onDelete,
  deleting = false,
}: {
  plan: MealPlan
  days: DayRow[] | null
  selected: string
  onSelect: (d: string) => void
  onChanged: (p: MealPlan) => void
  onDelete: () => void
  deleting?: boolean
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const repo = useRepo()
  const [swapping, setSwapping] = useState<string | null>(null)
  const [swapError, setSwapError] = useState<string | null>(null)
  const targets = new Map(plan.inputs.days.map((x) => [x.date, x.kcal]))
  const today = localDayKey(new Date())
  const day = plan.menu.days.find((x) => x.date === selected) ?? plan.menu.days[0]

  async function swap(date: string, index: number) {
    setSwapping(`${date}-${index}`)
    setSwapError(null)
    try {
      onChanged(await repo.swapMeal(plan.id, date, index))
      toast(t('nutrition.swapped'), { icon: 'refresh' })
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
      {days && <WeekDays days={days} selected={day.date} onSelect={onSelect} today={today} />}
      <div key={day.date} className="menu-day-view">
        <div className="row-between">
          <h3 className="capitalize-first">{t('nutrition.menuOfDay', { date: longDay(day.date) })}</h3>
          <span className="pill-kcal num">
            <Icon name="flame" />{' '}
            {t('nutrition.dayTotalShort', {
              kcal: formatNumber(day.meals.reduce((a, m) => a + m.kcal, 0)),
              target: formatNumber(targets.get(day.date) ?? 0),
            })}
          </span>
        </div>
        {day.note && (
          <p className="tip-inline">
            <Icon name="drop" /> {day.note}
          </p>
        )}
        <ol className="meal-cards">
          {day.meals.map((m, i) => {
            const busy = swapping === `${day.date}-${i}`
            return (
              <li key={`${m.dish}-${i}`} className={`meal-card${busy ? ' meal-busy' : ''}`} style={{ animationDelay: `${i * 70}ms` }}>
                <div className="meal-top">
                  <span className="meal-icon" aria-hidden="true">
                    <Icon name={mealIcon(m)} />
                  </span>
                  <div className="meal-headings">
                    <span className="meal-label">
                      {m.label}
                      {m.time && <span className="meal-time"> · {m.time}</span>}
                    </span>
                    <h4 className="meal-dish">{m.dish}</h4>
                  </div>
                  <span className="pill-kcal num">{m.kcal} kcal</span>
                </div>
                <MealMacros meal={m} />
                <ul className="ingredients" aria-label={t('nutrition.ingredients')}>
                  {m.items.map((it, j) => (
                    <li key={j}>
                      <span className="ing-food">{it.food}</span>
                      <span className="ing-amount">{it.amount}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn-secondary btn-small no-print"
                  disabled={swapping !== null}
                  aria-label={t('nutrition.swapLabel', {
                    meal: m.label,
                    date: d(day.date),
                  })}
                  onClick={() => swap(day.date, i)}
                >
                  {busy ? <span className="btn-spinner" aria-hidden="true" /> : <Icon name="refresh" />} {busy ? t('nutrition.swapping') : t('nutrition.swap')}
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      {plan.menu.tips.length > 0 && (
        <>
          <h3 className="card-title-icon">
            <span className="icon-tile icon-tile-sky" aria-hidden="true">
              <Icon name="bulb" />
            </span>
            {t('nutrition.tips')}
          </h3>
          <ul className="tips">
            {plan.menu.tips.map((tip) => (
              <li key={tip}>
                <Icon name="bulb" /> <span>{tip}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="card-title-icon">
        <span className="icon-tile icon-tile-coral" aria-hidden="true">
          <Icon name="cart" />
        </span>
        {t('nutrition.shoppingTitle')}
      </h3>
      <ShoppingChecklist planId={plan.id} lists={plan.menu.shopping} />

      {/* Para imprimir: la semana completa */}
      <div className="print-only">
        {plan.menu.days.map((pd) => (
          <section key={pd.date}>
            <h3>{longDay(pd.date)}</h3>
            <ul>
              {pd.meals.map((m, i) => (
                <li key={i}>
                  <strong>
                    {m.label} {m.time}: {m.dish}
                  </strong>{' '}
                  ({m.kcal} kcal) — {m.items.map((it) => `${it.food} ${it.amount}`).join(', ')}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="row no-print menu-actions">
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
          <Icon name="printer" /> {t('nutrition.print')}
        </button>
        <BusyButton type="button" className="btn btn-secondary" busy={deleting} busyLabel={t('common.deleting')} onClick={onDelete}>
          <Icon name="trash" /> {t('nutrition.delete')}
        </BusyButton>
      </div>

      <details className="no-print sent">
        <summary>{t('nutrition.sentTitle')}</summary>
        <p className="muted">{t('nutrition.sentHelp')}</p>
        <pre tabIndex={0}>{JSON.stringify(plan.inputs, null, 2)}</pre>
      </details>
    </div>
  )
}
