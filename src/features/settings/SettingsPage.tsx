import { TitleIcon } from '../../components/ui/Icon'
import { SignOutButton } from '../profile/SignOutButton'
import { BusyButton } from '../../components/ui/Busy'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Alert, Page } from '../../components/ui/Page'
import { localDayKey } from '../../core/dates'
import { useRepo } from '../../data/RepoProvider'
import { useAuth } from '../auth/AuthProvider'
import { DemoDataButton } from './DemoData'
import { buildExport } from './exportData'

export function SettingsPage() {
  const { t } = useTranslation()
  const { user, signOut, mode } = useAuth()

  return (
    <Page title={t('settings.title')}>
      <section className="card" aria-labelledby="locale-h">
        <h2 id="locale-h" className="card-title-icon">
          <TitleIcon name="book" tone="soft" />
          {t('settings.language')} y {t('settings.units').toLowerCase()}
        </h2>
        <div className="field">
          <label htmlFor="locale">{t('settings.language')}</label>
          <select id="locale" disabled aria-describedby="only-one" defaultValue="es-CO">
            <option value="es-CO">{t('settings.languageEsCO')}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="units">{t('settings.units')}</label>
          <select id="units" disabled aria-describedby="only-one" defaultValue="metric">
            <option value="metric">{t('settings.unitsMetric')}</option>
          </select>
        </div>
        <p id="only-one" className="muted">
          {t('settings.onlyOptionForNow')}
        </p>
      </section>

      <section className="card" aria-labelledby="demo-h">
        <h2 id="demo-h" className="card-title-icon">
          <TitleIcon name="sparkles" tone="sky" />
          {t('settingsExtra.demo')}
        </h2>
        <p className="muted">{t('settingsExtra.demoHelp')}</p>
        <DemoDataButton withClear />
      </section>

      <section className="card" aria-labelledby="data-h">
        <h2 id="data-h" className="card-title-icon">
          <TitleIcon name="import" />
          {t('settingsExtra.data')}
        </h2>
        <ExportButton />
        <hr className="sep" />
        <DeleteAccount />
      </section>

      <section className="card" aria-labelledby="account-h">
        <h2 id="account-h" className="card-title-icon">
          <TitleIcon name="logout" tone="soft" />
          {t('settings.account')}
        </h2>
        {mode === 'local' ? <p className="muted">{t('local.banner')}</p> : user?.email && <p className="muted">{user.email}</p>}
        <SignOutButton signOut={signOut}>{t('settings.signOut')}</SignOutButton>
      </section>
    </Page>
  )
}

function ExportButton() {
  const { t } = useTranslation()
  const repo = useRepo()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  async function run() {
    setBusy(true)
    setError(false)
    try {
      const blob = await buildExport(repo)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mis-datos-${localDayKey(new Date())}.zip`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      console.error(e)
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <h3>{t('settingsExtra.export')}</h3>
      <p className="muted">{t('settingsExtra.exportHelp')}</p>
      {error && <Alert kind="error">{t('errors.generic')}</Alert>}
      <BusyButton type="button" className="btn btn-secondary" onClick={run} busy={busy} busyLabel={t('settingsExtra.exporting')}>
        {t('settingsExtra.export')}
      </BusyButton>
    </div>
  )
}

function DeleteAccount() {
  const { t } = useTranslation()
  const repo = useRepo()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const ok = word.trim().toUpperCase() === t('settingsExtra.deleteWord')
  async function run() {
    setBusy(true)
    setError(false)
    try {
      await repo.deleteAccount()
      await signOut()
      navigate('/ingresar')
    } catch (e) {
      console.error(e)
      setError(true)
      setBusy(false)
    }
  }
  return (
    <div>
      <h3>{t('settingsExtra.deleteAccount')}</h3>
      <p className="muted">{t('settingsExtra.deleteHelp')}</p>
      {error && <Alert kind="error">{t('errors.generic')}</Alert>}
      <div className="field">
        <label htmlFor="del-word">{t('settingsExtra.deleteConfirmLabel')}</label>
        <input id="del-word" type="text" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
      </div>
      <BusyButton type="button" className="btn btn-danger" disabled={!ok} busy={busy} busyLabel={t('settingsExtra.deleting')} onClick={run}>
        {t('settingsExtra.deleteButton')}
      </BusyButton>
    </div>
  )
}
