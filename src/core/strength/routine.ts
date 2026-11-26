/**
 * Rutina de fuerza de una sesión del plan: qué ejercicios, cuántas series y
 * descanso. Depende del lugar, el equipo, las molestias, el deporte de la
 * meta, la etapa del plan y la semana dentro de la etapa (progresión).
 */
import type { Phase } from '../planner/plan'
import { EQUIPMENT, EXERCISES, type Exercise, type Pattern, type StrengthPrefs } from './library'

export type Focus = 'legs' | 'upper' | 'full' | 'mobility'
export type RoutineSport = 'cycling' | 'running' | 'swimming' | 'triathlon' | 'other'

export interface RoutineItem {
  ex: Exercise
  sets: number
  /** Repeticiones (o segundos si `secs`) */
  reps?: number
  secs?: number
  perSide: boolean
  restS: number
}

export interface Routine {
  focus: Focus
  place: 'home' | 'gym'
  items: RoutineItem[]
  /** Etapa de progresión dentro de la etapa del plan */
  progress: 'start' | 'more' | 'harder'
}

/** Patrones de movimiento por enfoque y deporte (el orden es el de la rutina). */
function patterns(focus: Focus, sport: RoutineSport, phase: Phase): Pattern[] {
  if (focus === 'mobility') return ['core', 'hinge', 'core', 'core']
  if (focus === 'legs') return ['squat', 'single_leg', 'hinge', 'calf', 'core', 'core']
  if (focus === 'upper') return ['pull', 'push', 'shoulder_health', 'core', 'pull', 'core']
  const plyo = phase === 'base' || phase === 'build' || phase === 'maintenance'
  switch (sport) {
    case 'cycling':
      return ['squat', 'hinge', 'single_leg', 'core', 'pull', 'core']
    case 'running':
      return ['single_leg', 'calf', 'hinge', plyo ? 'plyo' : 'squat', 'core', 'core']
    case 'swimming':
      return ['pull', 'shoulder_health', 'push', 'core', 'hinge', 'core']
    default:
      return ['squat', 'push', 'pull', 'hinge', 'core', 'core']
  }
}

/** Ejercicios por duración de la sesión. */
const countFor = (minutes: number) => (minutes <= 25 ? 4 : minutes <= 32 ? 4 : minutes <= 42 ? 5 : 6)

const ONE_SIDE = new Set([
  'split_squat',
  'step_up',
  'reverse_lunge',
  'single_leg_bridge',
  'db_lunge',
  'one_arm_row',
  'side_plank',
  'band_pallof',
  'cable_pallof',
  'bird_dog',
])

function canDo(ex: Exercise, p: StrengthPrefs, place: 'home' | 'gym') {
  if (ex.avoid.some((d) => p.discomfort.includes(d))) return false
  if (place === 'home') return ex.place === 'home' && (ex.needs.length === 0 || ex.needs.some((n) => p.equipment.includes(n)))
  // En el gimnasio hay máquinas y también mancuernas, bandas, bancos…
  return ex.place === 'gym' || ex.needs.length === 0 || ex.needs.some((n) => EQUIPMENT.includes(n))
}

/** Preferencia: en el gimnasio las máquinas; en casa lo que da más carga si hay experiencia. */
function rank(ex: Exercise, p: StrengthPrefs, place: 'home' | 'gym') {
  let r = 0
  if (place === 'gym' && ex.place === 'gym') r -= 3
  if (place === 'home' && ex.needs.length > 0 && p.experience !== 'new') r -= 2
  if (place === 'home' && ex.needs.length > 0 && p.experience === 'new') r -= 1
  if (ex.hold && p.experience !== 'new') r += 1
  // Mancuernas livianas: mejor no para las piernas (se quedan cortas)
  if (
    ex.needs.includes('dumbbells') &&
    p.dumbbellMaxKg !== null &&
    p.dumbbellMaxKg < 6 &&
    ['squat', 'hinge', 'single_leg'].includes(ex.pattern) &&
    !ex.needs.includes('kettlebell')
  )
    r += 2
  return r
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 7) >>> 0

export function buildRoutine(a: {
  prefs: StrengthPrefs
  place: 'home' | 'gym'
  sport: RoutineSport
  phase: Phase
  focus: Focus
  minutes: number
  /** Semana dentro de la etapa (1, 2, 3…) */
  weekInPhase: number
}): Routine {
  const { prefs, place, sport, phase, focus } = a
  const want = countFor(a.minutes)
  const used = new Set<string>()
  const items: RoutineItem[] = []
  const progress: Routine['progress'] = a.weekInPhase <= 1 ? 'start' : a.weekInPhase === 2 ? 'more' : 'harder'
  // Las mismas opciones durante una etapa (para progresar) y otras en la siguiente
  const seed = hash(`${phase}-${focus}-${sport}`)
  const pats = patterns(focus, sport, phase)
  for (let k = 0; items.length < want && k < pats.length + 4; k++) {
    const pat: Pattern = k < pats.length ? pats[k] : 'core'
    let options = EXERCISES.filter((e) => e.pattern === pat && !used.has(e.id) && canDo(e, prefs, place))
    if (focus === 'mobility') options = options.filter((e) => e.needs.length === 0 && e.place === 'home')
    if (options.length === 0 && pat === 'shoulder_health') options = EXERCISES.filter((e) => e.id === 'superman' && !used.has(e.id) && canDo(e, prefs, place))
    if (options.length === 0) continue
    const best = Math.min(...options.map((e) => rank(e, prefs, place)))
    const top = options.filter((e) => rank(e, prefs, place) === best)
    const ex = top[(seed + k) % top.length]
    used.add(ex.id)
    items.push(dose(ex, prefs, phase, focus, progress))
  }
  return { focus, place, items, progress }
}

function dose(ex: Exercise, p: StrengthPrefs, phase: Phase, focus: Focus, progress: Routine['progress']): RoutineItem {
  const perSide = ONE_SIDE.has(ex.id)
  const light = focus === 'mobility' || phase === 'recovery' || phase === 'return'
  const maintain = phase === 'taper' || phase === 'recovery_week'
  const heavy = phase === 'build' && p.experience !== 'new'
  let sets = light || maintain ? 2 : p.experience === 'new' && progress === 'start' ? 2 : 3
  if (!light && !maintain && progress !== 'start' && p.experience === 'regular' && phase === 'build') sets = 4
  const restS = light ? 30 : heavy ? 90 : 60
  if (ex.hold) {
    const base = p.experience === 'new' ? 20 : p.experience === 'some' ? 30 : 40
    return { ex, sets, secs: light ? 20 : base + (progress === 'harder' ? 10 : 0), perSide, restS: Math.min(restS, 45) }
  }
  const reps =
    ex.pattern === 'plyo' ? 8 : ex.pattern === 'calf' ? 15 : light ? 10 : maintain ? 8 : heavy ? 8 : phase === 'build' ? 10 : p.experience === 'new' ? 12 : 12
  return { ex, sets, reps, perSide, restS }
}

/** Enfoque de una sesión según el deporte y su lugar entre las de la semana. */
export function focusFor(sport: RoutineSport, indexInWeek: number, mobility: boolean): Focus {
  if (mobility) return 'mobility'
  if (sport === 'triathlon') return indexInWeek % 2 === 0 ? 'legs' : 'upper'
  return 'full'
}
