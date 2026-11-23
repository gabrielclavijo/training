import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon, type IconName } from './Icon'

interface Props {
  title: string
  body?: ReactNode
  actionLabel?: string
  actionTo?: string
  icon?: IconName
}

/** Estado vacío útil: explica qué falta y ofrece el siguiente paso. */
export function EmptyState({ title, body, actionLabel, actionTo, icon = 'empty' }: Props) {
  return (
    <section className="card empty-state" aria-labelledby="empty-title">
      <Icon name={icon} />
      <h2 id="empty-title">{title}</h2>
      {body && <p className="muted">{body}</p>}
      {actionLabel && actionTo && (
        <Link className="btn btn-primary" to={actionTo}>
          {actionLabel}
        </Link>
      )}
    </section>
  )
}
