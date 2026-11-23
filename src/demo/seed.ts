import { strToU8 } from 'fflate'
import type { ParsedActivity, Sample, Sport, SubSport } from '../core/activity/types'
import { addDays, localDayKey, weekStart } from '../core/dates'
import { parseActivityFile } from '../core/parsers'
import { buildParsed } from '../core/parsers/build'
import type { Repo } from '../data/repo'
import { runImportJob, type ImportCandidate, type ImportProgress } from '../data/importer'
import { encodeFit, encodeGpx, rng, simulate } from './files'

/**
 * Datos de prueba del caso de aceptación:
 *  - 16 semanas de ~6 h/semana (bici, una salida de running y gimnasio),
 *    sin potenciómetro y con pulso de muñeca.
 *  - Meta «Gravel de la Sabana» (12 semanas) y «Vuelta de 3 días» (24 semanas).
 *  - Pausa: viaje de trabajo de 5 días en la semana 7, solo gimnasio de hotel.
 *  - Duplicado: la misma salida desde la exportación de Strava (.gpx) y desde el .FIT.
 *  - Una actividad sin pulso (con esfuerzo percibido) y otra sin ningún dato.
 */

const BOGOTA_OFFSET_H = 5 // UTC−5, sin horario de verano

function at(day: string, hourLocal: number) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hourLocal + BOGOTA_OFFSET_H, 0, 0))
}

interface Plan {
  day: string
  hour: number
  sport: Sport
  subSport: SubSport | null
  durationS: number
  distanceM: number
  elevationM: number
  hrBase?: number
  rpe?: number
  title: string
}

function weekPlan(monday: string, factor: number, r: () => number): Plan[] {
  const j = (x: number) => Math.round(x * factor * (0.92 + r() * 0.16))
  return [
    { day: addDays(monday, 1), hour: 6, sport: 'strength', subSport: null, durationS: j(3600), distanceM: 0, elevationM: 0, hrBase: 108, rpe: 6, title: 'Gimnasio: fuerza' },
    { day: addDays(monday, 2), hour: 5, sport: 'cycling', subSport: 'road', durationS: j(4500), distanceM: j(36_000), elevationM: j(450), hrBase: 138, title: 'Rodada de ruta' },
    { day: addDays(monday, 3), hour: 6, sport: 'running', subSport: 'road', durationS: j(2700), distanceM: j(7_200), elevationM: j(60), hrBase: 150, title: 'Trote' },
    { day: addDays(monday, 5), hour: 6, sport: 'cycling', subSport: 'gravel', durationS: j(8100), distanceM: j(52_000), elevationM: j(900), hrBase: 136, title: 'Gravel largo' },
    { day: addDays(monday, 6), hour: 7, sport: 'cycling', subSport: 'road', durationS: j(2700), distanceM: j(20_000), elevationM: j(150), hrBase: 122, title: 'Recuperación' },
  ]
}

const FIT_SPORT: Record<Sport, [string, string]> = {
  cycling: ['cycling', 'road'],
  running: ['running', 'generic'],
  swimming: ['swimming', 'lapSwimming'],
  strength: ['training', 'strengthTraining'],
  other: ['generic', 'generic'],
}

function parsedFromPlan(p: Plan, seed: number): ParsedActivity {
  const start = at(p.day, p.hour)
  let samples: Sample[] = simulate({
    durationS: p.durationS,
    distanceM: p.distanceM,
    elevationGainM: p.elevationM,
    hrBase: p.hrBase,
    seed,
  })
  if (p.sport === 'strength') samples = samples.map((s) => ({ t: s.t, hr: s.hr }))
  const parsed = buildParsed({
    samples,
    startTime: start,
    format: 'fit',
    base: { sport: p.sport, subSport: p.subSport, title: p.title, rawSport: FIT_SPORT[p.sport].join('/'), deviceSerial: 'DEMO-3400', externalId: `demo:${start.getTime()}` },
  })
  parsed.summary.rpe = p.rpe ?? null
  return parsed
}

