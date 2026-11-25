import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../../components/ui/Icon'
import { CountUp } from '../../components/ui/Status'
import { formatDate, formatLongDate } from '../../core/dates'
import { sessionFueling, type DayNeeds, type DaySession, type DayType } from '../../core/nutrition/needs'
import { formatNumber } from '../../core/units'
import type { MenuMeal } from '../../data/types'
import type { DayRow } from './useWeekNeeds'

export const SPORT_ICON: Record<string, IconName> = { cycling: 'bike', running: 'run', swimming: 'swim', strength: 'dumbbell', other: 'activity' }
export const DAY_ICON: Record<DayType, IconName> = { rest: 'bed', light: 'leaf', moderate: 'activity', hard: 'flame', long: 'route' }

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Semana como calendario: cada día con su ícono (deporte o descanso), fecha y calorías. */
export function WeekDays({ days, selected, onSelect, today }: { days: DayRow[]; selected: string; onSelect: (d: string) => void; today: string }) {
  const { t } = useTranslation()
  const max = Math.max(...days.map((d) => d.needs.kcal))
  const min = Math.min(...days.map((d) => d.needs.kcal)) * 0.85
  const types = [...new Set(days.map((d) => d.needs.dayType))]
  return (
    <div className="nday-wrap">
      <p className="toolbar-label">{t('nutrition.pickDay')}</p>
      <ul className="ncal">
        {days.map((d, i) => {
          const h = 20 + ((d.needs.kcal - min) / Math.max(1, max - min)) * 80
          const icon: IconName = d.sessions.length ? (SPORT_ICON[d.sessions[0].sport] ?? 'activity') : 'bed'
          return (
            <li key={d.date} style={{ animationDelay: `${i * 40}ms` }}>
              <button
                type="button"
                className={`ncal-day ncal-${d.needs.dayType}${d.date === selected ? ' is-on' : ''}${d.date === today ? ' is-today' : ''}`}
                aria-pressed={d.date === selected}
                aria-label={t('nutrition.dayButton', {
                  date: formatLongDate(`${d.date}T12:00:00Z`),
                  kcal: formatNumber(d.needs.kcal),
                  type: t(`nutrition.dayType.${d.needs.dayType}`),
                })}
                onClick={() => onSelect(d.date)}
              >
                <span className="ncal-dow" aria-hidden="true">
                  {DOW[i]}
                </span>
                <span className="ncal-num" aria-hidden="true">
                  {Number(d.date.slice(8))}
                </span>
                <span className="ncal-icon" aria-hidden="true">
                  <Icon name={icon} />
                </span>
                <span className="ncal-bar" aria-hidden="true">
                  <span style={{ width: `${h}%`, animationDelay: `${200 + i * 50}ms` }} />
                </span>
                <span className="ncal-kcal num" aria-hidden="true">
                  {formatNumber(d.needs.kcal / 1000, 1)}k
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <ul className="ncal-legend" aria-label={t('nutrition.legend')}>
        {types.map((k) => (
          <li key={k} className={`daytype daytype-${k}`}>
            <Icon name={DAY_ICON[k]} /> {t(`nutrition.dayType.${k}`)}
          </li>
        ))}
        <li className="ncal-legend-note">{t('nutrition.legendKcal')}</li>
      </ul>
    </div>
  )
}

/** Anillo de calorías con la proporción de cada macronutriente. */
export function MacroDonut({ needs }: { needs: DayNeeds }) {
  const { t } = useTranslation()
  const kp = needs.proteinG * 4
  const kc = needs.carbsG * 4
  const kf = needs.fatG * 9
  const total = kp + kc + kf || 1
  const parts = [
    { k: 'p', v: kp / total, cls: 'donut-p' },
    { k: 'c', v: kc / total, cls: 'donut-c' },
    { k: 'f', v: kf / total, cls: 'donut-f' },
  ]
  let acc = 0
  const pct = (v: number) => Math.round(v * 100)
  return (
    <div
      className="donut"
      role="img"
      aria-label={t('nutrition.macroSplit', { kcal: formatNumber(needs.kcal), p: pct(parts[0].v), c: pct(parts[1].v), f: pct(parts[2].v) })}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="48" className="donut-track" />
        {parts.map((p, i) => {
          const seg = (
            <circle
              key={p.k}
              cx="60"
              cy="60"
              r="48"
              pathLength={100}
              className={`donut-seg ${p.cls}`}
              strokeDasharray={`${Math.max(0, p.v * 100 - 1.5)} 100`}
              strokeDashoffset={-acc * 100}
              transform="rotate(-90 60 60)"
              style={{ animationDelay: `${150 + i * 180}ms` }}
            />
          )
          acc += p.v
          return seg
        })}
      </svg>
      <span className="donut-center">
        <Icon name="flame" />
        <strong className="num">
          <CountUp value={needs.kcal} format={(n) => formatNumber(Math.round(n / 10) * 10)} />
        </strong>
        <span>{t('nutrition.kcalUnit')}</span>
      </span>
    </div>
  )
}

/** Barras de proteína, carbohidratos y grasa con su ícono. */
export function MacroBars({ needs, weightKg }: { needs: DayNeeds; weightKg: number }) {
  const { t } = useTranslation()
  const total = needs.proteinG * 4 + needs.carbsG * 4 + needs.fatG * 9 || 1
  const rows: { key: string; icon: IconName; g: number; kcal: number; cls: string }[] = [
    { key: 'protein', icon: 'egg', g: needs.proteinG, kcal: needs.proteinG * 4, cls: 'donut-p' },
    { key: 'carbs', icon: 'wheat', g: needs.carbsG, kcal: needs.carbsG * 4, cls: 'donut-c' },
    { key: 'fat', icon: 'drop', g: needs.fatG, kcal: needs.fatG * 9, cls: 'donut-f' },
  ]
  return (
    <ul className="macro-bars">
      {rows.map((r, i) => {
        const pct = Math.round((r.kcal / total) * 100)
        return (
          <li key={r.key}>
            <span className={`macro-icon ${r.cls}`} aria-hidden="true">
              <Icon name={r.icon} />
            </span>
            <div className="macro-body">
              <div className="row-between">
                <strong>{t(`nutrition.${r.key}`)}</strong>
                <span className="num macro-g">
                  <CountUp value={r.g} format={(n) => `${formatNumber(Math.round(n / 5) * 5)} g`} />
                </span>
              </div>
              <span className="macro-track" aria-hidden="true">
                <span className={r.cls} style={{ width: `${pct}%`, animationDelay: `${200 + i * 120}ms` }} />
              </span>
              <span className="macro-sub">
                {t('nutrition.pctKcal', { pct })} · {t('nutrition.perKg', { value: formatNumber(r.g / weightKg, 1) })}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Antes, durante y después de cada sesión, como línea de tiempo. */
export function FuelingTimeline({ session, weightKg }: { session: DaySession; weightKg: number }) {
  const { t } = useTranslation()
  const f = sessionFueling(session, weightKg)
  const during: string[] = []
  if (f.during) {
    during.push(
      f.during.carbsPerHourFrom > 0
        ? t('nutrition.duringShort', { from: f.during.carbsPerHourFrom, to: f.during.carbsPerHourTo })
        : t('nutrition.duringWaterShort'),
    )
    during.push(t('nutrition.fluidShort', { fluidFrom: f.during.fluidMlPerHourFrom, fluidTo: f.during.fluidMlPerHourTo }))
    if (f.during.sodium) during.push(t('nutrition.sodiumShort'))
  }
  const steps: { key: string; icon: IconName; title: string; lines: string[] }[] = [
    {
      key: 'before',
      icon: 'clock',
      title: t('nutrition.stepBefore'),
      lines: f.before ? [t('nutrition.beforeShort', { from: f.before.carbsFromG, to: f.before.carbsToG, hours: f.before.hoursBefore })] : [],
    },
    { key: 'during', icon: 'drop', title: t('nutrition.stepDuring'), lines: during },
    {
      key: 'after',
      icon: 'refresh',
      title: t('nutrition.stepAfter'),
      lines: f.after
        ? [
            f.after.carbsG
              ? t('nutrition.afterShort', { protein: f.after.proteinG, carbs: f.after.carbsG })
              : t('nutrition.afterProteinShort', { protein: f.after.proteinG }),
          ]
        : [],
    },
  ]
  return (
    <div className="fuel">
      <p className="fuel-session">
        <span className="icon-tile" aria-hidden="true">
          <Icon name={SPORT_ICON[session.sport] ?? 'activity'} />
        </span>
        <strong>
          {t(`plan.kind.${session.kind}`)} · {t(`sports.${session.sport}`)} · {t('plan.minutes', { count: session.durationMin })}
        </strong>
      </p>
      <ol className="fuel-steps">
        {steps.map((s, i) => (
          <li key={s.key} className={s.lines.length ? '' : 'fuel-empty'} style={{ animationDelay: `${i * 120}ms` }}>
            <span className={`fuel-dot fuel-${s.key}`} aria-hidden="true">
              <Icon name={s.icon} />
            </span>
            <div>
              <strong>{s.title}</strong>
              {(s.lines.length ? s.lines : [t('nutrition.noStep')]).map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Ícono según el momento de la comida. */
export function mealIcon(m: Pick<MenuMeal, 'label' | 'time'>): IconName {
  const l = m.label.toLowerCase()
  if (/pre|antes/.test(l)) return 'bolt'
  if (/post|despu|recupera/.test(l)) return 'refresh'
  if (/desayuno/.test(l)) return 'sunrise'
  if (/almuerzo/.test(l)) return 'sun'
  if (/cena|comida/.test(l)) return 'cup'
  if (/media|algo|merienda|snack|refrigerio|onces/.test(l)) return 'apple'
  const h = Number((m.time.match(/\d{1,2}/) ?? ['12'])[0])
  return h < 10 ? 'sunrise' : h < 15 ? 'sun' : h < 18 ? 'apple' : 'moon'
}

/** Barra apilada pequeña de macronutrientes de una comida. */
export function MealMacros({ meal }: { meal: MenuMeal }) {
  const { t } = useTranslation()
  const kp = meal.proteinG * 4
  const kc = meal.carbsG * 4
  const kf = meal.fatG * 9
  const tot = kp + kc + kf || 1
  return (
    <div className="meal-macros">
      <span className="meal-stack" aria-hidden="true">
        <span className="donut-p" style={{ width: `${(kp / tot) * 100}%` }} />
        <span className="donut-c" style={{ width: `${(kc / tot) * 100}%` }} />
        <span className="donut-f" style={{ width: `${(kf / tot) * 100}%` }} />
      </span>
      <span className="meal-macro-legend">
        <span>
          <i className="dot donut-p" aria-hidden="true" /> {t('nutrition.protein')} {meal.proteinG} g
        </span>
        <span>
          <i className="dot donut-c" aria-hidden="true" /> {t('nutrition.carbs')} {meal.carbsG} g
        </span>
        <span>
          <i className="dot donut-f" aria-hidden="true" /> {t('nutrition.fat')} {meal.fatG} g
        </span>
      </span>
    </div>
  )
}

/** Lista de mercado para ir marcando; se recuerda en este dispositivo. */
export function ShoppingChecklist({ planId, lists }: { planId: string; lists: { from: string; to: string; items: { food: string; amount: string }[] }[] }) {
  const { t } = useTranslation()
  const key = `entreno.mercado.${planId}`
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}')
    } catch {
      return {}
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(done))
    } catch {
      /* sin almacenamiento local */
    }
  }, [done, key])
  const total = lists.reduce((a, l) => a + l.items.length, 0)
  const count = Object.values(done).filter(Boolean).length
  return (
    <div className="shop">
      <p className="muted">{t('nutrition.shoppingHelp')}</p>
      <div className="shop-progress">
        <span className="macro-track" aria-hidden="true">
          <span className="prog-good" style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
        </span>
        <span className="num">{t('nutrition.shoppingProgress', { done: count, total })}</span>
      </div>
      {lists.map((list) => (
        <section key={list.from} className="shop-list">
          <h4>
            <Icon name="cart" />{' '}
            {t('nutrition.shoppingRange', { from: formatDate(`${list.from}T12:00:00Z`).slice(0, 5), to: formatDate(`${list.to}T12:00:00Z`).slice(0, 5) })}
          </h4>
          <ul>
            {list.items.map((it, i) => {
              const id = `${list.from}-${i}`
              return (
                <li key={id}>
                  <label className={done[id] ? 'shop-done' : ''}>
                    <input type="checkbox" checked={Boolean(done[id])} onChange={(e) => setDone((x) => ({ ...x, [id]: e.target.checked }))} />
                    <span>
                      <strong>{it.food}</strong> <span className="muted">{it.amount}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
