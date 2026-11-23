import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { SECONDARY } from '../../app/Layout'
import { Icon } from '../../components/ui/Icon'
import { Page } from '../../components/ui/Page'

/** En celular, "Más" agrupa las secciones que no caben en la barra inferior. */
export function MorePage() {
  const { t } = useTranslation()
  return (
    <Page title={t('nav.more')}>
      <nav aria-label={t('nav.more')} className="card" style={{ padding: 0 }}>
        <ul className="menu-list">
          {SECONDARY.map((i) => (
            <li key={i.to}>
              <Link to={i.to}>
                <Icon name={i.icon} />
                {t(i.label)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Page>
  )
}
