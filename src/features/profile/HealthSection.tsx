import { useState, type FormEvent } from 'react'
import { BusyButton } from '../../components/ui/Busy'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Alert } from '../../components/ui/Page'
import { TextField } from '../../components/ui/Field'
import { keys, useHasHealthConsent, useHealth, useRepoMutation } from '../../data/hooks'
import { useRepo } from '../../data/RepoProvider'
import type { HealthCategory } from '../../data/types'

export const HEALTH_POLICY_VERSION = '1'

/** Datos de salud: primero el consentimiento explícito; luego, registros cifrados. */
export function HealthSection() {
  const { t } = useTranslation()
  const repo = useRepo()
  const consent = useHasHealthConsent()
  const health = useHealth()
  const grant = useRepoMutation(() => repo.grantConsent('health_data', HEALTH_POLICY_VERSION), [keys.consents], {
    success: t('toast.permissionGranted'),
    icon: 'shield',
  })
  const revoke = useRepoMutation(async () => {
    await repo.deleteAllHealth()
    await repo.revokeConsent('health_data')
  }, 'all')
  const del = useRepoMutation((id: string) => repo.deleteHealth(id), 'all', { success: t('toast.deleted'), icon: 'trash' })

  if (consent.isLoading) return null

  if (!consent.data) {
    return (
      <div>
        <p>{t('profile.healthIntro')}</p>
        <div className="callout">
          <h3>{t('profile.consentTitle')}</h3>
          <p>{t('profile.consentText')}</p>
          <BusyButton type="button" busy={grant.isPending} onClick={() => grant.mutate(undefined)}>
            {t('profile.consentAccept')}
          </BusyButton>
        </div>
      </div>
    )
  }

  const meds = health.data?.filter((h) => h.category === 'medication') ?? []
  const allergies = health.data?.filter((h) => h.category === 'allergy') ?? []

  return (
    <div className="stack">
      <p>{t('profile.healthIntro')}</p>
      {health.isError && <Alert kind="error">{t('errors.generic')}</Alert>}
      <section aria-labelledby="meds-h">
        <h3 id="meds-h">{t('profile.medications')}</h3>
        <ul className="plain-list">
          {meds.length === 0 && <li className="muted">{t('profile.noHealth')}</li>}
          {meds.map((m) => (
            <li key={m.id} className="row-between">
              <span>
                {m.data.name}
                {m.data.affectsHeartRate && <span className="badge badge-warning"> {t('profile.altersHr')}</span>}
              </span>
              <button
                type="button"
                className="btn-link"
                disabled={del.isPending}
                aria-busy={(del.isPending && del.variables === m.id) || undefined}
                onClick={() => del.mutate(m.id)}
                aria-label={`${t('profile.delete')} ${m.data.name}`}
              >
                {t('profile.delete')}
              </button>
            </li>
          ))}
        </ul>
        <AddHealthForm category="medication" />
      </section>
      <section aria-labelledby="allergy-h">
        <h3 id="allergy-h">{t('profile.allergies')}</h3>
        <ul className="plain-list">
          {allergies.length === 0 && <li className="muted">{t('profile.noHealth')}</li>}
          {allergies.map((m) => (
            <li key={m.id} className="row-between">
              <span>{m.data.name}</span>
              <button
                type="button"
                className="btn-link"
                disabled={del.isPending}
                aria-busy={(del.isPending && del.variables === m.id) || undefined}
                onClick={() => del.mutate(m.id)}
                aria-label={`${t('profile.delete')} ${m.data.name}`}
              >
                {t('profile.delete')}
              </button>
            </li>
          ))}
        </ul>
        <AddHealthForm category="allergy" />
      </section>
      <section aria-labelledby="labs-link-h">
        <h3 id="labs-link-h">{t('labs.title')}</h3>
        <Link to="/laboratorio">{t('labs.add')} →</Link>
      </section>
      <p className="muted">🔒 {t('profile.encrypted')}</p>
      <div>
        <BusyButton
          type="button"
          className="btn btn-secondary"
          busy={revoke.isPending}
          busyLabel={t('common.deleting')}
          onClick={() => {
            if (window.confirm(t('profile.consentRevokeConfirm'))) revoke.mutate(undefined)
          }}
        >
          {t('profile.consentRevoke')}
        </BusyButton>
      </div>
    </div>
  )
}

function AddHealthForm({ category }: { category: HealthCategory }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const [name, setName] = useState('')
  const [affects, setAffects] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const add = useRepoMutation(
    () => repo.saveHealth({ category, recordedOn: null, data: { name: name.trim(), affectsHeartRate: category === 'medication' ? affects : undefined } }),
    'all',
    { success: t('common.saved') },
  )
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError(t('activities.required'))
    setError(null)
    await add.mutateAsync(undefined)
    setName('')
    setAffects(false)
  }
  return (
    <form onSubmit={onSubmit} noValidate className="inline-form">
      {add.isError && <Alert kind="error">{t('errors.generic')}</Alert>}
      <TextField
        label={category === 'medication' ? t('profile.medicationName') : t('profile.allergyName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={error}
      />
      {category === 'medication' && (
        <label className="choice" style={{ marginBottom: 'var(--space-3)' }}>
          <input type="checkbox" checked={affects} onChange={(e) => setAffects(e.target.checked)} />
          {t('profile.affectsHr')}
        </label>
      )}
      <BusyButton type="submit" className="btn btn-secondary" busy={add.isPending}>
        {category === 'medication' ? t('profile.addMedication') : t('profile.addAllergy')}
      </BusyButton>
    </form>
  )
}
