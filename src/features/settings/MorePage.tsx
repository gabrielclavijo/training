import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ADMIN_ITEM, SECONDARY } from '../../app/Layout'
import { useIsAdmin } from '../admin/useIsAdmin'
import { Icon } from '../../components/ui/Icon'
import { Page } from '../../components/ui/Page'

const TONES = ['', ' icon-tile-coral', ' icon-tile-sky', ' icon-tile-soft']

/** En celular, "Más" agrupa las secciones que no caben en la barra inferior. */
export function MorePage() {
  const { t } = useTranslation()
  const admin = useIsAdmin()
  const items = admin ? [...SECONDARY, ADMIN_ITEM] : SECONDARY
  return (
    <Page title={t('nav.more')}>
      <nav aria-label={t('nav.more')}>
        <ul className="more-grid">
          {items.map((i, n) => (
            <li key={i.to} style={{ animationDelay: `${n * 35}ms` }}>
              <Link to={i.to} className="more-card">
                <span className={`icon-tile${TONES[n % TONES.length]}`} aria-hidden="true">
                  <Icon name={i.icon} />
                </span>
                <strong>{t(i.label)}</strong>
                <span className="muted">{t(`navDesc.${i.to}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Page>
  )
}
