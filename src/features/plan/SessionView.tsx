import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { MatchResult } from '../../core/planner/adapt'
import type { Block } from '../../core/planner/plan'
import { zoneTarget, type ZoneSet } from '../../core/planner/zones'
import type { StoredSession } from '../../data/types'

const STATUS_ICON: Record<string, string> = { done: '✓', partial: '◐', harder: '▲', missed: '✗', pending: '○', rest: '–' }

export function StatusBadge({ status }: { status: MatchResult['status'] }) {
  const { t } = useTranslation()
  return (
    <span className={`badge badge-session-${status}`}>
      <span aria-hidden="true">{STATUS_ICON[status]} </span>
      {t(`plan.status.${status}`)}
    </span>
  )
}

/** Describe la sesión en lenguaje claro, con la intensidad en lo que la persona pueda medir. */
export function useDescribeBlocks() {
  const { t } = useTranslation()
  return (blocks: Block[], zones: ZoneSet, sport: string) =>
    blocks.map((b) => {
      const z = zoneTarget(b.zone, zones, sport)
      const parts = [t('plan.zone', { zone: b.zone })]
      if (z.power) parts.push(t('plan.power', { from: z.power[0], to: z.power[1] }))
      if (z.hr) parts.push(`${t('plan.hr', { from: z.hr[0], to: z.hr[1] })}${z.hrEstimated ? ` ${t('plan.estimatedMark')}` : ''}`)
      parts.push(t('plan.rpe', { from: z.rpe[0], to: z.rpe[1] }))
      const head = b.repeat && b.repeat > 1 ? t('plan.repeat', { repeat: b.repeat, minutes: b.minutes }) : t('plan.block', { minutes: b.minutes })
      const rest = b.repeat && b.repeat > 1 && b.restMinutes ? `, ${t('plan.restBetween', { minutes: b.restMinutes })}` : ''
      return `${head}: ${parts.join(' · ')}${rest}`
    })
}

export function SessionCard({
  session: s,
  match,
  zones,
  compact = false,
}: {
  session: StoredSession
  match?: MatchResult
  zones: ZoneSet
  compact?: boolean
}) {
  const { t } = useTranslation()
  const describe = useDescribeBlocks()
  const lines = describe(s.blocks, zones, s.sport)
  return (
    <Link to={`/plan/sesion/${s.id}`} className="session-card">
      <span className="row-between">
        <strong>
          {t(`plan.kind.${s.kind}`)} · {t(`sports.${s.sport}`)}
        </strong>
        {match && <StatusBadge status={match.status} />}
      </span>
      <span className="muted">
        {t('plan.minutes', { count: s.durationMin })} · {t('plan.load', { value: Math.round(s.plannedLoad) })}
        {s.note && ` · ${t(`plan.sessionNote.${s.note}`)}`}
      </span>
      {!compact && (
        <ul className="session-blocks">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </Link>
  )
}

export function LegalNotice() {
  const { t } = useTranslation()
  return (
    <div className="notice-legal" role="note">
      <strong>⚠ {t('plan.legal')}</strong>
    </div>
  )
}

export function ZonesNotice({ zones }: { zones: ZoneSet }) {
  const { t } = useTranslation()
  if (!zones.hrThreshold) return <p className="notice-estimate">{t('plan.noZones')}</p>
  if (!zones.hrEstimated) return null
  return (
    <p className="notice-estimate">
      <strong>{t('plan.estimatedZones', { source: t(`plan.estimatedSource.${zones.hrSource}`) })}</strong>{' '}
      <Link to="/perfil">{t('nav.profile')}</Link>
    </p>
  )
}
