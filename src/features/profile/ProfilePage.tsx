import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Page } from '../../components/ui/Page'
import { formatDate } from '../../core/dates'
import { formatPower } from '../../core/units'
import { keys, usePhysiology, useRepoMutation } from '../../data/hooks'
import { useRepo } from '../../data/RepoProvider'
import { HealthSection } from './HealthSection'
import { BasicsForm, PhysiologyForm, WeightSection } from './forms'

export function ProfilePage() {
  const { t } = useTranslation()
  return (
    <Page title={t('profile.title')}>
      <section className="card" aria-labelledby="basics-h">
        <h2 id="basics-h">{t('profile.basics')}</h2>
        <BasicsForm />
      </section>
      <section className="card" aria-labelledby="weight-h">
        <h2 id="weight-h">{t('profile.weight')}</h2>
        <WeightSection />
      </section>
      <section className="card" aria-labelledby="phys-h">
        <h2 id="phys-h">{t('profile.physiology')}</h2>
        <PhysiologyForm />
        <PhysiologyHistory />
      </section>
      <section className="card" aria-labelledby="health-h">
        <h2 id="health-h">{t('profile.health')}</h2>
        <HealthSection />
      </section>
      <section className="card" aria-labelledby="nutrition-h">
        <h2 id="nutrition-h">{t('profile.nutrition')}</h2>
        <p>{t('nutrition.profileHelp')}</p>
        <Link to="/nutricion">{t('nutrition.editProfile')} →</Link>
      </section>
    </Page>
  )
}

function PhysiologyHistory() {
  const { t } = useTranslation()
  const phys = usePhysiology()
  const repo = useRepo()
  const del = useRepoMutation((id: string) => repo.deletePhysiology(id), [keys.physiology])
  if (!phys.data) return null
  if (phys.data.length === 0) return <p className="muted" style={{ marginTop: 'var(--space-4)' }}>{t('profile.noPhysiology')}</p>
  return (
    <>
      <h3 style={{ marginTop: 'var(--space-5)' }}>{t('profile.physiologyHistory')}</h3>
      <ul className="plain-list">
        {[...phys.data].reverse().map((p) => {
          const parts = [
            p.hrRest && `${t('profile.hrRest')}: ${p.hrRest}`,
            p.hrMax && `${t('profile.hrMax')}: ${p.hrMax}`,
            p.hrThreshold && `${t('profile.hrThreshold')}: ${p.hrThreshold}`,
            p.ftpW && `FTP: ${formatPower(p.ftpW)}`,
          ].filter(Boolean)
          const label = `${t('profile.effectiveFrom')} ${formatDate(`${p.effectiveFrom}T12:00:00Z`)}`
          return (
            <li key={p.id} className="row-between">
              <span>
                <strong>{label}</strong>
                <br />
                <span className="muted">{parts.join(' · ') || '—'}</span>
              </span>
              <button type="button" className="btn-link" onClick={() => del.mutate(p.id)} aria-label={`${t('profile.delete')}: ${label}`}>
                {t('profile.delete')}
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
