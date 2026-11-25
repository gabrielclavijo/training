import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/fx/Toast'
import { useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Icon, TitleIcon } from '../../components/ui/Icon'
import { Alert, Page } from '../../components/ui/Page'
import { runImportJob, type ImportProgress, type ImportQueueItem } from '../../data/importer'
import { useRepo } from '../../data/RepoProvider'
import type { ImportItemStatus, ImportKind } from '../../data/types'
import type { WorkerIn, WorkerOut } from '../../workers/import.worker'

type QueueItem = ImportQueueItem
interface Row {
  name: string
  status: ImportItemStatus
  errorCode?: string
}

/** Cola asíncrona: el worker la llena y la importación la va vaciando. */
function createQueue() {
  const items: QueueItem[] = []
  let done = false
  let wake: (() => void) | null = null
  return {
    push(i: QueueItem) {
      items.push(i)
      wake?.()
    },
    close() {
      done = true
      wake?.()
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (items.length) yield items.shift()!
        else if (done) return
        else await new Promise<void>((r) => (wake = r))
      }
    },
  }
}

function kindFor(files: File[]): ImportKind {
  const zip = files.find((f) => /\.zip$/i.test(f.name))
  if (!zip) return 'files'
  if (/strava|export_\d+/i.test(zip.name)) return 'strava_archive'
  if (/garmin|^[0-9a-f-]{20,}\.zip$/i.test(zip.name)) return 'garmin_archive'
  return 'files'
}

