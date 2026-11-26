import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Icon, type IconName } from '../../components/ui/Icon'
import { ArcGauge, CountUp } from '../../components/ui/Status'
import { useToast } from '../../components/fx/Toast'
import { celebrateOnce, haptic, reducedMotion } from '../../components/fx/motion'
import { addDays, weekStart } from '../../core/dates'
import { fatigueStatus, fitnessVsBest, formStatus, rampStatus, type IndicatorStatus } from '../../core/fitness/status'
import { formatNumber } from '../../core/units'
import { useFitness, useProfile } from '../../data/hooks'
import { SESSION_ICON } from '../plan/SessionView'
import { usePlan } from '../plan/usePlan'
import { tsbState } from './HomePage'

/** Saludo según la hora, con la sesión de hoy. */
export function Greeting() {
  const { t } = useTranslation()
  const profile = useProfile()
  const { derived } = usePlan()
  const h = new Date().getHours()
  const part: { key: string; icon: IconName } = h >= 5 && h < 12 ? { key: 'morning', icon: 'sun' } : h >= 12 && h < 19 ? { key: 'afternoon', icon: 'cloud' } : { key: 'night', icon: 'moon' }
  const name = profile.data?.displayName?.split(' ')[0]
  const hello = t(`home.${part.key}`)
  const today = derived?.today
  const session = derived?.plan.sessions.find((s) => s.date === today && s.kind !== 'rest')
  const done = session && ['done', 'harder', 'partial'].includes(derived?.matches.get(session.id)?.status ?? '')
  return (
    <section className={`greet greet-${part.key}`} aria-labelledby="greet-h">
      <div className="greet-text">
        <h2 id="greet-h" className="greet-title">
          <span className={`greet-sky greet-sky-${part.key}`} aria-hidden="true">
            <Icon name={part.icon} />
          </span>
          {hello}
          <span className="visually-hidden">{name ? `, ${name}` : ''}</span>
        </h2>
        {!derived || derived.plan.sessions.length === 0 ? (
          <p>
            {t('home.todayNoPlan')} <Link to="/metas/nueva">{t('home.makePlan')} →</Link>
          </p>
        ) : session ? (
          <Link to={`/plan/sesion/${session.id}`} className="greet-session">
            <span className="greet-session-icon" aria-hidden="true">
              <Icon name={done ? 'check' : (SESSION_ICON[session.sport] ?? 'activity')} />
            </span>
            <span>
              <span className="greet-eyebrow">{done ? t('home.todayDone') : t('home.todayIs')}</span>
              <strong>
                {t(`plan.kind.${session.kind}`)} · {t(`sports.${session.sport}`)}
              </strong>
              <span className="greet-meta">{t('plan.minutes', { count: session.durationMin })}</span>
            </span>
            <Icon name="route" />
          </Link>
        ) : (
          <p>{t('home.todayRest')}</p>
        )}
      </div>
    </section>
  )
}

type Rating = 'excellent' | 'good' | 'attention'
const rate = (s: IndicatorStatus, excellent: boolean): Rating => (s.level !== 'good' ? 'attention' : excellent ? 'excellent' : 'good')

