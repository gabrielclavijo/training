import { useQueryClient } from '@tanstack/react-query'
import { BusyButton } from '../../components/ui/Busy'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '../../components/ui/Page'
import { formatDateTime } from '../../core/dates'
import { useRepo } from '../../data/RepoProvider'
import { processStravaInbox } from '../../data/stravaInbox'
import type { Connection } from '../../data/types'
import { useAuth } from '../auth/AuthProvider'
import { ConnectWithStrava, PoweredByStrava } from './Brand'
import { startStravaConnect, stravaAvailable } from './strava'

/** Estado de la conexión con Strava y sus acciones. */
export function StravaConnection({ connection }: { connection: Connection | undefined }) {
  const { t } = useTranslation()
  const { mode } = useAuth()
  const repo = useRepo()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<'sync' | 'disconnect' | null>(null)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  if (!stravaAvailable() || mode !== 'supabase') return <p className="muted">{t('strava.notConfigured')}</p>
  const connected = connection && (connection.status === 'active' || connection.status === 'error')

  async function sync() {
    setBusy('sync')
    setMsg(null)
    try {
      await repo.stravaSync().catch(() => undefined)
      const r = await processStravaInbox(repo)
      await qc.invalidateQueries()
      setMsg({ kind: 'success', text: t('strava.syncDone', { count: r.created + r.merged }) })
    } catch {
      setMsg({ kind: 'error', text: t('errors.generic') })
    } finally {
      setBusy(null)
    }
  }
  async function disconnect() {
    if (!window.confirm(t('strava.disconnectConfirm'))) return
    setBusy('disconnect')
    try {
      await repo.stravaDisconnect()
      await qc.invalidateQueries()
      setMsg({ kind: 'success', text: t('strava.disconnected') })
    } catch {
      setMsg({ kind: 'error', text: t('errors.generic') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      <div aria-live="polite">{msg && <Alert kind={msg.kind}>{msg.text}</Alert>}</div>
      {connected ? (
        <>
          <p>✓ {t('strava.statusConnected')}</p>
          {connection?.lastSyncAt && <p className="muted">{t('strava.lastSync', { date: formatDateTime(connection.lastSyncAt) })}</p>}
          {connection?.lastError && <Alert kind="warning">{t(`strava.errors.${connection.lastError}`, { defaultValue: connection.lastError })}</Alert>}
          <div className="row">
            <BusyButton
              type="button"
              className="btn btn-secondary"
              onClick={sync}
              busy={busy === 'sync'}
              busyLabel={t('strava.syncing')}
              disabled={busy !== null}
            >
              {t('strava.syncNow')}
            </BusyButton>
            <button type="button" className="btn btn-secondary" onClick={startStravaConnect} disabled={busy !== null}>
              {t('strava.reconnect')}
            </button>
            <button type="button" className="btn-link" onClick={disconnect} disabled={busy !== null} aria-busy={busy === 'disconnect' || undefined}>
              {t('strava.disconnect')}
            </button>
          </div>
        </>
      ) : (
        <ConnectWithStrava onClick={startStravaConnect} />
      )}
      <p className="muted">{t('strava.rules')}</p>
      <PoweredByStrava />
    </div>
  )
}
