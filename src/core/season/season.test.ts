import { describe, expect, it } from 'vitest'
import { addDays } from '../dates'
import { buildSeason, estimateHours, recoveryDays, type SeasonGoal } from '.'

const today = '2026-11-23'
const gravel: SeasonGoal = {
  id: 'gravel',
  name: 'Gravel de la Sabana',
  eventDate: addDays(today, 84), // 12 semanas
  priority: 'secondary',
  goalType: 'single',
  stageDays: 1,
  estimatedHours: estimateHours('cycling', 120_000, 2200, 'unpaved'),
}
const vuelta: SeasonGoal = {
  id: 'vuelta',
  name: 'Vuelta de 3 días',
  eventDate: addDays(today, 168), // 24 semanas
  priority: 'primary',
  goalType: 'stage',
  stageDays: 3,
  estimatedHours: 15,
}

describe('temporada', () => {
  it('caso de prueba: gravel a 12 semanas y vuelta a 24 semanas encadenan sin avisos', () => {
    const { blocks, warnings } = buildSeason([vuelta, gravel], today)
    expect(warnings).toEqual([])
    const kinds = blocks.map((b) => `${b.goalId}:${b.kind}`)
    expect(kinds).toEqual([
      'gravel:build', 'gravel:taper', 'gravel:event', 'gravel:recovery',
      'vuelta:build', 'vuelta:taper', 'vuelta:event', 'vuelta:recovery',
    ])
    const vueltaEvent = blocks.find((b) => b.goalId === 'vuelta' && b.kind === 'event')!
    expect(vueltaEvent.endsOn).toBe(addDays(vuelta.eventDate, 2)) // 3 días de etapas
    // La preparación de la vuelta empieza al terminar la recuperación del gravel
    const gravelRec = blocks.find((b) => b.goalId === 'gravel' && b.kind === 'recovery')!
    expect(blocks.find((b) => b.goalId === 'vuelta' && b.kind === 'build')!.startsOn).toBe(addDays(gravelRec.endsOn, 1))
  })

  it('avisa si la segunda meta cae dentro de la recuperación de la primera', () => {
    const tooClose = { ...vuelta, eventDate: addDays(gravel.eventDate, 5) }
    const { warnings } = buildSeason([gravel, tooClose], today)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ kind: 'overlap', goalId: 'vuelta', previousGoalId: 'gravel' })
    expect(warnings[0].suggestions).toContain('use_as_training')
  })

  it('avisa si queda poco tiempo de preparación entre metas', () => {
    const tight = { ...vuelta, eventDate: addDays(gravel.eventDate, 20) }
    expect(buildSeason([gravel, tight], today).warnings[0].kind).toBe('tight')
  })

  it('la recuperación crece con el tamaño del evento', () => {
    expect(recoveryDays({ goalType: 'single', stageDays: 1, estimatedHours: 1.5 })).toBe(3)
    expect(recoveryDays({ goalType: 'single', stageDays: 1, estimatedHours: 7 })).toBe(10)
    expect(recoveryDays({ goalType: 'stage', stageDays: 3, estimatedHours: 15 })).toBe(13)
  })
})
