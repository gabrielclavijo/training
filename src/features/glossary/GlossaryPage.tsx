import { TitleIcon, type IconName } from '../../components/ui/Icon'
import { useTranslation } from 'react-i18next'
import { LoadBadge } from '../../components/ui/Badges'
import { Page } from '../../components/ui/Page'
import type { LoadMethod } from '../../core/load'

const METHODS: LoadMethod[] = ['power_tss', 'hr_tss', 'trimp', 'rpe', 'none']

export function GlossaryPage() {
  const { t } = useTranslation()
  const terms: [string, string, IconName, ('coral' | 'sky' | 'soft')?][] = [
    [t('fitness.ctl'), t('fitness.ctlHelp'), 'trend'],
    [t('fitness.atl'), t('fitness.atlHelp'), 'bolt', 'coral'],
    [t('fitness.tsb'), t('fitness.tsbHelp'), 'gauge', 'sky'],
    [t('fitness.ramp'), t('fitness.rampHelp'), 'chart', 'soft'],
    [t('fitness.weeklyLoad'), t('fitness.weeklyLoadHelp'), 'calendar', 'sky'],
  ]
  return (
    <Page title={t('glossary.title')}>
      <p className="muted">{t('glossary.intro')}</p>
      <section className="card" aria-labelledby="g-load">
        <h2 id="g-load" className="card-title-icon">
          <TitleIcon name="bolt" tone="coral" />
          {t('glossary.loadTitle')}
        </h2>
        <p>{t('glossary.loadText')}</p>
        <h3>{t('glossary.methodsTitle')}</h3>
        <ul className="info-grid method-grid">
          {METHODS.map((m, i) => (
            <li key={m} className="info-card">
              <span className="method-rank" aria-hidden="true">
                {Array.from({ length: 4 }, (_, k) => (
                  <i key={k} className={k < 4 - i ? 'on' : ''} />
                ))}
              </span>
              <LoadBadge method={m} confidence={null} />
              <p>{t(`glossary.methods.${m}`)}</p>
            </li>
          ))}
        </ul>
        <div className="confidence-box">
          <TitleIcon name="gauge" tone="sky" />
          <div>
            <h3>{t('glossary.confidenceTitle')}</h3>
            <p>{t('glossary.confidenceText')}</p>
          </div>
        </div>
      </section>
      <section className="card" aria-labelledby="g-fit">
        <h2 id="g-fit" className="card-title-icon">
          <TitleIcon name="trend" />
          {t('fitness.title')}
        </h2>
        <ul className="info-grid">
          {terms.map(([k, v, icon, tone]) => (
            <li key={k} className="info-card">
              <TitleIcon name={icon} tone={tone} />
              <h3>{k}</h3>
              <p>{v}</p>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  )
}
