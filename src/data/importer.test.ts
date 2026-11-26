import { describe, expect, it } from 'vitest'
import { addDays, localDayKey } from '../core/dates'
import { demoCandidates, loadDemoData } from '../demo/seed'
import { fitnessOverview, loadsFor } from './analysis'
import { runImportJob, undoMerge } from './importer'
import { MemoryRepo } from './memoryRepo'

const NOW = new Date('2026-11-23T15:00:00Z')

describe('datos de prueba de punta a punta (importación + duplicados + forma)', async () => {
  const repo = new MemoryRepo()
  const { progress } = await loadDemoData(repo, { now: NOW })
  const activities = await repo.listActivities()

  it('importa el historial y fusiona el duplicado Strava + .FIT en una sola actividad', () => {
    expect(progress.failed).toBe(0)
    expect(progress.merged).toBe(1)
    expect(activities.length).toBe(progress.imported)
    const merged = activities.filter((a) => a.sources.length > 1)
    expect(merged).toHaveLength(1)
    const a = merged[0]
    expect(a.subSport).toBe('gravel') // modalidad de la exportación de Strava
    expect(a.title).toBe('Gravel por la Sabana con el parche')
    expect(a.sources.map((s) => s.format).sort()).toEqual(['fit', 'gpx'])
    expect(a.sources.find((s) => s.id === a.primarySourceId)!.format).toBe('fit')
  })

  it('volver a subir el mismo archivo no crea otra actividad', async () => {
    const items = demoCandidates(localDayKey(NOW))
    const again = await runImportJob(repo, 'files', items.map((c) => ({ name: c.name, candidate: c })), { total: items.length })
    expect(again.progress.imported).toBe(0)
    expect(again.progress.duplicates).toBe(again.progress.total)
    expect((await repo.listActivities()).length).toBe(activities.length)
  })

  it('calcula la carga con el método que permiten los datos e indica cuál', async () => {
    const loaded = loadsFor(await repo.listActivities(), {
      physiology: await repo.listPhysiology(),
      profile: await repo.getProfile(),
      health: [],
    })
    const byTitle = (t: string) => loaded.find((l) => l.activity.title === t)!.load
    expect(byTitle('Trote por la montaña (sin pulso)').method).toBe('rpe')
    expect(byTitle('Rodada sin datos de esfuerzo').method).toBe('none')
    expect(loaded.filter((l) => l.load.method === 'hr_tss').length).toBeGreaterThan(50)
    expect(loaded.some((l) => l.load.method === 'power_tss')).toBe(false) // sin potenciómetro

    const today = localDayKey(NOW)
    const f = fitnessOverview(loaded, today)
    expect(f.snapshot!.ctl).toBeGreaterThan(20)
    expect(f.snapshot!.warming).toBe(false)
    expect(f.missingRecent).toBe(1)
    // Unas 6 horas por semana
    const lastFull = f.weeks.at(-2)!
    expect(lastFull.load).toBeGreaterThan(150)
  })

  it('«No son la misma actividad» separa la fusión y queda registrado', async () => {
    const a = (await repo.listActivities()).find((x) => x.sources.length > 1)!
    const gpx = a.sources.find((s) => s.format === 'gpx')!
    const newId = await undoMerge(repo, a.id, gpx.id)
    const after = await repo.listActivities()
    expect(after.length).toBe(activities.length + 1)
    expect(after.find((x) => x.id === newId)!.sources).toHaveLength(1)
    expect(after.find((x) => x.id === a.id)!.sources).toHaveLength(1)
    const { merges } = (await repo.getActivity(a.id))!
    expect(merges[0].undoneAt).not.toBeNull()
    expect((await repo.listNotDuplicatePairs()).size).toBe(1)
  })

  it('crea las metas, la pausa y se borra todo con «Borrar datos de prueba»', async () => {
    const goals = await repo.listGoals()
    expect(goals.map((g) => g.name)).toEqual(['Gravel de la Sabana', 'Vuelta de 3 días'])
    expect(goals[0].eventDate).toBe(addDays('2026-11-23', 84))
    expect(goals[1].stages.map((s) => [s.distanceM, s.elevationGainM])).toEqual([[95_000, 1800], [140_000, 2600], [80_000, 1200]])
    const [pause] = await repo.listPauses()
    expect(pause).toMatchObject({ kind: 'travel', available: ['gym'] })
    expect(pause.startsOn).toBe(addDays('2026-11-23', 42))

    await repo.clearDemoData()
    expect(await repo.listActivities()).toHaveLength(0)
    expect(await repo.listGoals()).toHaveLength(0)
    expect(await repo.listPauses()).toHaveLength(0)
  })
})
