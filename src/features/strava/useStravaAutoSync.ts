import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useConnections } from '../../data/hooks'
import { useRepo } from '../../data/RepoProvider'
import { processStravaInbox } from '../../data/stravaInbox'
import { stravaAvailable } from './strava'

const MIN_GAP_MS = 15 * 60 * 1000
let lastRun = 0

/**
 * Al abrir la app (y al volver a ella): pide al servidor una sincronización de
 * respaldo (como máximo una por hora) y procesa lo que dejó el webhook.
 */
export function useStravaAutoSync() {
  const { mode } = useAuth()
  const repo = useRepo()
  const qc = useQueryClient()
  const conns = useConnections()
  const connected = conns.data?.some((c) => c.provider === 'strava' && (c.status === 'active' || c.status === 'error'))

  useEffect(() => {
    if (mode !== 'supabase' || !stravaAvailable() || !connected) return
    const run = async () => {
      if (Date.now() - lastRun < MIN_GAP_MS) return
      lastRun = Date.now()
      try {
        await repo.stravaSync().catch(() => undefined)
        const r = await processStravaInbox(repo)
        if (r.created + r.merged + r.deleted > 0) await qc.invalidateQueries()
      } catch (e) {
        console.error('Sincronización con Strava', e)
      }
    }
    void run()
    const onVisible = () => document.visibilityState === 'visible' && void run()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [mode, connected, repo, qc])
}
