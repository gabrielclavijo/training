import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui/EmptyState'
import { Page } from '../../components/ui/Page'
import { formatLongDate } from '../../core/dates'

export function HomePage() {
  const { t } = useTranslation()
  return (
    <Page title={t('nav.home')}>
      <p className="muted capitalize-first">
        {formatLongDate(new Date())}
      </p>
      <EmptyState
        icon="activity"
        title={t('empty.activities.title')}
        body={t('empty.activities.body')}
        actionLabel={t('empty.activities.action')}
        actionTo="/subir"
      />
    </Page>
  )
}
