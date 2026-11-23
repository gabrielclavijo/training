import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Alert } from '../../components/ui/Page'
import { authRedirectUrl, isSupabaseConfigured, supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'

type Mode = 'signIn' | 'signUp' | 'forgot'

const emailSchema = z.email()

export function LoginPage() {
  const { t } = useTranslation()
  const { user, localModeAvailable, enterLocalMode } = useAuth()
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const h1 = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${t('auth.signIn')} · ${t('app.name')}`
  }, [t])

  if (user) return <Navigate to="/" replace />

  if (!isSupabaseConfigured || !supabase) {
    return (
      <main className="auth-page" id="contenido">
        <p className="brand" aria-hidden="true">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={32} height={32} /> {t('app.name')}
        </p>
        <h1>{t('auth.welcomeTitle')}</h1>
        <p className="muted">{t('auth.welcomeBody')}</p>
        {localModeAvailable ? (
          <div className="callout">
            <h2>{t('local.title')}</h2>
            <p>{t('local.explain')}</p>
            <button type="button" className="btn btn-primary btn-block" onClick={enterLocalMode}>
              {t('local.enter')}
            </button>
          </div>
        ) : (
          <Alert kind="error">{t('errors.config')}</Alert>
        )}
        <p className="muted" style={{ marginTop: 'var(--space-5)', fontSize: '0.9rem' }}>
          <Link to="/privacidad">{t('auth.privacyLink')}</Link>
        </p>
      </main>
    )
  }
  const sb = supabase

  function validate() {
    const e: typeof errors = {}
    if (!emailSchema.safeParse(email.trim()).success) e.email = t('auth.emailInvalid')
    if (mode !== 'forgot' && password.length < 8) e.password = t('auth.passwordShort')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    setNotice(null)
    if (!validate()) return
    setBusy(true)
    try {
      if (mode === 'signIn') {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
        if (error) setErrors({ form: t('auth.invalidCredentials') })
      } else if (mode === 'signUp') {
        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: authRedirectUrl() },
        })
        if (error) setErrors({ form: t('errors.generic') })
        else if (!data.session) setNotice(t('auth.checkEmail'))
      } else {
        await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl() })
        setNotice(t('auth.resetSent'))
      }
    } catch {
      setErrors({ form: t('errors.network') })
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    setBusy(true)
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl() },
    })
    if (error) {
      setErrors({ form: t('errors.generic') })
      setBusy(false)
    }
  }

  const submitLabel = mode === 'signIn' ? t('auth.signIn') : mode === 'signUp' ? t('auth.signUp') : t('auth.sendReset')

  return (
    <main className="auth-page" id="contenido">
      <p className="brand" aria-hidden="true">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={32} height={32} /> {t('app.name')}
      </p>
      <h1 ref={h1}>{mode === 'forgot' ? t('auth.forgot') : t('auth.welcomeTitle')}</h1>
      {mode !== 'forgot' && <p className="muted">{t('auth.welcomeBody')}</p>}

      {errors.form && <Alert kind="error">{errors.form}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      {mode !== 'forgot' && (
        <>
          <button type="button" className="btn btn-secondary btn-block" onClick={google} disabled={busy}>
            <GoogleMark /> {t('auth.google')}
          </button>
          <p className="divider">{t('auth.or')}</p>
        </>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">{t('auth.email')}</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && (
            <span id="email-error" className="error">
              {errors.email}
            </span>
          )}
        </div>

        {mode !== 'forgot' && (
          <div className="field">
            <label htmlFor="password">{t('auth.password')}</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={`password-hint${errors.password ? ' password-error' : ''}`}
            />
            <span id="password-hint" className="hint">
              {t('auth.passwordHint')}
            </span>
            {errors.password && (
              <span id="password-error" className="error">
                {errors.password}
              </span>
            )}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {submitLabel}
        </button>
      </form>

      <div className="stack" style={{ marginTop: 'var(--space-4)', gap: 0 }}>
        {mode === 'signIn' && (
          <>
            <button type="button" className="btn-link" onClick={() => setMode('signUp')}>
              {t('auth.noAccount')}
            </button>
            <button type="button" className="btn-link" onClick={() => setMode('forgot')}>
              {t('auth.forgot')}
            </button>
          </>
        )}
        {mode !== 'signIn' && (
          <button type="button" className="btn-link" onClick={() => setMode('signIn')}>
            {t('auth.haveAccount')}
          </button>
        )}
      </div>

      <p className="muted" style={{ marginTop: 'var(--space-5)', fontSize: '0.9rem' }}>
        {t('auth.privacyNotice')} <Link to="/privacidad">{t('auth.privacyLink')}</Link>.
      </p>
    </main>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
