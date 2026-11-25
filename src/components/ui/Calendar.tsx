import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { addDays, weekStart } from '../../core/dates'
import { Sheet } from '../fx/Sheet'
import { haptic } from '../fx/motion'
import { Icon, type IconName } from './Icon'

/** Un elemento de un día (sesión, actividad, comida…). */
export interface CalItem {
  id: string
  icon: IconName
  /** Color del ícono */
  tone?: 'mint' | 'coral' | 'sky' | 'amber' | 'soft' | 'rest'
  title: string
  meta?: string
  /** Valor a la derecha (p. ej. «245 pts») */
  value?: string
  to?: string
  /** Etiqueta pequeña (estado) */
  badge?: { text: string; tone: 'good' | 'warn' | 'info' }
}

export interface CalDay {
  items: CalItem[]
  /** Aspecto del día en la cuadrícula */
  mark?: 'done' | 'missed' | 'event' | 'pause' | 'planned'
  /** «Total: …» en el detalle del día */
  total?: string
  /** Texto cuando el día no tiene elementos (p. ej. «Descanso») */
  empty?: { text: string; icon: IconName }
}

export type CalView = 'week' | 'month'

const MONTH = new Intl.DateTimeFormat('es-CO', { month: 'long', timeZone: 'UTC' })
const LONG = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const toDate = (d: string) => new Date(`${d}T12:00:00Z`)
const monthStart = (d: string) => `${d.slice(0, 7)}-01`
const addMonths = (d: string, n: number) => {
  const x = toDate(monthStart(d))
  x.setUTCMonth(x.getUTCMonth() + n)
  return x.toISOString().slice(0, 10)
}
const longDay = (d: string) => {
  const s = LONG.format(toDate(d))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Calendario con vista de semana o mes. Cada día muestra íconos pequeños de lo
 * que tiene; al tocarlo se abre el detalle del día con su total.
 * En la vista de semana, debajo va la agenda de los 7 días.
 */
export function Calendar({
  label,
  today,
  getDay,
  summary,
  above,
  defaultView = 'month',
  min,
  max,
  agendaCompact = false,
}: {
  label: string
  today: string
  getDay: (day: string) => CalDay | undefined
  /** Texto a la derecha del mes (p. ej. «Carga del mes: 1.234») */
  summary?: (r: { view: CalView; from: string; to: string }) => ReactNode
  /** Contenido extra debajo de la navegación (depende de la semana o el mes visible) */
  above?: (r: { view: CalView; from: string; to: string }) => ReactNode
  defaultView?: CalView
  /** Límites de navegación (día AAAA-MM-DD) */
  min?: string
  max?: string
  agendaCompact?: boolean
}) {
  const { t } = useTranslation()
  const [view, setView] = useState<CalView>(defaultView)
  const [anchor, setAnchor] = useState(today)
  const [open, setOpen] = useState<string | null>(null)
  const [dir, setDir] = useState<0 | 1 | -1>(0)

  const from = view === 'week' ? weekStart(anchor) : monthStart(anchor)
  const to = view === 'week' ? addDays(from, 6) : addDays(addMonths(anchor, 1), -1)
  const range = { view, from, to }
  const prevOk = !min || from > min
  const nextOk = !max || to < max
  const move = (n: 1 | -1) => {
    setDir(n)
    setAnchor(view === 'week' ? addDays(from, n * 7) : addMonths(anchor, n))
  }

  // Celdas: en el mes se completa la primera semana con días vacíos
  const lead = view === 'month' ? (toDate(from).getUTCDay() + 6) % 7 : 0
  const count = Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000) + 1
  const days = Array.from({ length: count }, (_, i) => addDays(from, i))
  const todayCol = (toDate(today).getUTCDay() + 6) % 7
  const title = view === 'week' ? `${toDate(from).getUTCDate()}–${toDate(to).getUTCDate()} ${MONTH.format(toDate(to))}` : MONTH.format(toDate(from))
  const year = toDate(to).getUTCFullYear()
  const openDay = open ? getDay(open) : undefined

  return (
    <div className="cal">
      <div className="seg" role="group" aria-label={t('cal.view')}>
        {(['week', 'month'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={`seg-btn${view === v ? ' is-on' : ''}`}
            aria-pressed={view === v}
            onClick={() => {
              setView(v)
              setDir(0)
            }}
          >
            {t(`cal.${v}`)}
          </button>
        ))}
        <span className={`seg-thumb seg-thumb-${view}`} aria-hidden="true" />
      </div>

      <div className="cal-head">
        <div className="cal-nav">
          <button type="button" className="cal-arrow" onClick={() => move(-1)} disabled={!prevOk}>
            <Icon name="chevronLeft" />
            <span className="visually-hidden">{t(view === 'week' ? 'cal.prevWeek' : 'cal.prevMonth')}</span>
          </button>
          <h2 className="cal-title" aria-live="polite">
            <span className="capitalize-first">{title}</span> <span className="cal-year">{year}</span>
          </h2>
          <button type="button" className="cal-arrow" onClick={() => move(1)} disabled={!nextOk}>
            <Icon name="chevronRight" />
            <span className="visually-hidden">{t(view === 'week' ? 'cal.nextWeek' : 'cal.nextMonth')}</span>
          </button>
          {(today < from || today > to) && (
            <button
              type="button"
              className="cal-today-btn"
              onClick={() => {
                setDir(today < from ? -1 : 1)
                setAnchor(today)
              }}
            >
              {t('cal.today')}
            </button>
          )}
        </div>
        {summary && <div className="cal-summary">{summary(range)}</div>}
      </div>
      {above?.(range)}

      <div className={`cal-grid-wrap cal-${view}`} key={`${view}-${from}`} data-dir={dir}>
        <div className="cal-dow" aria-hidden="true">
          {DAY_SHORT.map((d, i) => (
            <span key={d} className={i === todayCol ? 'is-today' : undefined}>
              {d}
            </span>
          ))}
        </div>
        <ol className="cal-grid" aria-label={label}>
          {Array.from({ length: lead }, (_, i) => (
            <li key={`e${i}`} className="cal-blank" aria-hidden="true" />
          ))}
          {days.map((d, i) => {
            const info = getDay(d)
            const items = info?.items ?? []
            const icons = [...new Map(items.map((x) => [x.icon + (x.tone ?? ''), x])).values()].slice(0, 3)
            const cls = ['cal-day', items.length > 0 && 'has-items', info?.mark && `mark-${info.mark}`, d === today && 'is-today', d < today && 'is-past']
              .filter(Boolean)
              .join(' ')
            const aria = [longDay(d), items.length ? items.map((x) => x.title).join(', ') : info?.empty?.text, info?.total].filter(Boolean).join('. ')
            return (
              <li key={d} style={{ animationDelay: `${Math.min(i, 34) * 12}ms` }}>
                <button
                  type="button"
                  className={cls}
                  aria-label={aria}
                  aria-current={d === today ? 'date' : undefined}
                  onClick={() => {
                    haptic(8)
                    setOpen(d)
                  }}
                >
                  <span className="cal-icons" aria-hidden="true">
                    {icons.map((x) => (
                      <span key={x.id} className={`cal-ic tone-${x.tone ?? 'mint'}`}>
                        <Icon name={x.icon} />
                      </span>
                    ))}
                  </span>
                  <span className="cal-num">{toDate(d).getUTCDate()}</span>
                  <span className="cal-dot" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      {view === 'week' && (
        <ol className={`cal-agenda${agendaCompact ? ' is-compact' : ''}`}>
          {days.map((d, i) => {
            const info = getDay(d)
            return (
              <li key={d} className={d === today ? 'is-today' : undefined} style={{ animationDelay: `${i * 40}ms` }}>
                <h3 className="cal-agenda-day">
                  <span className="capitalize-first">{longDay(d)}</span>
                  {d === today && <span className="badge badge-info">{t('cal.today')}</span>}
                </h3>
                <DayItems info={info} />
              </li>
            )
          })}
        </ol>
      )}

      <Sheet open={open !== null} onClose={() => setOpen(null)} side="center" label={open ? longDay(open) : ''} className="cal-pop">
        {open && (
          <>
            <div className="cal-pop-head">
              <h2 className="sheet-head">
                {LONG.format(toDate(open)).split(',').reverse().join(', ').replace(/^ /, '')}
              </h2>
              <button type="button" className="icon-btn" onClick={() => setOpen(null)}>
                <Icon name="close" />
                <span className="visually-hidden">{t('nav.close')}</span>
              </button>
            </div>
            <DayItems info={openDay} />
            {openDay?.total && (
              <p className="cal-pop-total">
                <span>{t('cal.total')}</span>
                <strong className="num">{openDay.total}</strong>
              </p>
            )}
          </>
        )}
      </Sheet>
    </div>
  )
}

function DayItems({ info }: { info: CalDay | undefined }) {
  const { t } = useTranslation()
  const items = info?.items ?? []
  if (items.length === 0) {
    const e = info?.empty ?? { text: t('cal.nothing'), icon: 'calendar' as IconName }
    return (
      <p className="cal-empty">
        <span className="cal-item-icon tone-rest" aria-hidden="true">
          <Icon name={e.icon} />
        </span>
        {e.text}
      </p>
    )
  }
  return (
    <ul className="cal-items">
      {items.map((x) => {
        const body = (
          <>
            <span className={`cal-item-icon tone-${x.tone ?? 'mint'}`} aria-hidden="true">
              <Icon name={x.icon} />
            </span>
            <span className="cal-item-text">
              <strong>{x.title}</strong>
              {x.meta && <span className="muted">{x.meta}</span>}
            </span>
            <span className="cal-item-end">
              {x.value && <span className="num cal-item-value">{x.value}</span>}
              {x.badge && <span className={`cal-badge cal-badge-${x.badge.tone}`}>{x.badge.text}</span>}
            </span>
          </>
        )
        return <li key={x.id}>{x.to ? <Link to={x.to} className="cal-item">{body}</Link> : <div className="cal-item">{body}</div>}</li>
      })}
    </ul>
  )
}
