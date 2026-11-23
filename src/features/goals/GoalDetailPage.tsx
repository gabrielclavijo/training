import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui/EmptyState'
import { Alert, Page, Spinner } from '../../components/ui/Page'
import { addDays, daysBetween, formatDate, localDayKey } from '../../core/dates'
import { formatClock, formatDistance, formatElevation } from '../../core/units'
import { useRepo } from '../../data/RepoProvider'
import { goalEstimatedHours, goalTotals } from './goalUtils'

export function GoalDetailPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const repo = useRepo()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['goal', id], queryFn: () => repo.getGoal(id) })

  if (q.isLoading) return <Page title={t('goals.title')}><Spinner /></Page>
  if (q.error) return <Page title={t('goals.title')}><Alert kind="error">{t('errors.generic')}</Alert></Page>
  const g = q.data
  if (!g) {
    return (
      <Page title={t('errors.notFoundTitle')}>
        <EmptyState title={t('goals.notFound')} body={t('errors.notFoundBody')} actionLabel={t('goals.title')} actionTo="/metas" />
      </Page>
    )
  }
  const today = localDayKey(new Date())
  const days = daysBetween(today, g.eventDate)
  const tot = goalTotals(g)
  const est = goalEstimatedHours(g)

  async function remove() {
    if (!window.confirm(t('goals.deleteConfirm'))) return
    await repo.deleteGoal(g!.id)
    await qc.invalidateQueries()
    navigate('/metas')
  }

  return (
    <Page title={g.name}>
      <p className="muted">
        {t(`sports.${g.sport}`)}
        {g.subSport && ` · ${t(`subSports.${g.subSport}`)}`} · {g.priority === 'primary' ? `★ ${t('goals.primary')}` : t('goals.secondary')}
      </p>
      <section className="card">
        <dl className="stat-grid">
          <div>
            <dt>{g.goalType === 'stage' ? t('goals.dateFirstStage') : t('goals.date')}</dt>
            <dd>{formatDate(`${g.eventDate}T12:00:00Z`)}</dd>
          </div>
          <div>
            <dt>&nbsp;</dt>
            <dd>{days >= 0 ? t('goals.inDays', { count: days }) : t('goals.past')}</dd>
          </div>
          {tot.distanceM > 0 && (
            <div>
              <dt>{t('activities.distance')}</dt>
              <dd>{formatDistance(tot.distanceM)}</dd>
            </div>
          )}
          {tot.elevationGainM > 0 && (
            <div>
              <dt>{t('activities.elevation')}</dt>
              <dd>{formatElevation(tot.elevationGainM)}</dd>
            </div>
          )}
          {g.terrain && (
            <div>
              <dt>{t('goals.terrain')}</dt>
              <dd>{t(`terrain.${g.terrain}`)}</dd>
            </div>
          )}
          {g.maxAltitudeM && (
            <div>
              <dt>{t('goals.maxAltitude')}</dt>
              <dd>{formatElevation(g.maxAltitudeM)}</dd>
            </div>
          )}
          <div>
            <dt>{t('goals.objective')}</dt>
            <dd>{g.objective === 'time' && g.targetTimeS ? t('goals.targetTime', { time: formatClock(g.targetTimeS) }) : t('goals.finishOnly')}</dd>
          </div>
        </dl>
        <p className="muted" style={{ marginTop: 'var(--space-3)' }}>
          {t('goals.estimated', { time: formatClock(est * 3600) })}. {t('goals.estimatedHelp')}
        </p>
      </section>

      {g.goalType === 'stage' && (
        <section className="card" aria-labelledby="stages-h">
          <h2 id="stages-h">{t('goals.stages')}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('goals.stages')}</th>
                  <th scope="col">{t('goals.date')}</th>
                  <th scope="col">{t('activities.distance')}</th>
                  <th scope="col">{t('activities.elevation')}</th>
                  <th scope="col">{t('goals.terrain')}</th>
                  {g.objective === 'time' && <th scope="col">{t('goals.objective')}</th>}
                </tr>
              </thead>
              <tbody>
                {g.stages.map((s) => (
                  <tr key={s.stageNumber}>
                    <th scope="row">{t('goals.stageN', { n: s.stageNumber })}</th>
                    <td>{formatDate(`${addDays(g.eventDate, s.dayOffset)}T12:00:00Z`)}</td>
                    <td>{formatDistance(s.distanceM)}</td>
                    <td>{formatElevation(s.elevationGainM)}</td>
                    <td>{s.terrain ? t(`terrain.${s.terrain}`) : '—'}</td>
                    {g.objective === 'time' && <td>{s.targetTimeS ? formatClock(s.targetTimeS) : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {g.notes && (
        <section className="card">
          <h2>{t('goals.notes')}</h2>
          <p>{g.notes}</p>
        </section>
      )}

      <Alert kind="info">{t('goals.diagnosisSoon')}</Alert>

      <div className="row">
        <Link className="btn btn-primary" to={`/metas/${g.id}/editar`}>
          {t('goals.edit')}
        </Link>
        <Link className="btn btn-secondary" to="/temporada">
          {t('season.title')}
        </Link>
        <button type="button" className="btn btn-danger" onClick={() => void remove()}>
          {t('goals.delete')}
        </button>
      </div>
    </Page>
  )
}
