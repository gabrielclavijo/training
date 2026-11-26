/**
 * Simulador de planes (QA): genera planes para perfiles de élite, normal y
 * principiante, con metas de todos los deportes repartidas en el año (algunas
 * muy cercanas entre sí) y pausas, y comprueba las reglas generales del plan.
 * Con QA_OUT=<carpeta> escribe además el detalle de cada falla.
 */
import { describe, expect, it } from 'vitest'
import { addDays } from '../dates'
import { generatePlan, isoWeekday, type PlanGoal, type PlanInput, type PlanPause, type SessionDraft, type Weekday } from './plan'
import { easyAfter, noStrengthAfter, PLAN_RULES, restAfter } from './rules'
import { estimateHours } from '../season'
import { referenceLegTimes, TRI_PRESETS } from '../triathlon'

const TODAY = '2026-11-23'

// Generador pseudoaleatorio con semilla (resultados repetibles)
function rng(seed: number) {
  let s = seed >>> 0
  return () => (s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0) / 2 ** 32
}

type Perfil = 'elite' | 'normal' | 'principiante'
const PERFILES: Record<Perfil, Pick<PlanInput, 'availability' | 'mix' | 'ctl' | 'recentWeeklyLoad' | 'longestRecentMin'> & { minutes: number }> = {
  elite: {
    availability: { minutesByDay: { 1: 120, 2: 150, 3: 120, 4: 150, 5: 90, 6: 360, 7: 240 }, longDay: 6, poolDays: [1, 3, 5] },
    mix: { cycling: 0.5, running: 0.3, swimming: 0.15, strength: 0.05 },
    ctl: 95,
    recentWeeklyLoad: 750,
    longestRecentMin: 300,
    minutes: 45,
  },
  normal: {
    availability: { minutesByDay: { 1: 0, 2: 60, 3: 45, 4: 60, 5: 0, 6: 180, 7: 120 }, longDay: 6, poolDays: [3] },
    mix: { cycling: 0.6, running: 0.3, swimming: 0.05, strength: 0.05 },
    ctl: 40,
    recentWeeklyLoad: 300,
    longestRecentMin: 150,
    minutes: 40,
  },
  principiante: {
    availability: { minutesByDay: { 1: 30, 2: 0, 3: 45, 4: 0, 5: 30, 6: 90, 7: 0 }, longDay: 6, poolDays: [] },
    mix: { cycling: 0, running: 0.8, swimming: 0, strength: 0.2 },
    ctl: 6,
    recentWeeklyLoad: 60,
    longestRecentMin: 40,
    minutes: 30,
  },
}

let gid = 0
function goal(sport: PlanGoal['sport'], date: string, r: () => number, opts: Partial<PlanGoal> = {}): PlanGoal {
  const id = `g${++gid}`
  if (sport === 'triathlon') {
    const p = TRI_PRESETS[Math.floor(r() * TRI_PRESETS.length)]
    const ref = referenceLegTimes({ swimM: p.swimM, bikeM: p.bikeM, runM: p.runM, bikeElevationM: 0 } as never)
    const triMinutes = { swim: ref.swim / 60, bike: ref.bike / 60, run: ref.run / 60 }
    return {
      id,
      name: `Tri ${p.key}`,
      sport,
      subSport: null,
      goalType: 'single',
      objective: 'finish',
      priority: 'secondary',
      eventDate: date,
      estimatedHours: (triMinutes.swim + triMinutes.bike + triMinutes.run) / 60,
      stageDays: 1,
      targetTimeS: null,
      elevationPerKm: 3,
      triMinutes,
      ...opts,
    }
  }
  const km = sport === 'swimming' ? 1 + r() * 9 : sport === 'running' ? 5 + r() * 37 : 40 + r() * 160
  const elev = sport === 'swimming' ? 0 : km * (5 + r() * 20)
  const stage = sport === 'cycling' && r() < 0.35
  const days = stage ? 2 + Math.floor(r() * 4) : 1
  return {
    id,
    name: `${sport} ${days > 1 ? days + ' etapas' : ''}`.trim(),
    sport,
    subSport: null,
    goalType: stage ? 'stage' : 'single',
    objective: r() < 0.5 ? 'finish' : 'time',
    priority: 'secondary',
    eventDate: date,
    estimatedHours: estimateHours(sport === 'other' ? 'cycling' : sport, km * 1000 * days, elev * days, 'paved'),
    stageDays: days,
    targetTimeS: null,
    elevationPerKm: elev / km,
    ...opts,
  }
}

