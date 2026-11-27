import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Icon, TitleIcon, type IconName } from '../../components/ui/Icon'
import { BusyButton } from '../../components/ui/Busy'
import { Page, Spinner } from '../../components/ui/Page'
import { keys, useConsents } from '../../data/hooks'
import { useRepo } from '../../data/RepoProvider'
import { useAuth } from '../auth/AuthProvider'

// Texto en español de Colombia (como la política de privacidad, el texto largo
// vive aquí y no en el JSON de i18n). Si el texto cambia de fondo, se sube la
// versión: todas las personas lo vuelven a aceptar una vez.
export const DISCLAIMER_VERSION = '1'
export const DISCLAIMER_DATE = '27/11/2026'

/** Aceptado al crear la cuenta en este equipo (antes de confirmar el correo) */
const PENDING_KEY = 'entreno.aviso.pendiente'
/** Aceptado aquí, pero aún no guardado en el servidor (se reintenta) */
const LOCAL_KEY = 'entreno.aviso.aceptado'

const POINTS: [IconName, string, string][] = [
  [
    'bulb',
    'Solo orienta',
    'Los planes, zonas, rutinas de fuerza, recomendaciones, diagnósticos y menús son orientativos y generales. Se calculan con los datos que tú ingresas y no son una prescripción médica, deportiva ni nutricional.',
  ],
  [
    'user',
    'No reemplaza a los profesionales',
    'Usar Entreno no te exime de consultar a un médico (idealmente un deportólogo), un entrenador, un fisioterapeuta o un nutricionista, sobre todo antes de empezar un plan, subir las cargas o preparar una competencia.',
  ],
  [
    'alert',
    'Lesiones, enfermedades y medicamentos',
    'Si tienes una lesión, una enfermedad o condición de salud, estás en embarazo o tomas medicamentos, la app no calcula el plan exacto: se debe ajustar a mano según las recomendaciones de un profesional.',
  ],
  [
    'heart',
    'Escucha tu cuerpo',
    'Si sientes dolor en el pecho, mareo, falta de aire, dolor que no cede o algo fuera de lo normal, detente y busca atención médica.',
  ],
  [
    'shield',
    'Tu decisión',
    'Tú decides si haces cada sesión y cómo. Entreno y quienes lo hacen no responden por lesiones, problemas de salud o daños que resulten de usar la información de la app.',
  ],
  ['edit', 'Tus datos al día', 'Los cálculos dependen de que tus datos sean correctos. Si algo cambia (peso, pulso, salud, tiempo disponible), actualízalo.'],
]

/** Los puntos del aviso (se usan en la página, en la aceptación y al crear la cuenta). */
export function DisclaimerPoints() {
  return (
    <ul className="point-grid disclaimer-points">
      {POINTS.map(([icon, title, text], i) => (
        <li key={i}>
          <TitleIcon name={icon} tone={i % 2 ? 'sky' : undefined} />
          <p>
            <strong>{title}.</strong> {text}
          </p>
        </li>
      ))}
    </ul>
  )
}

/** Página pública con el aviso completo (se puede leer sin cuenta). */
export function DisclaimerPage() {
  const { t } = useTranslation()
  return (
    <Page title={t('disclaimer.title')}>
      <div className="privacy">
        <div className="help-hero">
          <span className="ai-orb" aria-hidden="true">
            <Icon name="shield" />
          </span>
          <div>
            <p className="help-ask">{t('disclaimer.lead')}</p>
            <p className="muted">{t('disclaimer.updated', { date: DISCLAIMER_DATE, v: DISCLAIMER_VERSION })}</p>
          </div>
        </div>
        <DisclaimerPoints />
        <p className="muted">
          <Link to="/privacidad" className="tap-link">
            {t('auth.privacyLink')}
          </Link>
        </p>
      </div>
    </Page>
  )
}

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

/** Al crear la cuenta con la casilla marcada: se guarda en cuanto haya sesión. */
export function markDisclaimerAccepted() {
  write(PENDING_KEY, DISCLAIMER_VERSION)
}

/**
 * Nadie entra a la app sin aceptar el aviso vigente. Las cuentas nuevas lo
 * aceptan al crearse (casilla obligatoria); las que entran con Google o las
 * que ya existían lo aceptan una vez en esta pantalla.
 */
export function DisclaimerGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const qc = useQueryClient()
  const consents = useConsents()
  const location = useLocation()
  const { signOut } = useAuth()
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [localOk, setLocalOk] = useState(() => read(LOCAL_KEY) === DISCLAIMER_VERSION)
  const tried = useRef(false)

  const onServer = consents.data?.some((c) => c.type === 'disclaimer' && c.version === DISCLAIMER_VERSION && !c.revokedAt) ?? false

  async function grant() {
    try {
      await repo.grantConsent('disclaimer', DISCLAIMER_VERSION)
      write(LOCAL_KEY, null)
      await qc.invalidateQueries({ queryKey: keys.consents })
    } catch (e) {
      // Si el servidor aún no lo admite, queda aceptado en este equipo y se reintenta luego
      console.error(e)
      write(LOCAL_KEY, DISCLAIMER_VERSION)
      setLocalOk(true)
    }
  }

  // Aceptado al crear la cuenta, o aceptado aquí sin guardar aún: se guarda solo
  useEffect(() => {
    if (!consents.isSuccess || onServer || tried.current) return
    const pending = read(PENDING_KEY) === DISCLAIMER_VERSION
    if (pending || localOk) {
      tried.current = true
      write(PENDING_KEY, null)
      if (pending) write(LOCAL_KEY, DISCLAIMER_VERSION)
      setLocalOk(true)
      void grant()
    }
  }, [consents.isSuccess, onServer, localOk])

  if (['/privacidad', '/aviso-legal'].includes(location.pathname)) return <>{children}</>
  if (consents.isLoading)
    return (
      <main className="main">
        <Spinner full />
      </main>
    )
  if (onServer || localOk || consents.isError) return <>{children}</>

  async function accept() {
    if (!checked) {
      setError(t('disclaimer.mustAccept'))
      return
    }
    setBusy(true)
    await grant()
    setBusy(false)
  }

  return (
    <main className="main disclaimer-gate" id="contenido">
      <h1>{t('disclaimer.title')}</h1>
      <p className="muted">{t('disclaimer.gateIntro')}</p>
      <section className="card">
        <DisclaimerPoints />
        <div className="field">
          <label className="choice">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                setChecked(e.target.checked)
                setError(null)
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'disc-error' : undefined}
            />
            {t('disclaimer.check')}
          </label>
          {error && (
            <span id="disc-error" className="error" role="alert">
              {error}
            </span>
          )}
        </div>
        <BusyButton type="button" className="btn btn-primary btn-block" busy={busy} busyLabel={t('common.loading')} onClick={() => void accept()}>
          {t('disclaimer.accept')}
        </BusyButton>
        <button type="button" className="btn-link" onClick={() => void signOut()}>
          {t('disclaimer.leave')}
        </button>
      </section>
    </main>
  )
}