/** Medidor semicircular del estado de forma + calificación de forma, fatiga y ritmo. */
export function FormGaugeCard() {
  const { t } = useTranslation()
  const { overview, today } = useFitness()
  const s = overview!.snapshot!
  const form = formStatus(s.tsb)
  const best = fitnessVsBest(s.ctl, overview!.series)
  const fat = fatigueStatus(s.atl, s.ctl)
  const ramp = rampStatus(s.rampPerWeek)
  const state = t(`fitness.${tsbState(s.tsb)}`)
  const items: [string, Rating][] = [
    [t('home.ratingForm'), rate(best, best.best >= 10 && best.pct >= 95)],
    [t('home.ratingFatigue'), rate(fat, fat.ratio !== null && fat.ratio <= 1)],
    [t('home.ratingRamp'), rate(ramp, s.rampPerWeek >= 1 && s.rampPerWeek <= 5)],
  ]
  const ref = useRef<HTMLElement>(null)
  // Celebra (una vez) cuando alcanzas tu mejor forma registrada
  useEffect(() => {
    if (best.best >= 20 && best.pct >= 100 && ref.current) {
      const r = ref.current.getBoundingClientRect()
      setTimeout(() => celebrateOnce(`forma-${Math.round(best.best)}`, { x: r.left + r.width / 2, y: r.top + 80 }), 900)
    }
  }, [best.best, best.pct, today])
  return (
    <section ref={ref} className="card form-card" aria-labelledby="form-h">
      <div className="row-between">
        <h2 id="form-h" className="card-title-icon">
          <span className="icon-tile">
            <Icon name="gauge" />
          </span>
          {t('home.formTitle')}
        </h2>
        <Link to="/glosario" className="small-link">
          {t('nav.glossary')}
        </Link>
      </div>
      <ArcGauge scale={form.scale} value={s.tsb} label={t('home.gaugeLabel', { value: formatNumber(s.tsb), state })}>
        <p className={`form-state verdict-${form.level}`}>{state}</p>
        <p className="form-value num">{t('home.formValue', { value: formatNumber(s.tsb) })}</p>
      </ArcGauge>
      <ul className="rating-row">
        {items.map(([label, r], i) => (
          <li key={label} className={`rating rating-${r}`} style={{ animationDelay: `${500 + i * 80}ms` }}>
            <span className="rating-label">{label}</span>
            <span className="rating-value">
              <span className="rating-dot" aria-hidden="true" />
              {t(`home.rating.${r}`)}
            </span>
          </li>
        ))}
      </ul>
      <p className="form-verdict">{t(`fitness.verdict.${form.verdict}`)}</p>
    </section>
  )
}