/** Un año de retos: 3 a 5 metas, algunas casi seguidas. */
function season(r: () => number, sports: PlanGoal['sport'][]): { goals: PlanGoal[]; pauses: PlanPause[] } {
  const n = 3 + Math.floor(r() * 3)
  const goals: PlanGoal[] = []
  let d = addDays(TODAY, 14 + Math.floor(r() * 40))
  for (let i = 0; i < n; i++) {
    goals.push(goal(sports[Math.floor(r() * sports.length)], d, r))
    const gap = [2, 7, 21, 35, 60, 90][Math.floor(r() * 6)]
    d = addDays(d, gap + (goals[i].stageDays - 1))
  }
  goals[Math.floor(r() * goals.length)].priority = 'primary'
  const pauses: PlanPause[] = []
  if (r() < 0.5) {
    const s = addDays(TODAY, 20 + Math.floor(r() * 120))
    pauses.push(
      r() < 0.5
        ? { kind: 'travel', startsOn: s, endsOn: addDays(s, 4), canTrain: true, available: ['gym', 'run'], minutesPerDay: 40 }
        : { kind: 'illness', startsOn: s, endsOn: addDays(s, 3 + Math.floor(r() * 8)), canTrain: false, available: ['none'], minutesPerDay: null },
    )
  }
  return { goals, pauses }
}

interface Falla {
  regla: string
  perfil: Perfil
  caso: string
  detalle: string
}

