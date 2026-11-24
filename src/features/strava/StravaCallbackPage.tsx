import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { useRepo } from '../../data/RepoProvider'
import { processStravaInbox } from '../../data/stravaInbox'
import { checkStravaState } from './strava'

/** Regreso desde Strava tras autorizar: termina la conexión en el servidor. */
export function StravaCallbackPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const repo = useRepo()
  const qc = useQueryClient()
  const [state, setState] = useState<'working' | 'ok' | 'denied' | 'scope' | 'error' | 'in_use'>('working')
  const [count, setCount] = useState(0)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    void (async () => {
      if (params.get('error')) return setState('denied')
      const code = params.get('code')
      const scope = params.get('scope') ?? ''
      if (!code || !checkStravaState(params.get('state'))) return setState('error')
      if (!scope.includes('activity:read')) return setState('scope')
      try {
        await repo.stravaConnect(code, scope)
        const r = await processStravaInbox(repo)
        setCount(r.created + r.merged)
        await qc.invalidateQueries()
        setState('ok')
      } catch (e) {
        setState(String(e).includes('athlete_in_use') ? 'in_use' : 'error')
      }
    })()
  }, [params, repo, qc])

  return (
    <Page title={t('strava.title')}>
      <div aria-live="polite">
        {state === 'working' && <Spinner label={t('strava.connecting')} />}
        {state === 'ok' && <Alert kind="success">{t('strava.connected', { count })}</Alert>}
        {state === 'denied' && <Alert kind="warning">{t('strava.denied')}</Alert>}
        {state === 'scope' && <Alert kind="warning">{t('strava.scopeMissing')}</Alert>}
        {state === 'in_use' && <Alert kind="error">{t('strava.inUse')}</Alert>}
        {state === 'error' && <Alert kind="error">{t('strava.error')}</Alert>}
      </div>
      {state !== 'working' && (
        <Link className="btn btn-primary" to="/importacion">
          {t('strava.backToConnections')}
        </Link>
      )}
    </Page>
  )
}
