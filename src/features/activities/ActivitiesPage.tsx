import { Icon, type IconName } from '../../components/ui/Icon'
import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LoadBadge } from '../../components/ui/Badges'
import { EmptyState } from '../../components/ui/EmptyState'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import type { Sport } from '../../core/activity/types'
import { formatDateTime } from '../../core/dates'
import { formatDistance, formatDuration, formatElevation, formatNumber } from '../../core/units'
import type { ActivityWithLoad } from '../../data/analysis'
import { useFitness } from '../../data/hooks'
import { SPORTS } from './sports'

const PAGE = 30

export function ActivitiesPage() {
  const { t } = useTranslation()
  const { loaded, isLoading, error } = useFitness()
  const [sport, setSport] = useState<Sport | 'all'>('all')
  const [limit, setLimit] = useState(PAGE)

  const actions = (
    <Link className="btn btn-secondary" to="/actividades/nueva">
      {t('activities.addManual')}
    </Link>
  )
  if (isLoading) return <Page title={t('activities.title')}><Spinner full /></Page>
  if (error) return <Page title={t('activities.title')}><Alert kind="error">{t('errors.generic')}</Alert></Page>
  if (!loaded || loaded.length === 0) {
    return (
      <Page title={t('activities.title')} actions={actions}>
        <EmptyState icon="activity" title={t('empty.activities.title')} body={t('empty.activities.body')} actionLabel={t('empty.activities.action')} actionTo="/subir" />
      </Page>
    )
  }
  const filtered = loaded.filter((l) => sport === 'all' || l.activity.sport === sport)
  return (
    <Page title={t('activities.title')} actions={actions}>
      <div className="field" style={{ maxWidth: 280 }}>
        <label htmlFor="sport-filter">{t('activities.filterSport')}</label>
        <select id="sport-filter" value={sport} onChange={(e) => { setSport(e.target.value as Sport | 'all'); setLimit(PAGE) }}>
          <option value="all">{t('activities.all')}</option>
          {SPORTS.map((s) => (
            <option key={s} value={s}>
              {t(`sports.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <p className="muted" aria-live="polite">
        {t('activities.count', { count: filtered.length })}
      </p>
      <ul className="activity-list">
        {filtered.slice(0, limit).map((l) => (
          <ActivityRow key={l.activity.id} item={l} />
        ))}
      </ul>
      {filtered.length > limit && (
        <button type="button" className="btn btn-secondary btn-block" onClick={() => setLimit(limit + PAGE)}>
          {t('activities.showMore')}
        </button>
      )}
    </Page>
  )
}

const SPORT_ICON: Record<string, IconName> = { cycling: 'bike', running: 'run', swimming: 'swim', strength: 'dumbbell', other: 'activity' }

export function ActivityRow({ item }: { item: ActivityWithLoad }) {
  const { t } = useTranslation()
  const a = item.activity
  const sub = a.subSport ? ` · ${t(`subSports.${a.subSport}`)}` : ''
  const parts = [formatDuration(a.movingS || a.elapsedS), a.distanceM ? formatDistance(a.distanceM) : null, a.elevationGainM ? `↑ ${formatElevation(a.elevationGainM)}` : null].filter(Boolean)
  return (
    <li className="activity-item">
      <Link to={`/actividades/${a.id}`} className="activity-link">
        <span className={`icon-tile activity-tile${a.sport === 'running' ? ' icon-tile-coral' : a.sport === 'swimming' ? ' icon-tile-sky' : a.sport === 'strength' ? ' icon-tile-soft' : ''}`} aria-hidden="true">
          <Icon name={SPORT_ICON[a.sport] ?? 'activity'} />
        </span>
        <span className="activity-sport">
          {t(`sports.${a.sport}`)}
          {sub}
        </span>
        <strong className="activity-title">{a.title ?? t(`sports.${a.sport}`)}</strong>
        <span className="muted">{formatDateTime(a.startTime, { timeZone: a.timezone ?? undefined })}</span>
        <span>{parts.join(' · ')}</span>
        <span className="row" style={{ gap: 'var(--space-2)' }}>
          {item.load.load !== null ? (
            <strong>{t('load.points', { value: formatNumber(item.load.load) })}</strong>
          ) : (
            <span className="muted">{t('load.noLoad')}</span>
          )}
          <LoadBadge method={item.load.method} confidence={item.load.confidence} />
          {a.sources.length > 1 && <span className="badge badge-info">{t('activities.merged')}</span>}
        </span>
      </Link>
    </li>
  )
}