function check(perfil: Perfil, caso: string, input: PlanInput): Falla[] {
  const out: Falla[] = []
  const f = (regla: string, detalle: string) => out.push({ regla, perfil, caso, detalle })
  const { weeks } = generatePlan(input)
  const all: SessionDraft[] = weeks.flatMap((w) => w.sessions)
  const byDay = new Map<string, SessionDraft[]>()
  for (const s of all) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s])
  const pauseOn = (d: string) => input.pauses.find((p) => d >= p.startsOn && d <= (p.endsOn ?? p.startsOn))
  const cap = (d: string) => input.availability.minutesByDay[isoWeekday(d) as Weekday] ?? 0

  // R1: cada meta tiene su evento en su fecha
  for (const g of input.goals) {
    const ok = all.some((s) => s.kind === 'event' && s.goalId === g.id && s.date === g.eventDate)
    if (!ok) f('R1 evento de cada meta en el calendario', `${g.name} ${g.eventDate} (${g.priority})`)
    for (let k = 1; k < g.stageDays; k++) {
      const d = addDays(g.eventDate, k)
      if (!all.some((s) => s.kind === 'event' && s.goalId === g.id && s.date === d))
        f('R1 evento de cada meta en el calendario', `${g.name} etapa ${k + 1} el ${d}`)
    }
  }
  // R2: números válidos
  for (const s of all)
    if (!Number.isFinite(s.durationMin) || !Number.isFinite(s.load) || s.durationMin < 0 || s.load < 0)
      f('R2 números válidos', `${s.date} ${s.kind} ${s.durationMin} min carga ${s.load}`)
  // R3: tiempo del día (salvo eventos y pausas)
  for (const [d, ss] of byDay) {
    if (ss.some((s) => s.kind === 'event') || pauseOn(d)) continue
    const tot = ss.reduce((t, s) => t + s.durationMin, 0)
    if (tot > cap(d) + 1)
      f(
        'R3 respeta el tiempo de cada día',
        `${d}: ${Math.round(tot)} min con ${cap(d)} disponibles (${ss.map((s) => s.kind + (s.note ? '/' + s.note : '')).join(', ')})`,
      )
  }
  // R4: descanso después de cada evento
  for (const g of input.goals) {
    const end = addDays(g.eventDate, g.stageDays - 1)
    for (let k = 1; k <= restAfter(g.stageDays); k++) {
      const d = addDays(end, k)
      const ss = (byDay.get(d) ?? []).filter((s) => s.kind !== 'event')
      if (ss.length) f('R4 descanso después del evento', `${g.name} terminó ${end}; el ${d} hay ${ss.map((s) => s.kind).join(', ')}`)
    }
    // Recuperación corta: nada fuerte ni largo
    for (let k = restAfter(g.stageDays) + 1; k <= restAfter(g.stageDays) + easyAfter(g.stageDays); k++) {
      const d = addDays(end, k)
      for (const s of byDay.get(d) ?? [])
        if (
          s.kind !== 'event' &&
          s.kind !== 'recovery' &&
          s.kind !== 'rest' &&
          !(s.kind === 'openers' && input.goals.some((x) => x.eventDate > end && addDays(x.eventDate, -3) <= d))
        )
          f('R5 recuperación corta después del evento', `${g.name} terminó ${end}; el ${d} hay ${s.kind} ${s.durationMin} min`)
    }
  }
  // R6: fuerza y core
  for (const s of all.filter((x) => x.kind === 'strength' && x.note !== 'hotel_gym')) {
    for (const g of input.goals) {
      const end = addDays(g.eventDate, g.stageDays - 1)
      const before = (Date.parse(g.eventDate) - Date.parse(s.date)) / 86_400_000
      const after = (Date.parse(s.date) - Date.parse(end)) / 86_400_000
      const lim = s.note === 'core' ? PLAN_RULES.noCoreBeforeEvent : PLAN_RULES.noStrengthBeforeEvent
      if (before > 0 && before <= lim) f('R6 sin fuerza/core antes del evento', `${s.note ?? 'fuerza'} el ${s.date}, ${before} días antes de ${g.name}`)
      const limA = s.note === 'core' ? restAfter(g.stageDays) + easyAfter(g.stageDays) : noStrengthAfter(g.stageDays)
      if (after > 0 && after <= limA) f('R6 sin fuerza/core después del evento', `${s.note ?? 'fuerza'} el ${s.date}, ${after} días después de ${g.name}`)
      if (s.date >= g.eventDate && s.date <= end) f('R6 sin fuerza el día del evento', `${s.date} ${g.name}`)
    }
  }
  // R7: semanas sin huecos ni repetidas; sesiones dentro de su semana
  for (let i = 1; i < weeks.length; i++)
    if (addDays(weeks[i - 1].weekStart, 7) !== weeks[i].weekStart) f('R7 semanas continuas', `${weeks[i - 1].weekStart} → ${weeks[i].weekStart}`)
  for (const w of weeks)
    for (const s of w.sessions)
      if (s.date < w.weekStart || s.date > addDays(w.weekStart, 6)) f('R7 sesión fuera de su semana', `${s.date} en la semana ${w.weekStart}`)
  // R8: un día de descanso por semana (semanas normales completas)
  for (const w of weeks) {
    if (w.phase === 'pause' || w.phase === 'event') continue
    const days = new Set(w.sessions.map((s) => s.date))
    if (days.size >= 7) f('R8 al menos un día de descanso por semana', `semana ${w.weekStart} (${w.phase}) entrena los 7 días`)
  }
  // R9: subida de carga semanal razonable (base/desarrollo consecutivas)
  for (let i = 1; i < weeks.length; i++) {
    const a = weeks[i - 1]
    const b = weeks[i]
    if (['base', 'build'].includes(a.phase) && ['base', 'build'].includes(b.phase) && a.targetLoad > 0 && b.targetLoad > a.targetLoad * 1.12 + 5)
      f('R9 la carga no sube más de ~10 % por semana', `${a.weekStart} ${a.targetLoad} → ${b.weekStart} ${b.targetLoad}`)
  }
  // R10: enfermedad o lesión = sin sesiones
  for (const s of all) {
    const p = pauseOn(s.date)
    // (el evento de la meta se sigue mostrando: la persona decide si corre)
    if (p && (p.kind === 'illness' || p.kind === 'injury') && s.kind !== 'event') f('R10 sin entrenar enfermo o lesionado', `${s.date} ${s.kind}`)
  }
  // R11: natación del triatlón solo en días con piscina
  const pool = new Set(input.availability.poolDays ?? [])
  for (const s of all)
    if (s.sport === 'swimming' && s.kind !== 'event' && pool.size && !pool.has(isoWeekday(s.date)) && !pauseOn(s.date))
      f('R11 natación solo con piscina', `${s.date} (${isoWeekday(s.date)})`)
  // R12: el plan llega hasta después de la última meta
  const last = input.goals.reduce((m, g) => (addDays(g.eventDate, g.stageDays - 1) > m ? addDays(g.eventDate, g.stageDays - 1) : m), TODAY)
  if (weeks.length && addDays(weeks[weeks.length - 1].weekStart, 6) < last)
    f('R12 el plan cubre todas las metas', `termina ${weeks.at(-1)!.weekStart}, última meta ${last}`)
  return out
}

