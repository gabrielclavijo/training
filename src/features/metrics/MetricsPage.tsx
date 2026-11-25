import { Icon, TitleIcon, type IconName } from '../../components/ui/Icon'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart } from '../../components/ui/Charts'
import { EmptyState } from '../../components/ui/EmptyState'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import type { Sport, SubSport } from '../../core/activity/types'
import { addDays, formatDate, weekStart } from '../../core/dates'
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatNumber,
  formatPacePer100m,
  formatPacePerKm,
  formatPower,
  formatSpeed,
  formatWattsPerKg,
} from '../../core/units'
import { latestWeight, sportSummary, volumeBy } from '../../data/analysis'
import { useFitness, useWeights } from '../../data/hooks'
import { SUBSPORTS } from '../activities/sports'
import { FitnessCards } from '../dashboard/FitnessDetails'

const TABS: Sport[] = ['cycling', 'running', 'swimming', 'strength']

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)

export function MetricsPage() {
  const { t } = useTranslation()
  const { loaded, isLoading, error } = useFitness()
  const [sport, setSport] = useState<Sport>('cycling')

  if (isLoading)
    return (
      <Page title={t('metrics.title')}>
        <Spinner full />
      </Page>
    )
  if (error)
    return (
      <Page title={t('metrics.title')}>
        <Alert kind="error">{t('errors.generic')}</Alert>
      </Page>
    )
  if (!loaded || loaded.length === 0) {
    return (
      <Page title={t('metrics.title')}>
        <EmptyState
          icon="chart"
          title={t('empty.activities.title')}
          body={t('empty.activities.body')}
          actionLabel={t('empty.activities.action')}
          actionTo="/subir"
        />
      </Page>
    )
  }

  return (
    <Page title={t('metrics.title')}>
      <FitnessCards />
      <div role="tablist" aria-label={t('activities.sport')} className="tabs">
        {TABS.map((s) => (
          <button
            key={s}
            role="tab"
            id={`tab-${s}`}
            aria-selected={sport === s}
            aria-controls="sport-panel"
            tabIndex={sport === s ? 0 : -1}
            className="tab"
            onClick={() => setSport(s)}
            onKeyDown={(e) => {
              const i = TABS.indexOf(sport)
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
                setSport(next)
                document.getElementById(`tab-${next}`)?.focus()
              }
            }}
          >
            <Icon name={TAB_ICON[s] ?? 'activity'} /> {t(`sports.${s}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="sport-panel" aria-labelledby={`tab-${sport}`}>
        <SportPanel key={sport} sport={sport} />
      </div>
    </Page>
  )
}

const TAB_ICON: Record<string, IconName> = { cycling: 'bike', running: 'run', swimming: 'swim', strength: 'dumbbell', other: 'activity' }

interface Tile {
  icon: IconName
  tone: 'mint' | 'sky' | 'amber' | 'coral' | 'soft'
  label: string
  value: string
  help?: string
  /** Valores por periodo para la mini gráfica */
  spark?: number[]
  /** Veces por semana (puntos de 7) */
  dots?: number
  muted?: boolean
}

/** Mini barras de los últimos periodos (decorativas: el dato está en la gráfica grande y su tabla). */
function Spark({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 1)
  return (
    <span className="spark" aria-hidden="true" title={label}>
      {values.map((v, i) => (
        <i key={i} className={i === values.length - 1 ? 'is-last' : undefined} style={{ height: `${Math.max(6, (v / max) * 100)}%`, animationDelay: `${i * 25}ms` }} />
      ))}
    </span>
  )
}

function SportPanel({ sport }: { sport: Sport }) {
  const { t } = useTranslation()
  const { loaded, today } = useFitness()
  const weights = useWeights()
  const [unit, setUnit] = useState<'week' | 'month'>('week')
  const [sub, setSub] = useState<SubSport | 'all'>('all')
  const subFilter = sub === 'all' ? undefined : sub
  const from = unit === 'week' ? addDays(weekStart(today), -11 * 7) : `${addDays(today, -334).slice(0, 7)}-01`
  const from12w = addDays(weekStart(today), -11 * 7)
  const summary = sportSummary(loaded!, sport, from12w, subFilter)
  const periods = volumeBy(loaded!, sport, unit, subFilter).filter((p) => p.period >= from.slice(0, unit === 'week' ? 10 : 7))
  const kg = latestWeight(weights.data ?? [])

  // Rellena periodos sin actividad para que la gráfica no engañe
  const filled: typeof periods = []
  if (unit === 'week') {
    for (let w = from12w; w <= today; w = addDays(w, 7))
      filled.push(periods.find((p) => p.period === w) ?? { period: w, count: 0, durationS: 0, distanceM: 0, elevationM: 0 })
  } else {
    const start = new Date(`${from}T12:00:00Z`)
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
      const key = d.toISOString().slice(0, 7)
      filled.push(periods.find((p) => p.period === key) ?? { period: key, count: 0, durationS: 0, distanceM: 0, elevationM: 0 })
    }
  }
  const label = (p: string) =>
    unit === 'week'
      ? formatDate(`${p}T12:00:00Z`).slice(0, 5)
      : new Intl.DateTimeFormat('es-CO', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${p}-15T12:00:00Z`))

  if (summary.count === 0 && filled.every((p) => p.count === 0)) {
    return <p className="muted card">{t('metrics.noActivities')}</p>
  }

  const sp = (f: (p: (typeof filled)[number]) => number) => filled.map(f)
  const tiles: Tile[] = [
    { icon: 'calendar', tone: 'mint', label: t('metrics.sessions'), value: String(summary.count), spark: sp((p) => p.count) },
    { icon: 'refresh', tone: 'sky', label: t('metrics.frequency'), value: t('metrics.perWeek', { value: formatNumber(summary.count / 12, 1) }), help: t('metrics.help.frequency'), dots: Math.round(summary.count / 12) },
    { icon: 'clock', tone: 'amber', label: t('metrics.hours'), value: formatDuration(summary.durationS), help: t('metrics.help.volume'), spark: sp((p) => p.durationS) },
  ]
  if (sport !== 'strength') {
    tiles.push({ icon: 'route', tone: 'mint', label: t('metrics.km'), value: formatDistance(summary.distanceM), spark: sp((p) => p.distanceM) })
    if (sport !== 'swimming') tiles.push({ icon: 'mountain', tone: 'amber', label: t('metrics.elevation'), value: formatElevation(summary.elevationM), spark: sp((p) => p.elevationM) })
  }
  if (sport === 'cycling') {
    if (summary.avgSpeedMs) tiles.push({ icon: 'gauge', tone: 'sky', label: t('metrics.avgSpeed'), value: formatSpeed(summary.avgSpeedMs), help: t('metrics.help.speed') })
    if (summary.avgPowerW) {
      tiles.push({ icon: 'bolt', tone: 'coral', label: t('metrics.avgPower'), value: formatPower(summary.avgPowerW) })
      tiles.push({ icon: 'scale', tone: 'soft', label: t('metrics.wkg'), value: kg ? formatWattsPerKg(summary.avgPowerW, kg) : '—', help: kg ? undefined : t('metrics.noWeightForWkg') })
    } else tiles.push({ icon: 'bolt', tone: 'soft', label: t('metrics.avgPower'), value: '—', help: t('metrics.noPower'), muted: true })
  }
  if (sport === 'running' && summary.avgSpeedMs) tiles.push({ icon: 'timer', tone: 'coral', label: t('metrics.pacePerKm'), value: formatPacePerKm(1000, 1000 / summary.avgSpeedMs), help: t('metrics.help.pace') })
  if (sport === 'swimming' && summary.avgSpeedMs)
    tiles.push({ icon: 'timer', tone: 'sky', label: t('metrics.pacePer100'), value: formatPacePer100m(100, 100 / summary.avgSpeedMs), help: t('metrics.help.pace') })
  if (summary.avgHr) tiles.push({ icon: 'heart', tone: 'coral', label: t('metrics.avgHr'), value: formatHeartRate(summary.avgHr) })

  return (
    <div className="stack">
      <div className="toolbar">
        <fieldset className="toolbar-item">
          <legend className="toolbar-label">{t('metrics.period')}</legend>
          <div className="pill-toggle">
            <label>
              <input type="radio" name="unit" checked={unit === 'week'} onChange={() => setUnit('week')} />
              <span>{t('metrics.weekly')}</span>
            </label>
            <label>
              <input type="radio" name="unit" checked={unit === 'month'} onChange={() => setUnit('month')} />
              <span>{t('metrics.monthly')}</span>
            </label>
          </div>
        </fieldset>
        {SUBSPORTS[sport].length > 0 && sport === 'cycling' && (
          <div className="field toolbar-item" style={{ margin: 0 }}>
            <label htmlFor="sub-filter">{t('metrics.byModality')}</label>
            <select id="sub-filter" value={sub} onChange={(e) => setSub(e.target.value as SubSport | 'all')}>
              <option value="all">{t('metrics.allModalities')}</option>
              {SUBSPORTS[sport].map((s) => (
                <option key={s} value={s}>
                  {t(`subSports.${s}`)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <section className="card" aria-labelledby="sum-h">
        <h2 id="sum-h" className="card-title-icon">
          <TitleIcon name="chart" />
          {t('metrics.last12w')}
        </h2>
        <ul className="mtiles">
          {tiles.map((x, i) => (
            <li key={x.label} className={`mtile kpi-${x.tone}${x.muted ? ' is-muted' : ''}`} style={{ animationDelay: `${i * 50}ms` }}>
              <span className="mtile-head">
                <span className="kpi-icon" aria-hidden="true">
                  <Icon name={x.icon} />
                </span>
                <span className="kpi-label">{x.label}</span>
              </span>
              <strong className="mtile-value">{x.value}</strong>
              {x.spark && x.spark.some((v) => v > 0) && <Spark values={x.spark} label={t(`metrics.${unit}`)} />}
              {x.dots !== undefined && (
                <span className="mtile-dots" aria-hidden="true">
                  {Array.from({ length: 7 }, (_, k) => (
                    <i key={k} className={k < x.dots! ? 'on' : undefined} />
                  ))}
                </span>
              )}
              {x.help && <span className="mtile-help">{x.help}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <BarChart
          title={t('metrics.volumeChart', { unit: t(`metrics.${unit}`) })}
          summary={t('metrics.summaryText', { sessions: summary.count, hours: formatDuration(summary.durationS), distance: formatDistance(summary.distanceM) })}
          periodHeader={t('metrics.period')}
          valueHeader={t('metrics.hours')}
          average={(() => {
            const done = filled.slice(0, -1)
            const avg = done.length ? done.reduce((a, p) => a + p.durationS, 0) / done.length / 3600 : 0
            return avg > 0 ? { value: avg, label: t('metrics.avgLine', { value: `${formatNumber(avg, 1)} h` }) } : undefined
          })()}
          legend={[
            { kind: 'normal', label: cap(t(`metrics.${unit}`)) },
            { kind: 'partial', label: t('metrics.barLegendPartial') },
            { kind: 'average', label: t('fitness.barLegendAvg') },
          ]}
          note={t('metrics.volumeNote', { sport: t(`sports.${sport}`).toLowerCase() })}
          data={filled.map((p, i) => ({
            label: label(p.period),
            short: p.durationS > 0 ? formatNumber(p.durationS / 3600, 1) : '0',
            partial: i === filled.length - 1,
            fullLabel: `${label(p.period)} · ${p.count} ${t('metrics.sessions').toLowerCase()}${p.distanceM ? ` · ${formatDistance(p.distanceM)}` : ''}${p.elevationM ? ` · ↑ ${formatElevation(p.elevationM)}` : ''}`,
            value: p.durationS / 3600,
            display: formatDuration(p.durationS),
          }))}
        />
      </section>
    </div>
  )
}
