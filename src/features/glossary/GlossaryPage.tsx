import { TitleIcon } from '../../components/ui/Icon'
import { useTranslation } from 'react-i18next'
import { LoadBadge } from '../../components/ui/Badges'
import { Page } from '../../components/ui/Page'
import type { LoadMethod } from '../../core/load'

const METHODS: LoadMethod[] = ['power_tss', 'hr_tss', 'trimp', 'rpe', 'none']

export function GlossaryPage() {
  const { t } = useTranslation()
  const terms: [string, string][] = [
    [t('fitness.ctl'), t('fitness.ctlHelp')],
    [t('fitness.atl'), t('fitness.atlHelp')],
    [t('fitness.tsb'), t('fitness.tsbHelp')],
    [t('fitness.ramp'), t('fitness.rampHelp')],
    [t('fitness.weeklyLoad'), t('fitness.weeklyLoadHelp')],
  ]
  return (
    <Page title={t('glossary.title')}>
      <p className="muted">{t('glossary.intro')}</p>
      <section className="card prose" aria-labelledby="g-load">
        <h2 id="g-load" className="card-title-icon">
          <TitleIcon name="bolt" tone="coral" />
          {t('glossary.loadTitle')}
        </h2>
        <p>{t('glossary.loadText')}</p>
        <h3>{t('glossary.methodsTitle')}</h3>
        <dl className="glossary">
          {METHODS.map((m) => (
            <div key={m}>
              <dt>
                <LoadBadge method={m} confidence={null} />
              </dt>
              <dd>{t(`glossary.methods.${m}`)}</dd>
            </div>
          ))}
        </dl>
        <h3>{t('glossary.confidenceTitle')}</h3>
        <p>{t('glossary.confidenceText')}</p>
      </section>
      <section className="card prose" aria-labelledby="g-fit">
        <h2 id="g-fit" className="card-title-icon">
          <TitleIcon name="trend" />
          {t('fitness.title')}
        </h2>
        <dl className="glossary">
          {terms.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Page>
  )
}