describe('simulación de planes (perfiles × deportes × un año de retos)', () => {
  const fallas: Falla[] = []
  let casos = 0
  const sportsSets: [string, PlanGoal['sport'][]][] = [
    ['ciclismo', ['cycling']],
    ['running', ['running']],
    ['natación', ['swimming']],
    ['triatlón', ['triathlon']],
    ['otro', ['other']],
    ['mixto', ['cycling', 'running', 'swimming', 'triathlon', 'other']],
  ]
  for (const perfil of Object.keys(PERFILES) as Perfil[])
    for (const [nombre, sports] of sportsSets)
      for (let seed = 1; seed <= 12; seed++) {
        const r = rng(seed * 101 + nombre.length * 7 + perfil.length)
        const { goals, pauses } = season(r, sports)
        const P = PERFILES[perfil]
        const input: PlanInput = {
          today: TODAY,
          goals,
          pauses,
          availability: P.availability,
          mix: P.mix,
          ctl: P.ctl,
          recentWeeklyLoad: P.recentWeeklyLoad,
          longestRecentMin: P.longestRecentMin,
          strength: { enabled: true, minutes: P.minutes },
        }
        casos++
        fallas.push(
          ...check(
            perfil,
            `${nombre} #${seed}: ${goals.map((g) => `${g.name}@${g.eventDate}${g.priority === 'primary' ? '★' : ''}`).join(' · ')}${pauses.length ? ' · pausa ' + pauses[0].kind + ' ' + pauses[0].startsOn : ''}`,
            input,
          ),
        )
      }

  it('genera y revisa cientos de planes', async () => {
    const porRegla = new Map<string, { n: number; perfiles: Set<string>; ej: Falla }>()
    for (const x of fallas) {
      const e = porRegla.get(x.regla) ?? { n: 0, perfiles: new Set(), ej: x }
      e.n++
      e.perfiles.add(x.perfil)
      porRegla.set(x.regla, e)
    }
    const resumen = [...porRegla].map(([regla, e]) => ({ regla, veces: e.n, perfiles: [...e.perfiles], ejemplo: e.ej }))
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
    if (env.QA_OUT) {
      const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as { writeFileSync(p: string, d: string): void }
      fs.writeFileSync(`${env.QA_OUT}/simulacion.json`, JSON.stringify({ casos, resumen, fallas: fallas.slice(0, 400) }, null, 2))
    }
    expect(casos).toBeGreaterThan(200)
    expect(resumen).toEqual([])
  })
})
