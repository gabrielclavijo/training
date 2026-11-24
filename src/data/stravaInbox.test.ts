import { describe, expect, it } from 'vitest'
import { encodeFit, simulate } from '../demo/files'
import { parseActivityFile } from '../core/parsers'
import { importOne } from './importer'
import { MemoryRepo } from './memoryRepo'
import { processStravaInbox } from './stravaInbox'

const start = new Date('2026-11-21T11:00:00Z')
const ride = simulate({ durationS: 7200, distanceM: 50_000, elevationGainM: 700, hrBase: 140, seed: 3 })

function stravaPayload(id: number, startIso: string, opts: { name?: string; sportType?: string } = {}) {
  return {
    activity: {
      id,
      name: opts.name ?? 'Rodada de la mañana',
      sport_type: opts.sportType ?? 'GravelRide',
      start_date: startIso,
      timezone: '(GMT-05:00) America/Bogota',
      elapsed_time: 7200,
      moving_time: 7100,
      distance: 50_100,
      total_elevation_gain: 690,
      average_heartrate: 140.4,
      max_heartrate: 168,
    },
    streams: {
      time: { data: ride.map((s) => s.t) },
      heartrate: { data: ride.map((s) => s.hr) },
      distance: { data: ride.map((s) => s.dist) },
    },
  }
}

describe('actividades que llegan solas desde Strava (bandeja del webhook)', () => {
  it('se fusionan con el archivo del reloj, quedan como caché de 7 días y se borran si Strava avisa', async () => {
    const repo = new MemoryRepo()
    const fit = parseActivityFile({ name: 'a.fit', bytes: encodeFit(ride, start, { sport: 'cycling' }) })
    await importOne(repo, { name: 'a.fit', parsed: fit, sha256: 'x' }, { jobId: null })

    const received = '2026-11-21T14:00:00Z'
    repo.pushInbox({ provider: 'strava', externalId: '111', event: 'create', payload: stravaPayload(111, start.toISOString()), receivedAt: received })
    const r = await processStravaInbox(repo)
    expect(r).toMatchObject({ created: 0, merged: 1, failed: 0 })
    const [a] = await repo.listActivities()
    expect(a.sources).toHaveLength(2)
    const strava = a.sources.find((s) => s.provider === 'strava')!
    expect(strava.retentionClass).toBe('strava_cache')
    expect(strava.streamsExpireAt).toBe('2026-11-28T14:00:00.000Z')
    expect(strava.streamsPath).toBeNull() // no se guardan series de Strava
    expect(a.sources.find((s) => s.id === a.primarySourceId)!.provider).toBe('file') // manda lo propio
    expect(a.subSport).toBe('gravel')
    expect(await repo.listInbox()).toHaveLength(0) // la bandeja se vacía

    repo.pushInbox({ provider: 'strava', externalId: '111', event: 'delete', payload: null })
    await processStravaInbox(repo)
    const [after] = await repo.listActivities()
    expect(after.sources.map((s) => s.provider)).toEqual(['file'])
  })

  it('una actividad solo de Strava se crea, se actualiza y se borra', async () => {
    const repo = new MemoryRepo()
    repo.pushInbox({ provider: 'strava', externalId: '222', event: 'create', payload: stravaPayload(222, '2026-11-22T11:00:00Z', { sportType: 'Run', name: 'Trote' }) })
    expect((await processStravaInbox(repo)).created).toBe(1)
    let [a] = await repo.listActivities()
    expect(a.sport).toBe('running')
    expect(a.title).toBe('Trote')

    repo.pushInbox({ provider: 'strava', externalId: '222', event: 'update', payload: stravaPayload(222, '2026-11-22T11:00:00Z', { sportType: 'Run', name: 'Trote suave' }) })
    await processStravaInbox(repo)
    const list = await repo.listActivities()
    expect(list).toHaveLength(1)
    ;[a] = list
    expect(a.title).toBe('Trote suave')

    repo.pushInbox({ provider: 'strava', externalId: '222', event: 'delete', payload: null })
    await processStravaInbox(repo)
    expect(await repo.listActivities()).toHaveLength(0)
  })
})
