import { TitleIcon, type IconName } from '../../components/ui/Icon'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { formatDateTime } from '../../core/dates'
import { useConnections, useJobs } from '../../data/hooks'
import { useRepo } from '../../data/RepoProvider'
import type { ImportJob } from '../../data/types'
import { PROVIDERS } from '../../providers'
import { StravaConnection } from '../strava/StravaConnection'

const PROVIDER_ICON: Record<string, [IconName, 'coral' | 'sky' | 'soft' | undefined]> = {
  file: ['upload', undefined],
  manual: ['dumbbell', 'soft'],
  strava: ['route', 'coral'],
  garmin_api: ['activity', 'sky'],
}

export function ImportPage() {
  const { t } = useTranslation()
  const connections = useConnections()
  const jobs = useJobs()

  return (
    <Page title={t('import.title')}>
      <section className="card" aria-labelledby="conn-h">
        <h2 id="conn-h" className="card-title-icon">
          <TitleIcon name="route" tone="coral" />
          {t('import.connections')}
        </h2>
        {connections.isLoading && <Spinner />}
        {connections.error && <Alert kind="error">{t('errors.generic')}</Alert>}
        <ul className="plain-list">
          {PROVIDERS.map((p) => {
            const c = connections.data?.find((x) => x.provider === p.id)
            const status = c?.status ?? (p.enabled ? 'active' : 'not_available')
            return (
              <li key={p.id} className="conn">
                <div className="row-between">
                  <span className="conn-name">
                    <TitleIcon name={PROVIDER_ICON[p.id][0]} tone={PROVIDER_ICON[p.id][1]} />
                    <strong>{t(`import.providers.${p.id}`)}</strong>
                  </span>
                  <span className={`badge badge-status-${status}`}>
                    <span aria-hidden="true">{status === 'active' ? '✓ ' : status === 'error' ? '⚠ ' : '– '}</span>
                    {t(`import.status.${status}`)}
                  </span>
                </div>
                {p.id === 'strava' && p.enabled ? <StravaConnection connection={c} /> : <p className="muted">{t(`import.providerHelp.${p.id}`)}</p>}
                {p.id === 'file' && <p className="muted">{c?.lastSyncAt ? t('import.lastSync', { date: formatDateTime(c.lastSyncAt) }) : t('import.never')}</p>}
                {c?.lastError && <Alert kind="error">{c.lastError}</Alert>}
              </li>
            )
          })}
        </ul>
        <div className="row">
          <Link className="btn btn-primary" to="/subir">
            {t('import.upload')}
          </Link>
          <Link className="btn btn-secondary" to="/ayuda?tema=strava">
            {t('nav.guides')}
          </Link>
        </div>
      </section>

      <section className="card" aria-labelledby="hist-h">
        <h2 id="hist-h" className="card-title-icon">
          <TitleIcon name="clock" tone="soft" />
          {t('import.history')}
        </h2>
        {jobs.data && jobs.data.length === 0 && <p className="muted">{t('import.noHistory')}</p>}
        <ul className="plain-list">
          {(jobs.data ?? []).map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </ul>
      </section>
    </Page>
  )
}

function JobRow({ job }: { job: ImportJob }) {
  const { t } = useTranslation()
  const repo = useRepo()
  const [open, setOpen] = useState(false)
  const items = useQuery({ queryKey: ['jobItems', job.id], queryFn: () => repo.listJobItems(job.id), enabled: open })
  const errors = (items.data ?? []).filter((i) => i.status === 'error')
  return (
    <li>
      <strong>{t(`import.jobKind.${job.kind}`)}</strong> · {formatDateTime(job.startedAt)} · {t(`import.jobStatus.${job.status}`)}
      <br />
      <span className="muted">{t('upload.summary', { ...job })}</span>
      <div>
        <button type="button" className="btn-link" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t('import.hideDetails') : t('import.viewDetails')}
        </button>
      </div>
      {open && (
        <ul className="plain-list compact">
          {items.isLoading && (
            <li>
              <Spinner />
            </li>
          )}
          {(errors.length ? errors : (items.data ?? []).slice(0, 50)).map((i) => (
            <li key={i.id}>
              <span className="filename">{i.filename}</span> — {t(`upload.status.${i.status}`)}
              {i.errorCode && `: ${t(`upload.errors.${i.errorCode}`, { defaultValue: t('upload.errors.corrupt') })}`}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
