import type { Sample, Streams } from './types'

/**
 * Calcula el resumen de una grabación a partir de sus muestras.
 * Los valores ponderan por tiempo (dt), así una pausa larga entre dos puntos no
 * pesa como un segundo. Los saltos de más de MAX_GAP_S se consideran pausa.
 */

const MAX_GAP_S = 10
const MOVING_SPEED_MS = 0.5 // por debajo de 1,8 km/h se considera detenido

export interface ComputedStats {
  elapsedS: number
  movingS: number | null
  distanceM: number | null
  elevationGainM: number | null
  avgHr: number | null
  maxHr: number | null
  avgPowerW: number | null
  normalizedPowerW: number | null
  avgCadence: number | null
  hrSamples: number
  powerSamples: number
  gpsPoints: number
  hrHistogram: [number, number][] | null
  powerHistogram: [number, number][] | null
  powerCurve: Record<string, number> | null
}

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6_371_000
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

const valid = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

export function computeStats(samples: Sample[]): ComputedStats {
  const s = [...samples].filter((x) => valid(x.t)).sort((a, b) => a.t - b.t)
  const n = s.length
  const elapsedS = n > 1 ? Math.round(s[n - 1].t - s[0].t) : 0

  // Distancia acumulada: la del dispositivo si existe; si no, por GPS.
  const hasDeviceDist = s.some((x) => valid(x.dist) && x.dist! > 0)
  const cum: (number | null)[] = new Array(n).fill(null)
  let gpsPoints = 0
  let acc = 0
  let lastLL: [number, number] | null = null
  for (let i = 0; i < n; i++) {
    const p = s[i]
    if (valid(p.lat) && valid(p.lon)) {
      gpsPoints++
      if (lastLL) acc += haversine(lastLL[0], lastLL[1], p.lat, p.lon)
      lastLL = [p.lat, p.lon]
    }
    cum[i] = hasDeviceDist ? (valid(p.dist) ? p.dist! : null) : gpsPoints > 0 ? acc : null
  }
  const lastDist = [...cum].reverse().find((v) => v !== null) ?? null
  const distanceM = lastDist !== null && lastDist > 0 ? Math.round(lastDist * 10) / 10 : null

  // Tiempo en movimiento
  let movingS: number | null = null
  if (distanceM !== null) {
    movingS = 0
    let prevD: number | null = cum[0]
    for (let i = 1; i < n; i++) {
      const dt = s[i].t - s[i - 1].t
      const d = cum[i]
      if (dt > 0 && dt <= MAX_GAP_S && d !== null && prevD !== null) {
        const speed = valid(s[i].speed) ? s[i].speed! : (d - prevD) / dt
        if (speed >= MOVING_SPEED_MS) movingS += dt
      }
      if (d !== null) prevD = d
    }
    movingS = Math.round(movingS)
  }

  // Desnivel positivo con suavizado (media móvil de 5) y umbral de 1 m para quitar ruido
  let elevationGainM: number | null = null
  const alts = s.map((x) => x.alt).filter(valid)
  if (alts.length > 1) {
    const sm = alts.map((_, i) => {
      const w = alts.slice(Math.max(0, i - 2), i + 3)
      return w.reduce((a, b) => a + b, 0) / w.length
    })
    let gain = 0
    let ref = sm[0]
    for (const a of sm) {
      if (a - ref >= 1) {
        gain += a - ref
        ref = a
      } else if (a < ref) ref = a
    }
    elevationGainM = Math.round(gain)
  }

  // Pulso: promedio ponderado por tiempo e histograma (segundos por ppm)
  const hrHist = new Map<number, number>()
  let hrW = 0
  let hrSum = 0
  let maxHr: number | null = null
  let hrSamples = 0
  const powerHist = new Map<number, number>()
  let pW = 0
  let pSum = 0
  let powerSamples = 0
  let cadW = 0
  let cadSum = 0

  for (let i = 0; i < n; i++) {
    const dt = i === 0 ? 1 : Math.min(MAX_GAP_S, Math.max(0, s[i].t - s[i - 1].t))
    const hr = s[i].hr
    if (valid(hr) && hr > 25 && hr < 250) {
      hrSamples++
      const b = Math.round(hr)
      hrHist.set(b, (hrHist.get(b) ?? 0) + dt)
      hrW += dt
      hrSum += hr * dt
      maxHr = Math.max(maxHr ?? 0, b)
    }
    const pw = s[i].power
    if (valid(pw) && pw >= 0 && pw < 3000) {
      powerSamples++
      const b = Math.round(pw / 5) * 5
      powerHist.set(b, (powerHist.get(b) ?? 0) + dt)
      pW += dt
      pSum += pw * dt
    }
    const cad = s[i].cadence
    if (valid(cad) && cad > 0) {
      cadW += dt
      cadSum += cad * dt
    }
  }

  const histToArray = (m: Map<number, number>) =>
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, Math.round(v)] as [number, number])

  const hasPower = powerSamples > 10 && pSum > 0
  const perSecondPower = hasPower ? resample1Hz(s, 'power') : []

  return {
    elapsedS,
    movingS,
    distanceM,
    elevationGainM,
    avgHr: hrW > 0 ? Math.round(hrSum / hrW) : null,
    maxHr,
    avgPowerW: hasPower ? Math.round(pSum / pW) : null,
    normalizedPowerW: hasPower ? normalizedPower(perSecondPower) : null,
    avgCadence: cadW > 0 ? Math.round(cadSum / cadW) : null,
    hrSamples,
    powerSamples,
    gpsPoints,
    hrHistogram: hrSamples > 0 ? histToArray(hrHist) : null,
    powerHistogram: hasPower ? histToArray(powerHist) : null,
    powerCurve: hasPower ? powerCurve(perSecondPower) : null,
  }
}

