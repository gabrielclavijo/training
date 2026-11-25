import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart } from '../../components/ui/Charts'
import { NumberField, TextField, parseNum } from '../../components/ui/Field'
import { Icon, TitleIcon } from '../../components/ui/Icon'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { ArcGauge, CountUp, Semaphore } from '../../components/ui/Status'
import { formatDate, localDayKey } from '../../core/dates'
import { formatNumber } from '../../core/units'
import { useRepo } from '../../data/RepoProvider'
import type { AdminStats, PersonRow } from '../../../supabase/functions/_shared/adminStats.ts'
import { useIsAdmin } from './useIsAdmin'

const usd = (v: number, digits = 2) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)
const dShort = (day: string) => formatDate(`${day}T12:00:00Z`).slice(0, 5)

function duration(min: number) {
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h} h ${m} min` : `${h} h`
}

function ago(t: TFunction, iso: string | null) {
  if (!iso) return ''
  const min = Math.max(0, (Date.now() - Date.parse(iso)) / 60_000)
  if (min < 1) return t('adminPage.ago.now')
  if (min < 60) return t('adminPage.ago.min', { count: Math.floor(min) })
  if (min < 48 * 60) return t('adminPage.ago.hour', { count: Math.floor(min / 60) })
  return t('adminPage.ago.day', { count: Math.floor(min / 1440) })
}

export function AdminPage() {
  const { t } = useTranslation()
  const repo = useRepo()
  const isAdmin = useIsAdmin()
  const stats = useQuery({
    queryKey: ['adminStats'],
    queryFn: () => repo.adminStats(),
    enabled: isAdmin,
    refetchInterval: 60_000,
  })

  if (!isAdmin) {
    return (
      <Page title={t('adminPage.title')}>
        <div className="empty-visual card">
          <span className="ai-orb" aria-hidden="true">
            <Icon name="shield" />
          </span>
          <p>{t('adminPage.forbidden')}</p>
        </div>
      </Page>
    )
  }
  if (stats.isLoading) return <Page title={t('adminPage.title')}><Spinner full /></Page>
  if (stats.isError || !stats.data) return <Page title={t('adminPage.title')}><Alert kind="error">{t('adminPage.error')}</Alert></Page>
  const s = stats.data

  return (
    <Page
      title={t('adminPage.title')}
      actions={
        <button type="button" className="btn btn-secondary" onClick={() => void stats.refetch()} disabled={stats.isFetching}>
          <Icon name="refresh" /> {t('adminPage.refresh')}
        </button>
      }
    >
      <p className="muted">
        {t('adminPage.intro')} {t('adminPage.updated', { time: ago(t, s.generatedAt) })}
      </p>
      {repo.kind === 'memory' && <p className="notice-estimate">{t('adminPage.localNotice')}</p>}
      <Kpis s={s} />
      <Charts s={s} />
      <People people={s.people} />
      <AiBalance s={s} />
    </Page>
  )
}

function Kpis({ s }: { s: AdminStats }) {
  const { t } = useTranslation()
  // Cambio frente a los 7 días anteriores (de la serie de 30 días)
  const sum = (from: number, to: number, f: (d: AdminStats['series'][number]) => number) => s.series.slice(from, to).reduce((a, d) => a + f(d), 0)
  const n = s.series.length
  const minNow = sum(n - 7, n, (d) => d.minutes)
  const minPrev = sum(n - 14, n - 7, (d) => d.minutes)
  const aiNow = sum(n - 7, n, (d) => d.aiRequests)
  const aiPrev = sum(n - 14, n - 7, (d) => d.aiRequests)
  const top = s.ai.toppedUpUsd
  const thr = Math.min(top, s.ai.thresholdUsd)
  const balScale = {
    min: 0,
    max: Math.max(top, 0.01),
    zones: [
      { to: thr * 0.5, level: 'alert' as const },
      { to: thr, level: 'caution' as const },
      { to: Math.max(top, 0.01), level: 'good' as const },
    ],
  }
  return (
    <section aria-label={t('adminPage.title')} className="admin-kpis">
      <div className="card admin-kpi">
        <div className="row-between">
          <TitleIcon name="user" />
          <span className="chip">{t('adminPage.kpi.usersNew', { count: s.users.new7d })}</span>
        </div>
        <span className="metric-value">
          <CountUp value={s.users.total} format={(n) => formatNumber(n)} />
        </span>
        <span className="metric-label">{t('adminPage.kpi.users')}</span>
        <ul className="chips">
          {Object.entries(s.users.byProvider).map(([k, n]) => (
            <li key={k} className="chip">
              {t(`adminPage.providers.${k}`, { defaultValue: k })}: {n}
            </li>
          ))}
        </ul>
      </div>

      <div className="card admin-kpi">
        <div className="row-between">
          <TitleIcon name="activity" tone="sky" />
          <span className={`live-dot${s.activity.onlineNow > 0 ? ' live-on' : ''}`} aria-hidden="true" />
        </div>
        <span className="metric-value">
          <CountUp value={s.activity.onlineNow} format={(n) => formatNumber(n)} />
        </span>
        <span className="metric-label">{t('adminPage.kpi.online')}</span>
        <p className="metric-detail">{t('adminPage.kpi.onlineHelp')}</p>
        <p className="metric-detail">{t('adminPage.kpi.activeToday', { today: s.activity.activeToday, week: s.activity.active7d })}</p>
      </div>

      <div className="card admin-kpi">
        <TitleIcon name="clock" tone="soft" />
        <Delta now={minNow} prev={minPrev} />
        <span className="metric-value">{duration(s.activity.minutes7d)}</span>
        <span className="metric-label">{t('adminPage.kpi.time')}</span>
        <p className="metric-detail">{t('adminPage.kpi.timeAvg', { avg: duration(s.activity.avgMinutesPerActive7d), visits: s.activity.visits7d })}</p>
      </div>

      <div className="card admin-kpi">
        <TitleIcon name="sparkles" tone="coral" />
        <Delta now={aiNow} prev={aiPrev} unit={t('adminPage.kpi.requests')} />
        <span className="metric-value">{usd(s.ai.monthCostUsd)}</span>
        <span className="metric-label">{t('adminPage.kpi.aiMonth')}</span>
        <p className="metric-detail">{t('adminPage.kpi.aiMonthDetail', { menus: s.ai.monthMenus, swaps: s.ai.monthSwaps, failed: s.ai.monthFailed })}</p>
      </div>

      <div className={`card admin-kpi admin-balance metric-${s.ai.level}`}>
        <div className="row-between">
          <TitleIcon name="coins" />
          <Semaphore level={s.ai.level} label={t(`adminPage.level.${s.ai.level}`)} />
        </div>
        {s.ai.toppedUpUsd > 0 ? (
          <>
            <ArcGauge scale={balScale} value={s.ai.balanceUsd} label={t('adminPage.kpi.balanceGauge', { balance: usd(s.ai.balanceUsd), topped: usd(s.ai.toppedUpUsd) })}>
              <span className="metric-value">{usd(s.ai.balanceUsd)}</span>
              <span className="metric-label">{t('adminPage.kpi.balance')}</span>
            </ArcGauge>
            <p className="metric-detail">{t('adminPage.kpi.balanceOf', { spent: usd(s.ai.totalCostUsd), topped: usd(s.ai.toppedUpUsd) })}</p>
            {s.ai.daysLeft !== null && <p className="metric-detail">{t('adminPage.kpi.daysLeft', { count: s.ai.daysLeft })}</p>}
          </>
        ) : (
          <>
            <span className="metric-value">{usd(s.ai.balanceUsd)}</span>
            <span className="metric-label">{t('adminPage.kpi.balance')}</span>
            <p className="metric-detail">{t('adminPage.kpi.noTopups')}</p>
          </>
        )}
      </div>
    </section>
  )
}

/** Cambio frente a los 7 días anteriores: ▲ / ▼ con el porcentaje. */
function Delta({ now, prev, unit }: { now: number; prev: number; unit?: string }) {
  const { t } = useTranslation()
  if (prev <= 0 && now <= 0) return null
  const pct = prev > 0 ? Math.round(((now - prev) / prev) * 100) : null
  const dir = pct === null ? 'up' : pct > 0 ? 'up' : pct < 0 ? 'down' : 'same'
  const text = pct === null ? t('adminPage.kpi.new') : `${dir === 'up' ? '▲' : dir === 'down' ? '▼' : '='} ${Math.abs(pct)} %`
  return (
    <span className={`kpi-delta admin-delta delta-${dir}`} title={t('adminPage.kpi.vsWeek')}>
      {text}
      <span className="visually-hidden">
        {' '}
        {t('adminPage.kpi.vsWeek')}
        {unit ? ` (${unit})` : ''}
      </span>
    </span>
  )
}

function Charts({ s }: { s: AdminStats }) {
  const { t } = useTranslation()
  const last = s.series.length - 1
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const past = s.series.slice(0, -1)
  const totalMin = s.series.reduce((a, d) => a + d.minutes, 0)
  const totalCost = s.series.reduce((a, d) => a + d.aiCostUsd, 0)
  const legend = [
    { kind: 'normal' as const, label: t('adminPage.legendDay') },
    { kind: 'partial' as const, label: t('adminPage.legendToday') },
    { kind: 'average' as const, label: '' },
  ]
  return (
    <div className="admin-charts">
      <section className="card">
        <BarChart
          title={t('adminPage.chartMinutes')}
          summary={t('adminPage.chartMinutesSummary', { total: duration(totalMin) })}
          periodHeader={t('adminPage.day')}
          valueHeader={t('adminPage.minutes')}
          average={{ value: avg(past.map((d) => d.minutes)), label: t('adminPage.avg', { value: `${formatNumber(avg(past.map((d) => d.minutes)))} min` }) }}
          legend={legend}
          data={s.series.map((d, i) => ({ label: dShort(d.day), value: d.minutes, display: `${formatNumber(d.minutes)} min`, short: formatNumber(d.minutes), partial: i === last }))}
        />
      </section>
      <section className="card">
        <BarChart
          title={t('adminPage.chartActive')}
          summary={t('adminPage.chartActiveSummary', { count: Math.max(0, ...s.series.map((d) => d.activeUsers)) })}
          periodHeader={t('adminPage.day')}
          valueHeader={t('adminPage.people')}
          average={{ value: avg(past.map((d) => d.activeUsers)), label: t('adminPage.avg', { value: formatNumber(avg(past.map((d) => d.activeUsers)), 1) }) }}
          legend={legend}
          data={s.series.map((d, i) => ({ label: dShort(d.day), value: d.activeUsers, display: String(d.activeUsers), partial: i === last }))}
        />
      </section>
      <section className="card">
        <BarChart
          title={t('adminPage.chartCost')}
          summary={t('adminPage.chartCostSummary', { total: usd(totalCost), count: s.series.reduce((a, d) => a + d.aiRequests, 0) })}
          periodHeader={t('adminPage.day')}
          valueHeader={t('adminPage.cost')}
          average={{ value: avg(past.map((d) => d.aiCostUsd)), label: t('adminPage.avg', { value: usd(avg(past.map((d) => d.aiCostUsd))) }) }}
          legend={legend}
          data={s.series.map((d, i) => ({ label: dShort(d.day), value: d.aiCostUsd, display: usd(d.aiCostUsd, 4), short: d.aiCostUsd ? formatNumber(d.aiCostUsd, 2) : '0', partial: i === last }))}
        />
      </section>
    </div>
  )
}

function People({ people }: { people: PersonRow[] }) {
  const { t } = useTranslation()
  return (
    <section className="card" aria-labelledby="people-h">
      <h2 id="people-h" className="card-title-icon">
        <TitleIcon name="user" tone="sky" />
        {t('adminPage.peopleTitle')}
      </h2>
      <p className="muted">{t('adminPage.peopleHelp')}</p>
      <ul className="person-list">
        {people.map((p, i) => (
          <li key={p.id} className="person-card" style={{ animationDelay: `${Math.min(i, 12) * 50}ms` }}>
            <span className="person-avatar" aria-hidden="true">
              {(p.name[0] ?? '?').toUpperCase()}
              {p.online && <i className="live-dot live-on" />}
            </span>
            <div className="person-body">
              <div className="person-top">
                <strong>{p.name}</strong>
                <span className="chip">{t(`adminPage.providers.${p.provider}`, { defaultValue: p.provider })}</span>
                {p.strava && <span className="chip chip-warn">{t('adminPage.strava')}</span>}
              </div>
              {p.email && <span className="muted person-email">{p.email}</span>}
              <span className={p.online ? 'person-online' : 'muted'}>
                {p.online ? t('adminPage.online') : p.lastSeenAt ? t('adminPage.lastSeen', { time: ago(t, p.lastSeenAt) }) : t('adminPage.never')}
                {' · '}
                {t('adminPage.since', { date: formatDate(p.createdAt) })}
              </span>
              <div className="week-dots" role="img" aria-label={`${t('adminPage.week')}: ${t('adminPage.d7', { count: p.days7d })}`}>
                {Array.from({ length: 7 }, (_, k) => (
                  <i key={k} className={k < p.days7d ? 'on' : ''} />
                ))}
                <span>{t('adminPage.d7', { count: p.days7d })}</span>
              </div>
              <ul className="chips person-chips">
                <li className="chip">
                  <Icon name="clock" /> {t('adminPage.m7', { value: p.minutes7d })}
                </li>
                <li className="chip">
                  <Icon name="activity" /> {t('adminPage.activities', { count: p.activities })}
                </li>
                <li className="chip">
                  <Icon name="sparkles" /> {t('adminPage.ai30', { menus: p.menus30d, swaps: p.swaps30d, cost: usd(p.cost30dUsd) })}
                </li>
              </ul>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function AiBalance({ s }: { s: AdminStats }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const qc = useQueryClient()
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState(localDayKey(new Date()))
  const [note, setNote] = useState('')
  const [threshold, setThreshold] = useState(String(s.ai.thresholdUsd))
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['adminStats'] })

  async function addTopup(e: FormEvent) {
    e.preventDefault()
    const v = parseNum(amount)
    if (v === null || Number.isNaN(v) || v <= 0) return setMsg({ kind: 'error', text: t('adminPage.invalidAmount') })
    try {
      await repo.adminAddTopup(v, note.trim() || null, day)
      setAmount('')
      setNote('')
      setMsg({ kind: 'success', text: t('adminPage.topupSaved') })
      await refresh()
    } catch {
      setMsg({ kind: 'error', text: t('adminPage.error') })
    }
  }
  async function saveThreshold(e: FormEvent) {
    e.preventDefault()
    const v = parseNum(threshold)
    if (v === null || Number.isNaN(v) || v < 0) return setMsg({ kind: 'error', text: t('adminPage.invalidAmount') })
    await repo.adminSetThreshold(v)
    setMsg({ kind: 'success', text: t('adminPage.thresholdSaved') })
    await refresh()
  }

  return (
    <section className="card" aria-labelledby="ai-h">
      <h2 id="ai-h" className="card-title-icon">
        <TitleIcon name="coins" tone="coral" />
        {t('adminPage.aiTitle')}
      </h2>
      <p className="muted">{t('adminPage.aiHelp')}</p>
      <ul className="step-chips">
        <li>
          <Icon name="sparkles" /> {t('adminPage.totalSpent', { value: usd(s.ai.totalCostUsd) })}
        </li>
        <li>
          <Icon name="food" /> {t('adminPage.perMenu', { value: s.ai.avgCostPerMenuUsd !== null ? usd(s.ai.avgCostPerMenuUsd, 3) : '—' })}
        </li>
        <li>
          <Icon name="chart" /> {t('adminPage.tokens', { input: formatNumber(s.ai.monthInputTokens), output: formatNumber(s.ai.monthOutputTokens) })}
        </li>
      </ul>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="admin-forms">
        <form onSubmit={addTopup} noValidate className="pause-form">
          <h3>{t('adminPage.addTopup')}</h3>
          <div className="grid-2">
            <NumberField label={t('adminPage.amount')} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <div className="field">
              <label htmlFor="topup-day">{t('adminPage.date')}</label>
              <input id="topup-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
          </div>
          <TextField label={t('adminPage.note')} optional value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          <button type="submit" className="btn btn-primary">
            <Icon name="check" /> {t('adminPage.saveTopup')}
          </button>
        </form>
        <form onSubmit={saveThreshold} noValidate className="pause-form">
          <h3>{t('adminPage.threshold')}</h3>
          <NumberField label={t('adminPage.amount')} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          <button type="submit" className="btn btn-secondary">
            {t('adminPage.saveThreshold')}
          </button>
        </form>
      </div>
      <h3>{t('adminPage.topups')}</h3>
      {s.topups.length === 0 ? (
        <p className="muted">{t('adminPage.noTopupsList')}</p>
      ) : (
        <ul className="plain-list">
          {s.topups.map((x) => (
            <li key={x.id} className="row-between">
              <span>
                <strong className="num">{usd(x.amountUsd)}</strong> · {formatDate(`${x.toppedOn}T12:00:00Z`)}
                {x.note && <span className="muted"> · {x.note}</span>}
              </span>
              <button
                type="button"
                className="btn-icon"
                aria-label={t('adminPage.deleteTopup', { amount: usd(x.amountUsd), date: formatDate(`${x.toppedOn}T12:00:00Z`) })}
                onClick={async () => {
                  await repo.adminDeleteTopup(x.id)
                  await refresh()
                }}
              >
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
