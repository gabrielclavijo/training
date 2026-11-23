import type { Sport, SubSport } from '../../core/activity/types'

export const SPORTS: Sport[] = ['cycling', 'running', 'swimming', 'strength', 'other']

export const SUBSPORTS: Record<Sport, SubSport[]> = {
  cycling: ['road', 'mtb', 'gravel', 'indoor'],
  running: ['road', 'trail', 'track', 'treadmill'],
  swimming: ['pool', 'open_water'],
  strength: [],
  other: [],
}
