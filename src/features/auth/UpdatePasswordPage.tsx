import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Alert, Page } from '../../components/ui/Page'
import { requireSupabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'

export function UpdatePasswordPage() {
  const { t } = useTranslation()
  const { clearRecovering } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError(t('auth.passwordShort'))
    const { error: err } = await requireSupabase().auth.updateUser({ password })
    if (err) return setError(t('errors.generic'))
    setDone(true)
    clearRecovering()
    setTimeout(() => navigate('/'), 1500)
  }

  return (
    <Page title={t('auth.updatePassword')}>
      <form onSubmit={onSubmit} noValidate className="card" style={{ maxWidth: 420 }}>
        {error && <Alert kind="error">{error}</Alert>}
        {done && <Alert kind="success">{t('auth.passwordUpdated')}</Alert>}
        <div className="field">
          <label htmlFor="new-password">{t('auth.newPassword')}</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="np-hint"
          />
          <span id="np-hint" className="hint">
            {t('auth.passwordHint')}
          </span>
        </div>
        <button className="btn btn-primary" type="submit">
          {t('auth.updatePassword')}
        </button>
      </form>
    </Page>
  )
}
