import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { MatchResult } from '../../core/planner/adapt'
import type { Block } from '../../core/planner/plan'
import { zoneTarget, type ZoneSet } from '../../core/planner/zones'
import type { StoredSession } from '../../data/types'
import { Icon, type IconName } from '../../components/ui/Icon'

export const SESSION_ICON: Record<string, IconName> = { cycling: 'bike', running: 'run', swimming: 'swim', strength: 'dumbbell', other: 'activity' }
const STATUS_ICON: Record<string, IconName> = { done: 'check', partial: 'gauge', harder: 'chevronUp', missed: 'close', pending: 'clock', rest: 'bed' }

export function StatusBadge({ status }: { status: MatchResult['status'] }) {
  const { t } = useTranslation()
  return (
    <span className={`badge badge-session-${status}`}>
      <Icon name={STATUS_ICON[status]} />
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

export function SessionCard({ session: s, match, zones, compact = false }: { session: StoredSession; match?: MatchResult; zones: ZoneSet; compact?: boolean }) {
  const { t } = useTranslation()
  const describe = useDescribeBlocks()
  const lines = describe(s.blocks, zones, s.sport)
  return (
    <Link to={`/plan/sesion/${s.id}`} className="session-card">
      <span
        className={`icon-tile session-tile${s.kind === 'event' ? ' icon-tile-coral' : s.kind === 'rest' || s.kind === 'recovery' ? ' icon-tile-soft' : ''}`}
        aria-hidden="true"
      >
        <Icon name={SESSION_ICON[s.sport] ?? 'activity'} />
      </span>
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
      {!compact && s.kind !== 'strength' && (
        <ul className="session-blocks">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </Link>
  )
}

const seenKey = (id: string) => `entreno.aviso.${id}`
function wasSeen(id: string) {
  try {
    return localStorage.getItem(seenKey(id)) === '1'
  } catch {
    return false
  }
}

/**
 * Aviso de que el contenido es orientativo. Sale hasta que la persona toca
 * «Entendido»; después no vuelve a aparecer (queda siempre en Ayuda).
 */
export function LegalNotice({ text, id = 'plan' }: { text?: string; id?: string } = {}) {
  const { t } = useTranslation()
  const [seen, setSeen] = useState(() => wasSeen(id))
  if (seen) return null
  return (
    <div className="notice-legal" role="note">
      <Icon name="alert" />
      <p>{text ?? t('plan.legal')}</p>
      <button
        type="button"
        className="btn btn-secondary notice-legal-ok"
        onClick={() => {
          try {
            localStorage.setItem(seenKey(id), '1')
          } catch {
            /* sin almacenamiento: se cierra solo por ahora */
          }
          setSeen(true)
        }}
      >
        {t('common.understood')}
      </button>
    </div>
  )
}

export function ZonesNotice({ zones }: { zones: ZoneSet }) {
  const { t } = useTranslation()
  if (!zones.hrThreshold) return <p className="notice-estimate">{t('plan.noZones')}</p>
  if (!zones.hrEstimated) return null
  return (
    <p className="notice-estimate">
      <strong>{t('plan.estimatedZones', { source: t(`plan.estimatedSource.${zones.hrSource}`) })}</strong> <Link to="/perfil">{t('nav.profile')}</Link>
    </p>
  )
}
