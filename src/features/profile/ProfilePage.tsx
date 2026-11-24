import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Alert, Page } from '../../components/ui/Page'
import { ageOn, formatDate, localDayKey } from '../../core/dates'
import { formatPower, formatWeight } from '../../core/units'
import { keys, useAvatar, usePhysiology, useProfile, useRepoMutation, useWeights } from '../../data/hooks'
import { Avatar } from '../../components/ui/Avatar'
import { Icon, TitleIcon } from '../../components/ui/Icon'
import { AvatarError, prepareAvatar } from './avatarImage'
import { useAuth } from '../auth/AuthProvider'
import { latestWeight, physiologyOn } from '../../data/analysis'
import { useRepo } from '../../data/RepoProvider'
import { HealthSection } from './HealthSection'
import { BasicsForm, PhysiologyForm, WeightSection } from './forms'

export function ProfilePage() {
  const { t } = useTranslation()
  return (
    <Page title={t('profile.title')}>
      <ProfileHeader />
      <section className="card" aria-labelledby="basics-h">
        <h2 id="basics-h" className="card-title-icon">
          <TitleIcon name="user" />
          {t('profile.basics')}
        </h2>
        <BasicsForm />
      </section>
      <section className="card" aria-labelledby="weight-h">
        <h2 id="weight-h" className="card-title-icon">
          <TitleIcon name="scale" tone="sky" />
          {t('profile.weight')}
        </h2>
        <WeightSection />
      </section>
      <section className="card" aria-labelledby="phys-h">
        <h2 id="phys-h" className="card-title-icon">
          <TitleIcon name="heart" tone="coral" />
          {t('profile.physiology')}
        </h2>
        <PhysiologyForm />
        <PhysiologyHistory />
      </section>
      <section className="card" aria-labelledby="health-h">
        <h2 id="health-h" className="card-title-icon">
          <TitleIcon name="shield" tone="soft" />
          {t('profile.health')}
        </h2>
        <HealthSection />
      </section>
      <section className="card" aria-labelledby="nutrition-h">
        <h2 id="nutrition-h" className="card-title-icon">
          <TitleIcon name="food" tone="coral" />
          {t('profile.nutrition')}
        </h2>
        <p>{t('nutrition.profileHelp')}</p>
        <Link to="/nutricion">{t('nutrition.editProfile')} →</Link>
      </section>
      <AccountSection />
    </Page>
  )
}

/** Cuenta: correo y cerrar sesión (también está en Ajustes). */
function AccountSection() {
  const { t } = useTranslation()
  const { user, signOut, mode } = useAuth()
  return (
    <section className="card" aria-labelledby="account-h">
      <h2 id="account-h" className="card-title-icon">
        <TitleIcon name="logout" tone="soft" />
        {t('settings.account')}
      </h2>
      {mode === 'local' ? <p className="muted">{t('local.banner')}</p> : user?.email && <p className="muted">{user.email}</p>}
      <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
        <Icon name="logout" /> {t('settings.signOut')}
      </button>
    </section>
  )
}

/** Subir, cambiar o quitar la foto de perfil. */
function PhotoControls() {
  const { t } = useTranslation()
  const repo = useRepo()
  const avatar = useAvatar()
  const input = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const save = useRepoMutation(async (file: File) => repo.saveAvatar(await prepareAvatar(file)), [keys.avatar])
  const qc = useQueryClient()
  const remove = useRepoMutation(async () => {
    await repo.deleteAvatar()
    qc.setQueryData(keys.avatar, null) // se ve el avatar estándar de inmediato
  }, [keys.avatar])
  const busy = save.isPending || remove.isPending
  const hasPhoto = Boolean(avatar.data)

  async function onFile(file: File | undefined) {
    if (!file) return
    setMessage(null)
    try {
      await save.mutateAsync(file)
      setMessage({ kind: 'success', text: t('profile.photoSaved') })
    } catch (e) {
      const code = e instanceof AvatarError ? e.message : 'generic'
      setMessage({ kind: 'error', text: t(`profile.photoErrors.${code}`) })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="photo-controls">
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      <div className="row">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => input.current?.click()} aria-describedby="photo-help">
          <Icon name="camera" /> {save.isPending ? t('profile.photoSaving') : hasPhoto ? t('profile.photoChange') : t('profile.photoUpload')}
        </button>
        {hasPhoto && (
          <button
            type="button"
            className="btn-link"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(t('profile.photoRemoveConfirm'))) return
              try {
                await remove.mutateAsync(undefined)
                setMessage({ kind: 'success', text: t('profile.photoRemoved') })
              } catch {
                setMessage({ kind: 'error', text: t('profile.photoErrors.generic') })
              }
            }}
          >
            {t('profile.photoRemove')}
          </button>
        )}
      </div>
      <p id="photo-help" className="hint muted">
        {t('profile.photoHelp')}
      </p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </div>
  )
}

/** Encabezado: foto o avatar estándar, nombre, edad, estatura y peso; y el espectro de zonas si hay pulso. */
function ProfileHeader() {
  const { t } = useTranslation()
  const profile = useProfile()
  const weights = useWeights()
  const phys = usePhysiology()
  const p = profile.data
  if (!p) return null
  const today = localDayKey(new Date())
  const kg = weights.data ? latestWeight(weights.data) : null
  const ph = phys.data ? physiologyOn(phys.data, today) : null
  const facts = [p.birthDate && t('profile.ageYears', { count: ageOn(p.birthDate, today) }), p.heightCm && `${p.heightCm} cm`, kg && formatWeight(kg)].filter(
    Boolean,
  )
  return (
    <section className="card profile-head" aria-label={p.displayName ?? t('profile.title')}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <Avatar size={64} className="avatar-lg" />
        <div>
          <p className="profile-name">{p.displayName}</p>
          {facts.length > 0 && <p className="muted">{facts.join(' · ')}</p>}
        </div>
      </div>
      <PhotoControls />
      {ph?.hrMax && (
        <div className="zone-spectrum">
          <div className="zone-bar" aria-hidden="true">
            <span className="z1" />
            <span className="z2" />
            <span className="z3" />
            <span className="z4" />
            <span className="z5" />
          </div>
          <p className="mono">{ph.hrRest ? t('profile.hrSpectrumRest', { max: ph.hrMax, rest: ph.hrRest }) : t('profile.hrSpectrum', { max: ph.hrMax })}</p>
        </div>
      )}
    </section>
  )
}

function PhysiologyHistory() {
  const { t } = useTranslation()
  const phys = usePhysiology()
  const repo = useRepo()
  const del = useRepoMutation((id: string) => repo.deletePhysiology(id), [keys.physiology])
  if (!phys.data) return null
  if (phys.data.length === 0)
    return (
      <p className="muted" style={{ marginTop: 'var(--space-4)' }}>
        {t('profile.noPhysiology')}
      </p>
    )
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
