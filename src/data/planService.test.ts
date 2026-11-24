import { describe, expect, it, vi } from 'vitest'
import { addDays, localDayKey, weekStart } from '../core/dates'
import { loadDemoData } from '../demo/seed'
import { MemoryRepo } from './memoryRepo'
import { diagnoseGoals, loadContext, refreshPlan, sessionMatches } from './planService'

const NOW = new Date('2026-11-23T15:00:00Z')

describe('plan con los datos de prueba (de punta a punta)', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  const repo = new MemoryRepo()
  await loadDemoData(repo, { now: NOW })
  const today = localDayKey(NOW)

  it('al cargar los datos de prueba se crea el plan hasta la Vuelta', async () => {
    const plan = await repo.getCurrentPlan()
    expect(plan.plan?.reason).toBe('initial')
    expect(plan.sessions.length).toBeGreaterThan(50)
    const goals = await repo.listGoals()
    const vuelta = goals.find((g) => g.name === 'Vuelta de 3 días')!
    expect(plan.sessions.filter((s) => s.kind === 'event' && s.goalId === vuelta.id)).toHaveLength(3)
  })

  it('la pausa de la semana 7 deja solo gimnasio de hotel', async () => {
    const plan = await repo.getCurrentPlan()
    const [pause] = await repo.listPauses()
    const trip = plan.sessions.filter((s) => s.date >= pause.startsOn && s.date <= pause.endsOn!)
    expect(trip.length).toBeGreaterThan(0)
    expect(trip.every((s) => s.sport === 'strength' && s.note === 'hotel_gym')).toBe(true)
  })

  it('si nada cambió, no se guarda otra versión', async () => {
    const before = (await repo.getCurrentPlan()).plan!.id
    const r = await refreshPlan(repo)
    expect(r.changed).toBe(false)
    expect((await repo.getCurrentPlan()).plan!.id).toBe(before)
  })

  it('una lesión nueva reajusta toda la temporada y queda explicada', async () => {
    const start = addDays(weekStart(today), 14)
    await repo.savePause({ kind: 'injury', startsOn: start, endsOn: addDays(start, 9), canTrain: false, available: ['none'], minutesPerDay: 0, notes: null })
    const r = await refreshPlan(repo)
    expect(r.changed).toBe(true)
    expect(r.plan.plan!.reason).toBe('pause')
    const during = r.plan.sessions.filter((s) => s.date >= start && s.date <= addDays(start, 9))
    expect(during).toHaveLength(0)
    expect(r.plan.weeks.some((w) => w.notes.includes('return_gradual'))).toBe(true)
    const changes = await repo.listPlanChanges()
    expect(changes[0].reason).toBe('pause')
  })

  it('diagnóstico de las dos metas, con tiempo estimado para la Vuelta', async () => {
    const ctx = await loadContext(repo)
    const d = diagnoseGoals(ctx)
    expect(d).toHaveLength(2)
    for (const x of d) expect(['on_track', 'tight', 'behind']).toContain(x.diagnosis.status)
    const vuelta = d[1]
    expect(vuelta.targetTimeS).toBe(15 * 3600)
    expect(vuelta.estimate).not.toBeNull()
    expect(vuelta.estimate!.seconds).toBeGreaterThan(8 * 3600)
  })

  it('planeado vs. hecho: las sesiones pasadas sin actividad quedan como no hechas', async () => {
    const ctx = await loadContext(repo)
    const plan = await repo.getCurrentPlan()
    const m = sessionMatches(plan, ctx.loaded, addDays(today, 10))
    const past = plan.sessions.filter((s) => s.date < addDays(today, 10) && s.date >= today && s.kind !== 'rest')
    expect(past.length).toBeGreaterThan(0)
    expect(past.every((s) => m.get(s.id)!.status === 'missed')).toBe(true)
  })

  it('al borrar los datos de prueba el plan se rehace sin esas metas', async () => {
    await repo.clearDemoData()
    const r = await refreshPlan(repo)
    expect(r.changed).toBe(true)
    expect(r.plan.sessions.filter((s) => s.goalId)).toHaveLength(0)
    expect(r.plan.weeks.every((w) => w.goalId === null)).toBe(true)
  })
})
