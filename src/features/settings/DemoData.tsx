import { useQueryClient } from '@tanstack/react-query'
import { BusyButton } from '../../components/ui/Busy'
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
  const [which, setWhich] = useState<'load' | 'clear' | null>(null)
  const [progress, setProgress] = useState({ processed: 0, total: 0 })

  async function load() {
    setWhich('load')
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
    setWhich('clear')
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
        <BusyButton
          type="button"
          className="btn btn-secondary"
          onClick={load}
          busy={state === 'loading' && which === 'load'}
          busyLabel={t('common.loading')}
          disabled={state === 'loading'}
        >
          {t('settingsExtra.demoLoad')}
        </BusyButton>
        {withClear && (
          <BusyButton
            type="button"
            className="btn btn-secondary"
            onClick={clear}
            busy={state === 'loading' && which === 'clear'}
            busyLabel={t('common.deleting')}
            disabled={state === 'loading'}
          >
            {t('settingsExtra.demoClear')}
          </BusyButton>
        )}
      </div>
    </div>
  )
}
