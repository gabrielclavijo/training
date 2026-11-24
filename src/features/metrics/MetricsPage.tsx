import { TitleIcon } from '../../components/ui/Icon'
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
            {t(`sports.${s}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="sport-panel" aria-labelledby={`tab-${sport}`}>
        <SportPanel key={sport} sport={sport} />
      </div>
    </Page>
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

  const items: [string, string, string?][] = [
    [t('metrics.sessions'), String(summary.count)],
    [t('metrics.frequency'), t('metrics.perWeek', { value: formatNumber(summary.count / 12, 1) }), t('metrics.help.frequency')],
    [t('metrics.hours'), formatDuration(summary.durationS), t('metrics.help.volume')],
  ]
  if (sport !== 'strength') {
    items.push([t('metrics.km'), formatDistance(summary.distanceM)])
    if (sport !== 'swimming') items.push([t('metrics.elevation'), formatElevation(summary.elevationM)])
  }
  if (sport === 'cycling') {
    if (summary.avgSpeedMs) items.push([t('metrics.avgSpeed'), formatSpeed(summary.avgSpeedMs), t('metrics.help.speed')])
    if (summary.avgPowerW) {
      items.push([t('metrics.avgPower'), formatPower(summary.avgPowerW)])
      items.push([t('metrics.wkg'), kg ? formatWattsPerKg(summary.avgPowerW, kg) : t('metrics.noWeightForWkg')])
    } else items.push([t('metrics.avgPower'), t('metrics.noPower')])
  }
  if (sport === 'running' && summary.avgSpeedMs) items.push([t('metrics.pacePerKm'), formatPacePerKm(1000, 1000 / summary.avgSpeedMs), t('metrics.help.pace')])
  if (sport === 'swimming' && summary.avgSpeedMs)
    items.push([t('metrics.pacePer100'), formatPacePer100m(100, 100 / summary.avgSpeedMs), t('metrics.help.pace')])
  if (summary.avgHr) items.push([t('metrics.avgHr'), formatHeartRate(summary.avgHr)])

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
        <dl className="stat-grid">
          {items.map(([k, v, help]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
              {help && <dd className="metric-help">{help}</dd>}
            </div>
          ))}
        </dl>
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
