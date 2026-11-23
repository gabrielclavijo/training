import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Page } from '../../components/ui/Page'
import { keys, useProfile, useRepoMutation } from '../../data/hooks'
import { useRepo } from '../../data/RepoProvider'
import { BasicsForm, PhysiologyForm } from '../profile/forms'
import { DemoDataButton } from '../settings/DemoData'

const TOTAL = 4

/** Onboarding corto: perfil básico → fisiológicos → traer actividades → primera meta. */
export function OnboardingPage() {
  const { t } = useTranslation()
  const repo = useRepo()
  const profile = useProfile()
  const navigate = useNavigate()
  const [step, setStep] = useState<number>(() => Math.min(TOTAL, Math.max(1, (profile.data?.onboardingStep ?? 0) + 1)))
  const setProgress = useRepoMutation((s: { step: number; done?: boolean }) => repo.updateProfile({ onboardingStep: s.step, onboardingDone: s.done }), [keys.profile])

  async function next(current: number) {
    await setProgress.mutateAsync({ step: current })
    setStep(current + 1)
  }
  async function finish(to: string) {
    await setProgress.mutateAsync({ step: TOTAL, done: true })
    navigate(to)
  }

  return (
    <Page title={t('onboarding.title')}>
      <p className="muted" aria-live="polite">
        {t('onboarding.step', { current: step, total: TOTAL })}
      </p>
      <progress className="progress" max={TOTAL} value={step} aria-label={t('onboarding.step', { current: step, total: TOTAL })} />

      {step === 1 && (
        <section className="card" aria-labelledby="ob1">
          <h2 id="ob1">{t('onboarding.s1Title')}</h2>
          <p className="muted">{t('onboarding.s1Help')}</p>
          <BasicsForm askWeight submitLabel={t('common.continue')} onSaved={() => void next(1)} />
        </section>
      )}

      {step === 2 && (
        <section className="card" aria-labelledby="ob2">
          <h2 id="ob2">{t('onboarding.s2Title')}</h2>
          <p className="muted">{t('onboarding.s2Help')}</p>
          <PhysiologyForm submitLabel={t('common.continue')} onSaved={() => void next(2)} />
          <div className="row" style={{ marginTop: 'var(--space-3)' }}>
            <button type="button" className="btn-link" onClick={() => setStep(1)}>
              {t('common.back')}
            </button>
            <button type="button" className="btn-link" onClick={() => void next(2)}>
              {t('common.skip')}
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card" aria-labelledby="ob3">
          <h2 id="ob3">{t('onboarding.s3Title')}</h2>
          <p className="muted">{t('onboarding.s3Help')}</p>
          <div className="stack">
            <button type="button" className="btn btn-primary" onClick={() => void finish('/subir')}>
              {t('onboarding.s3Upload')}
            </button>
            <Link className="btn btn-secondary" to="/guias">
              {t('onboarding.s3Guide')}
            </Link>
            <DemoDataButton />
          </div>
          <div className="row" style={{ marginTop: 'var(--space-3)' }}>
            <button type="button" className="btn-link" onClick={() => setStep(2)}>
              {t('common.back')}
            </button>
            <button type="button" className="btn-link" onClick={() => void next(3)}>
              {t('common.continue')}
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="card" aria-labelledby="ob4">
          <h2 id="ob4">{t('onboarding.s4Title')}</h2>
          <p className="muted">{t('onboarding.s4Help')}</p>
          <div className="stack">
            <button type="button" className="btn btn-primary" onClick={() => void finish('/metas/nueva')}>
              {t('onboarding.s4Create')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void finish('/')}>
              {t('onboarding.finishLater')}
            </button>
          </div>
          <button type="button" className="btn-link" onClick={() => setStep(3)}>
            {t('common.back')}
          </button>
        </section>
      )}
    </Page>
  )
}
