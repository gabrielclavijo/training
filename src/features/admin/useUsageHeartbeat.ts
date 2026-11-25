import { useEffect } from 'react'
import { useRepo } from '../../data/RepoProvider'

const TICK_MS = 60_000
const NEW_VISIT_AFTER_MS = 30 * 60_000

/**
 * Señal de uso: cada minuto, solo con la app a la vista, suma el tiempo real
 * transcurrido (el servidor lo limita a 60 s por señal). Cuenta una visita nueva
 * al abrir la app o al volver después de 30 minutos.
 */
export function useUsageHeartbeat() {
  const repo = useRepo()
  useEffect(() => {
    let last = Date.now()
    let hiddenAt: number | null = null
    const send = (seconds: number, newVisit: boolean) => void repo.trackUsage(seconds, newVisit).catch(() => undefined)
    send(0, true)
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      send(Math.min(60, (now - last) / 1000), false)
      last = now
    }, TICK_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0
      last = Date.now()
      if (away >= NEW_VISIT_AFTER_MS) send(0, true)
      hiddenAt = null
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [repo])
}
