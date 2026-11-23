import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '../../components/ui/Page'
import { useRepo } from '../../data/RepoProvider'

/** Botón «Cargar datos de prueba» (usa el mismo flujo de importación real). */
export function DemoDataButton({ withClear = false }: { withClear?: boolean }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const qc = useQueryClient()
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'cleared' | 'error'>('idle')
  const [progress, setProgress] = useState({ processed: 0, total: 0 })

  async function load() {
    setState('loading')
    try {
      // Se carga aparte para no sumar el generador al paquete principal
      const { loadDemoData } = await import('../../demo/seed')
      await loadDemoData(repo, { onProgress: (p) => setProgress({ processed: p.processed, total: p.total }) })
      await qc.invalidateQueries()
      setState('loaded')
    } catch (e) {
      console.error(e)
      setState('error')
    }
  }
  async function clear() {
    setState('loading')
    try {
      await repo.clearDemoData()
      await qc.invalidateQueries()
      setState('cleared')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      <div aria-live="polite">
        {state === 'loading' && progress.total > 0 && <p>{t('settingsExtra.demoLoading', progress)}</p>}
        {state === 'loaded' && <Alert kind="success">{t('settingsExtra.demoLoaded')}</Alert>}
        {state === 'cleared' && <Alert kind="success">{t('settingsExtra.demoCleared')}</Alert>}
        {state === 'error' && <Alert kind="error">{t('errors.generic')}</Alert>}
      </div>
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={load} disabled={state === 'loading'}>
          {t('settingsExtra.demoLoad')}
        </button>
        {withClear && (
          <button type="button" className="btn btn-secondary" onClick={clear} disabled={state === 'loading'}>
            {t('settingsExtra.demoClear')}
          </button>
        )}
      </div>
    </div>
  )
}