/** Remuestrea un canal a 1 Hz (mantiene el último valor; huecos largos = 0). */
export function resample1Hz(samples: Sample[], key: 'power' | 'hr'): number[] {
  if (samples.length === 0) return []
  const t0 = samples[0].t
  const total = Math.round(samples[samples.length - 1].t - t0)
  const out = new Array<number>(total + 1).fill(0)
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i][key]
    if (!valid(v)) continue
    const from = Math.round(samples[i].t - t0)
    const next = i + 1 < samples.length ? Math.round(samples[i + 1].t - t0) : from + 1
    const to = Math.min(next, from + MAX_GAP_S)
    for (let k = from; k < to && k <= total; k++) out[k] = v
  }
  return out
}

/** Potencia normalizada (media móvil de 30 s, elevada a la 4, promedio, raíz 4). */
export function normalizedPower(perSecond: number[]): number | null {
  if (perSecond.length < 30) return null
  let sum = 0
  for (let i = 0; i < 30; i++) sum += perSecond[i]
  let acc = 0
  let count = 0
  for (let i = 29; i < perSecond.length; i++) {
    if (i >= 30) sum += perSecond[i] - perSecond[i - 30]
    acc += (sum / 30) ** 4
    count++
  }
  return Math.round((acc / count) ** 0.25)
}

export const CURVE_DURATIONS = [5, 15, 60, 300, 600, 1200, 3600] as const

/** Mejor potencia media para cada duración. */
export function powerCurve(perSecond: number[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const d of CURVE_DURATIONS) {
    if (perSecond.length < d) break
    let sum = 0
    for (let i = 0; i < d; i++) sum += perSecond[i]
    let best = sum
    for (let i = d; i < perSecond.length; i++) {
      sum += perSecond[i] - perSecond[i - d]
      if (sum > best) best = sum
    }
    out[String(d)] = Math.round(best / d)
  }
  return out
}

/** Reduce las series a una muestra cada `step` segundos para guardarlas. */
export function downsample(samples: Sample[], step = 5): Streams {
  const out: Streams = { t: [] }
  const keys = ['hr', 'power', 'cadence', 'lat', 'lon', 'alt', 'dist'] as const
  const present = keys.filter((k) => samples.some((x) => valid(x[k])))
  for (const k of present) out[k] = []
  let nextT = -Infinity
  const t0 = samples[0]?.t ?? 0
  for (const x of samples) {
    if (x.t < nextT) continue
    nextT = x.t + step
    out.t.push(Math.round(x.t - t0))
    for (const k of present) {
      const v = x[k]
      const arr = out[k]!
      if (!valid(v)) arr.push(null)
      else arr.push(k === 'lat' || k === 'lon' ? Math.round(v * 1e5) / 1e5 : Math.round(v * 10) / 10)
    }
  }
  return out
}
