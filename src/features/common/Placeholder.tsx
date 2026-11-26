import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui/EmptyState'
import { Page } from '../../components/ui/Page'

/** Pantalla provisional para las secciones que se construyen en pasos siguientes. */
export function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation()
  return (
    <Page title={t(titleKey)}>
      <EmptyState title={t(titleKey)} body={t('common.comingSoon')} />
    </Page>
  )
}

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <Page title={t('errors.notFoundTitle')}>
      <EmptyState title={t('errors.notFoundTitle')} body={t('errors.notFoundBody')} actionLabel={t('errors.goHome')} actionTo="/" />
    </Page>
  )
}