export function UploadPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const repo = useRepo()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'cancelled' | 'error'>('idle')
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [bigFile, setBigFile] = useState(false)

  async function start(files: File[]) {
    setBigFile(files.some((f) => f.size > 200 * 1024 * 1024))
    // Mantener la pantalla encendida mientras importa (si el navegador lo permite)
    let wakeLock: { release: () => Promise<void> } | null = null
    try {
      wakeLock =
        (await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen')) ??
        null
    } catch {
      wakeLock = null
    }
    if (files.length === 0 || phase === 'running') return
    setPhase('running')
    setRows([])
    setProgress({ total: 0, processed: 0, imported: 0, merged: 0, duplicates: 0, failed: 0, skipped: 0 })
    const queue = createQueue()
    let discovered = 0
    const worker = new Worker(new URL('../../workers/import.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data
      if (m.type === 'discovered') {
        discovered += m.add
        setProgress((p) => (p ? { ...p, total: Math.max(discovered, p.processed) } : p))
      } else if (m.type === 'item') {
        if (m.ok) queue.push({ name: m.name, candidate: { name: m.name, parsed: m.parsed, sha256: m.sha256 } })
        else queue.push({ name: m.name, errorCode: m.code, skipped: m.skipped })
      } else queue.close()
    }
    let workerFailed = false
    worker.onerror = (e) => {
      console.error('Error en el lector de archivos', e)
      workerFailed = true
      queue.close()
    }
    const abort = new AbortController()
    abortRef.current = abort
    // «Detener»: corta el lector aunque esté esperando el siguiente archivo
    abort.signal.addEventListener('abort', () => {
      worker.terminate()
      queue.close()
    })
    // Entregar los archivos al lector en segundo plano
    worker.postMessage({ files } satisfies WorkerIn)

    try {
      // Envolvemos la cola para registrar el resultado de cada archivo
      const seen: Row[] = []
      const tracked = {
        async *[Symbol.asyncIterator]() {
          for await (const it of queue) yield it
        },
      }
      let lastProcessed = 0
      const result = await runImportJob(repo, kindFor(files), tracked, {
        total: 0,
        signal: abort.signal,
        onProgress: (p) => {
          setProgress({ ...p, total: Math.max(discovered, p.total) })
          lastProcessed = p.processed
        },
      })
      void lastProcessed
      const items = await repo.listJobItems(result.jobId)
      for (const i of items) seen.push({ name: i.filename, status: i.status, errorCode: i.errorCode ?? undefined })
      setRows(seen)
      setProgress({ ...result.progress, total: result.progress.processed })
      setPhase(workerFailed ? 'error' : abort.signal.aborted ? 'cancelled' : 'done')
      if (!workerFailed && !abort.signal.aborted && result.progress.imported + result.progress.merged > 0)
        toast(t('toast.uploaded', { count: result.progress.imported + result.progress.merged }), { icon: 'upload' })
    } catch (e) {
      console.error(e)
      setPhase('error')
    } finally {
      void wakeLock?.release().catch(() => undefined)
      worker.terminate()
      await qc.invalidateQueries()
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void start([...e.dataTransfer.files])
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0

  return (
    <Page title={t('upload.title')}>
      <p>{t('upload.intro')}</p>

      <div
        className={`dropzone${dragging ? ' dropzone-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Icon name="upload" />
        <p className="dropzone-title">{t('upload.drop')}</p>
        <p className="muted">{t('upload.or')}</p>
        <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={phase === 'running'}>
          {t('upload.choose')}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void start([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        <p className="hint muted">{t('upload.accepted')}</p>
        <p className="hint muted">{t('upload.bigZipTip')}</p>
      </div>

      <div aria-live="polite" className="stack" style={{ marginTop: 'var(--space-4)' }}>
        {phase === 'running' && progress && (
          <div className="card">
            <p>
              <strong>
                {progress.total > 0
                  ? t('upload.progress', { processed: progress.processed.toLocaleString('es-CO'), total: progress.total.toLocaleString('es-CO') })
                  : t('upload.reading')}
              </strong>
            </p>
            <progress className="progress" max={100} value={pct} aria-label={`${pct} %`} />
            <p className="muted">{t('upload.summary', { ...progress })}</p>
            {bigFile && <p className="muted">{t('upload.bigFileTip')}</p>}
            <button type="button" className="btn btn-secondary" onClick={() => abortRef.current?.abort()}>
              {t('upload.cancel')}
            </button>
          </div>
        )}
        {(phase === 'done' || phase === 'cancelled') && progress && (
          <Alert kind={progress.failed > 0 ? 'warning' : 'success'}>
            <strong>{phase === 'cancelled' ? t('upload.cancelled') : t('upload.done')}</strong>
            <br />
            {t('upload.summary', { ...progress })}
            {(progress.skipped ?? 0) > 0 && (
              <>
                <br />
                {t('upload.skippedSummary', { count: progress.skipped })}
              </>
            )}
          </Alert>
        )}
        {phase === 'error' && <Alert kind="error">{t('errors.generic')}</Alert>}
      </div>

      {rows.length > 0 && <ResultList rows={rows} />}

      <div className="stack" style={{ marginTop: 'var(--space-4)', gap: 'var(--space-2)' }}>
        {phase === 'done' && (
          <Link className="btn btn-primary" to="/actividades">
            {t('upload.seeActivities')}
          </Link>
        )}
        <Link to="/actividades/nueva">{t('upload.manualLink')}</Link>
        <Link to="/ayuda?tema=subir">{t('upload.guideLink')}</Link>
      </div>
    </Page>
  )
}

function ResultList({ rows }: { rows: Row[] }) {
  const { t } = useTranslation()
  // Primero los errores (lo que requiere acción), luego el resto
  const sorted = [...rows].sort((a, b) => Number(b.status === 'error') - Number(a.status === 'error'))
  const visible = sorted.slice(0, 200)
  return (
    <section className="card" aria-labelledby="results-h">
      <h2 id="results-h" className="card-title-icon">
        <TitleIcon name="check" />
        {t('upload.results')}
      </h2>
      <ul className="plain-list">
        {visible.map((r, i) => (
          <li key={r.name + i}>
            <span className={`status-dot status-${r.status}`} aria-hidden="true" />
            <strong className="filename">{r.name}</strong>
            <br />
            <span className={r.status === 'error' ? 'error' : 'muted'}>
              {t(`upload.status.${r.status}`)}
              {r.status === 'error' && r.errorCode && `: ${t(`upload.errors.${r.errorCode}`, { defaultValue: t('upload.errors.corrupt') })}`}
            </span>
          </li>
        ))}
      </ul>
      {sorted.length > visible.length && <p className="muted">+{sorted.length - visible.length}</p>}
    </section>
  )
}