/** Cifras clave con el cambio frente a la semana pasada. */
export function KpiTiles() {
  const { t } = useTranslation()
  const { overview, loaded, today } = useFitness()
  const series = overview!.series
  const now = series[series.length - 1]
  const ago = series.find((p) => p.day === addDays(today, -7)) ?? series[Math.max(0, series.length - 8)]
  const inRange = (from: number, to: number) => (loaded ?? []).filter((l) => l.day > addDays(today, from) && l.day <= addDays(today, to))
  const last7 = inRange(-7, 0)
  const prev7 = inRange(-14, -7)
  const load = (xs: typeof last7) => xs.reduce((a, l) => a + (l.load.load ?? 0), 0)
  const hours = (xs: typeof last7) => xs.reduce((a, l) => a + (l.activity.movingS || l.activity.elapsedS || 0), 0) / 3600
  // upIsGood: null = solo informativo (más o menos carga no es buena ni mala por sí sola)
  const tiles: { key: string; icon: IconName; tone: string; value: number; prev: number; decimals?: number; upIsGood: boolean | null }[] = [
    { key: 'kpiForm', icon: 'trend', tone: 'mint', value: now.ctl, prev: ago.ctl, upIsGood: true },
    { key: 'kpiFatigue', icon: 'bolt', tone: 'coral', value: now.atl, prev: ago.atl, upIsGood: false },
    { key: 'kpiLoad', icon: 'flame', tone: 'amber', value: load(last7), prev: load(prev7), upIsGood: null },
    { key: 'kpiHours', icon: 'clock', tone: 'sky', value: hours(last7), prev: hours(prev7), decimals: 1, upIsGood: null },
  ]
  return (
    <section aria-labelledby="kpi-h" className="kpi-section">
      <div className="row-between">
        <h2 id="kpi-h" className="section-title">
          {t('home.kpiTitle')}
        </h2>
        <Link to="/ayuda?tema=cifras" className="small-link">
          {t('home.kpiHow')}
        </Link>
      </div>
      <p className="kpi-legend">
        <span>
          <b aria-hidden="true">▲</b> {t('home.legendUp')} · <b aria-hidden="true">▼</b> {t('home.legendDown')}
        </span>
        <span className="kpi-legend-colors">
          <i className="lg-good" aria-hidden="true" /> {t('home.legendGood')}
          <i className="lg-bad" aria-hidden="true" /> {t('home.legendBad')}
          <i className="lg-info" aria-hidden="true" /> {t('home.legendInfo')}
        </span>
      </p>
      <ul className="kpi-grid">
        {tiles.map((k, i) => {
          const d = k.value - k.prev
          const step = k.decimals ? 0.1 : 1
          const dir = Math.abs(d) < step / 2 ? 'same' : d > 0 ? 'up' : 'down'
          const good = dir === 'same' || k.upIsGood === null ? null : (dir === 'up') === k.upIsGood
          const fmt = (n: number) => formatNumber(n, k.decimals ?? 0)
          return (
            <li key={k.key} className={`kpi kpi-${k.tone}`} style={{ animationDelay: `${i * 60}ms` }}>
              <span className="kpi-icon" aria-hidden="true">
                <Icon name={k.icon} />
              </span>
              <span className="kpi-label">{t(`home.${k.key}`)}</span>
              <span className="kpi-value num" aria-hidden="true">
                <CountUp value={k.value} format={fmt} />
              </span>
              <span
                className={`kpi-delta delta-${dir}${good === null ? ' is-info' : good ? ' is-good' : ' is-bad'}`}
                style={{ animationDelay: `${700 + i * 80}ms` }}
                aria-hidden="true"
              >
                {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '='} {dir === 'same' ? '' : fmt(Math.abs(d))}
              </span>
              <span className="kpi-hint" aria-hidden="true">
                {t(`home.hint.${k.key}.${dir}`)}
              </span>
              <span className="visually-hidden">
                {t(`home.hint.${k.key}.${dir}`)}.{' '}
                {t('home.kpiDelta', { label: t(`home.${k.key}`), value: fmt(k.value), dir: t(`home.${dir}`), delta: dir === 'same' ? '' : fmt(Math.abs(d)) })}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** Carga hecha de la semana frente a la planeada (el restante va rayado). */
export function WeekBar() {
  const { t } = useTranslation()
  const { derived } = usePlan()
  const { loaded, today } = useFitness()
  const ref = useRef<HTMLElement>(null)
  const ws = weekStart(today)
  const week = derived?.plan.weeks.find((w) => w.weekStart === ws)
  const done = Math.round((loaded ?? []).filter((l) => l.day >= ws && l.day <= today).reduce((a, l) => a + (l.load.load ?? 0), 0))
  const planned = week ? Math.round(week.targetLoad) : 0
  const pct = planned > 0 ? Math.round((done / planned) * 100) : 0
  const sessions = (derived?.plan.sessions ?? []).filter((s) => s.date >= ws && s.date <= addDays(ws, 6) && s.kind !== 'rest')
  const doneSessions = sessions.filter((s) => ['done', 'harder', 'partial'].includes(derived?.matches.get(s.id)?.status ?? ''))
  const [shown, setShown] = useState(() => (reducedMotion() ? pct : 0))
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct))
    return () => cancelAnimationFrame(id)
  }, [pct])
  useEffect(() => {
    if (planned > 0 && pct >= 100 && ref.current) {
      const r = ref.current.getBoundingClientRect()
      setTimeout(() => celebrateOnce(`semana-${ws}`, { x: r.left + r.width / 2, y: r.top + 40 }), 1000)
    }
  }, [pct, planned, ws])
  if (!week || planned === 0) return null
  return (
    <section ref={ref} className="card week-bar-card" aria-labelledby="weekbar-h">
      <div className="row-between">
        <h2 id="weekbar-h" className="card-title-icon">
          <span className="icon-tile icon-tile-sky">
            <Icon name="calendar" />
          </span>
          {t('home.weekTitle')}
        </h2>
        <span className="week-pct num">{pct >= 100 ? t('home.weekDone') : `${pct} %`}</span>
      </div>
      <div className="week-bar" role="img" aria-label={t('home.weekLabel', { pct, done: formatNumber(done), planned: formatNumber(planned) })}>
        <span className="week-bar-rest hatch hatch-move" />
        <span className={`week-bar-fill${pct >= 100 ? ' is-full' : ''}`} style={{ width: `${Math.min(100, shown)}%` }} />
      </div>
      <p className="week-bar-text">
        <strong className="num">{t('home.weekText', { done: formatNumber(done), planned: formatNumber(planned) })}</strong>
        {sessions.length > 0 && <span className="muted"> · {t('home.weekSessions', { done: doneSessions.length, total: sessions.length })}</span>}
      </p>
      <ol className="week-days" aria-hidden="true">
        {DOW.map((d, i) => {
          const day = addDays(ws, i)
          const ss = sessions.filter((s) => s.date === day)
          const ok = ss.length > 0 && ss.every((s) => doneSessions.includes(s))
          return (
            <li key={d} className={`${day === today ? 'is-today' : ''}${ok ? ' is-done' : ss.length ? ' has-session' : ''}`}>
              <span>{d}</span>
              <i />
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Deslizar hacia abajo desde arriba de Inicio para actualizar. */
export function PullToRefresh() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [dy, setDy] = useState(0)
  const [busy, setBusy] = useState(false)
  const start = useRef<number | null>(null)
  const dyRef = useRef(0)
  useEffect(() => {
    const down = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 && !document.documentElement.classList.contains('has-sheet') ? e.touches[0].clientY : null
    }
    const move = (e: TouchEvent) => {
      if (start.current === null) return
      const d = Math.max(0, Math.min(120, (e.touches[0].clientY - start.current) * 0.5))
      dyRef.current = d
      setDy(d)
    }
    const up = async () => {
      if (start.current === null) return
      start.current = null
      const far = dyRef.current >= 60
      dyRef.current = 0
      setDy(0)
      if (!far) return
      haptic()
      setBusy(true)
      await qc.invalidateQueries()
      setBusy(false)
      toast(t('home.updated'), { icon: 'refresh', vibrate: false })
    }
    window.addEventListener('touchstart', down, { passive: true })
    window.addEventListener('touchmove', move, { passive: true })
    window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('touchstart', down)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', up)
    }
  }, [qc, toast, t])
  if (!dy && !busy) return null
  return (
    <div className="ptr" style={{ height: busy ? 52 : dy }} aria-live="polite">
      <span className={`ptr-icon${busy ? ' is-busy' : ''}`} style={{ transform: busy ? undefined : `rotate(${dy * 3}deg)`, opacity: busy ? 1 : Math.min(1, dy / 60) }}>
        <Icon name="refresh" />
      </span>
      <span className="visually-hidden">{busy ? t('home.refreshing') : dy >= 60 ? t('home.pull') : ''}</span>
    </div>
  )
}

/** Carga de Inicio: siluetas con la forma del contenido. */
export function HomeSkeleton() {
  const { t } = useTranslation()
  return (
    <div className="home-skeleton" role="status" aria-label={t('common.loading')}>
      <div className="skeleton sk-greet" />
      <div className="skeleton sk-checkin" />
      <div className="card sk-gauge-card">
        <div className="skeleton sk-line" />
        <div className="skeleton sk-arc" />
        <div className="sk-row">
          <div className="skeleton sk-pill" />
          <div className="skeleton sk-pill" />
          <div className="skeleton sk-pill" />
        </div>
      </div>
      <div className="sk-kpis">
        <div className="skeleton sk-kpi" />
        <div className="skeleton sk-kpi" />
        <div className="skeleton sk-kpi" />
        <div className="skeleton sk-kpi" />
      </div>
    </div>
  )
}