export function demoCandidates(today: string): ImportCandidate[] {
  const r = rng(2026)
  const firstMonday = addDays(weekStart(today), -16 * 7)
  const out: ImportCandidate[] = []
  let seed = 1
  for (let w = 0; w < 16; w++) {
    const monday = addDays(firstMonday, w * 7)
    const factor = w % 4 === 3 ? 0.7 : 1 // cada cuarta semana es de descarga
    for (const p of weekPlan(monday, factor, r)) {
      if (p.day > today) continue
      out.push({ name: `${p.title} ${p.day}`, parsed: parsedFromPlan(p, seed++), sha256: null })
    }
  }

  // Un trote sin pulso, con esfuerzo percibido
  const noHrDay = addDays(weekStart(today), -9)
  const noHr = parsedFromPlan({ day: noHrDay, hour: 17, sport: 'running', subSport: 'trail', durationS: 3000, distanceM: 7500, elevationM: 250, rpe: 7, title: 'Trote por la montaña (sin pulso)' }, 900)
  out.push({ name: 'Trote sin pulso', parsed: noHr, sha256: null })

  // Una rodada sin pulso ni esfuerzo: la app debe decir que no puede calcular su carga
  const noneDay = addDays(weekStart(today), -4)
  const none = parsedFromPlan({ day: noneDay, hour: 17, sport: 'cycling', subSport: 'road', durationS: 3600, distanceM: 28_000, elevationM: 200, title: 'Rodada sin datos de esfuerzo' }, 901)
  out.push({ name: 'Rodada sin datos', parsed: none, sha256: null })

  // Duplicado: la misma salida desde el .FIT del reloj y desde la exportación de Strava
  const dupDay = addDays(weekStart(today), -2) > today ? addDays(weekStart(today), -9) : addDays(weekStart(today), -2)
  const dupStart = at(dupDay, 6)
  const ride = simulate({ durationS: 3 * 3600, distanceM: 70_000, elevationGainM: 1100, hrBase: 140, seed: 4242 })
  const fit = encodeFit(ride, dupStart, { sport: 'cycling', subSport: 'generic', serialNumber: 3_400_123_456 })
  out.push({ name: 'Salida_sabana.fit', parsed: parseActivityFile({ name: 'Salida_sabana.fit', bytes: fit }), sha256: 'demo-fit-sabana' })
  const gpxSamples = ride.slice(15).map((s) => ({ ...s, t: s.t - 15 }))
  const gpx = encodeGpx(gpxSamples, new Date(dupStart.getTime() + 15_000), { name: 'Gravel por la Sabana con el parche', type: 'cycling' })
  out.push({
    name: 'export_strava/activities/987654.gpx',
    parsed: parseActivityFile({ name: '987654.gpx', bytes: strToU8(gpx) }, { sport: 'cycling', subSport: 'gravel' }, 'strava_export'),
    sha256: 'demo-gpx-sabana',
  })
  return out
}

export async function loadDemoData(repo: Repo, opts: { onProgress?: (p: ImportProgress) => void; now?: Date } = {}) {
  const today = localDayKey(opts.now ?? new Date())
  const start = addDays(weekStart(today), -16 * 7)
  await repo.clearDemoData() // volver a cargarlos no duplica nada

  // Perfil: solo completa lo que esté vacío
  const profile = await repo.getProfile()
  await repo.updateProfile({
    displayName: profile.displayName ?? 'Persona de prueba',
    birthDate: profile.birthDate ?? '1988-03-14',
    sexForFormulas: profile.sexForFormulas ?? 'male',
    heightCm: profile.heightCm ?? 176,
    adultConfirmed: true,
  })
  await repo.savePhysiology({
    effectiveFrom: start,
    hrRest: 54,
    hrMax: 186,
    hrMaxSource: 'measured',
    hrThreshold: 165,
    ftpW: null,
    runThresholdSPerKm: null,
    swimThresholdSPer100m: null,
    isDemo: true,
  })
  for (const [i, kg] of [76.4, 75.8, 75.1, 74.6].entries()) {
    await repo.saveWeight({ measuredOn: addDays(start, i * 28), weightKg: kg, isDemo: true })
  }

  const goalBase = { notes: null, status: 'active' as const, isDemo: true, gpxPath: null, maxAltitudeM: null }
  await repo.saveGoal({
    ...goalBase,
    name: 'Gravel de la Sabana',
    sport: 'cycling',
    subSport: 'gravel',
    eventDate: addDays(today, 84),
    priority: 'secondary',
    goalType: 'single',
    objective: 'finish',
    targetTimeS: null,
    distanceM: 120_000,
    elevationGainM: 2200,
    terrain: 'unpaved',
    maxAltitudeM: 3100,
    stages: [],
  })
  await repo.saveGoal({
    ...goalBase,
    name: 'Vuelta de 3 días',
    sport: 'cycling',
    subSport: 'road',
    eventDate: addDays(today, 168),
    priority: 'primary',
    goalType: 'stage',
    objective: 'time',
    targetTimeS: 15 * 3600,
    distanceM: 315_000,
    elevationGainM: 5600,
    terrain: 'paved',
    stages: [
      { stageNumber: 1, dayOffset: 0, distanceM: 95_000, elevationGainM: 1800, terrain: 'paved', targetTimeS: null },
      { stageNumber: 2, dayOffset: 1, distanceM: 140_000, elevationGainM: 2600, terrain: 'paved', targetTimeS: null },
      { stageNumber: 3, dayOffset: 2, distanceM: 80_000, elevationGainM: 1200, terrain: 'paved', targetTimeS: null },
    ],
  })
  const week7 = addDays(weekStart(today), 6 * 7)
  await repo.savePause({
    kind: 'travel',
    startsOn: week7,
    endsOn: addDays(week7, 4),
    canTrain: true,
    available: ['gym'],
    minutesPerDay: 45,
    notes: 'Viaje de trabajo: solo gimnasio del hotel',
    isDemo: true,
  })

  const items = demoCandidates(today)
  return runImportJob(repo, 'demo', items.map((c) => ({ name: c.name, candidate: c })), {
    total: items.length,
    isDemo: true,
    onProgress: opts.onProgress,
  })
}
