/**
 * Zonas de intensidad (5 zonas). Toda sesión se prescribe por zona y se traduce
 * a lo que la persona pueda medir: potencia, pulso o esfuerzo percibido.
 */

export type Zone = 1 | 2 | 3 | 4 | 5

/** Esfuerzo percibido orientativo por zona (siempre se muestra). */
export const RPE_BY_ZONE: Record<Zone, [number, number]> = {
  1: [2, 3],
  2: [3, 4],
  3: [5, 6],
  4: [7, 8],
  5: [9, 10],
}

/** Factor de intensidad aproximado de cada zona (para estimar la carga). */
export const IF_BY_ZONE: Record<Zone, number> = { 1: 0.55, 2: 0.7, 3: 0.82, 4: 0.95, 5: 1.05 }

/** Carga por hora en la escala común (1 h al umbral ≈ 100). */
export const loadPerHour = (z: Zone) => IF_BY_ZONE[z] ** 2 * 100

// Porcentajes del umbral de pulso (límite superior de cada zona)
const HR_PCT: [number, number][] = [
  [0, 0.81],
  [0.81, 0.89],
  [0.89, 0.94],
  [0.94, 1.0],
  [1.0, 1.06],
]
// Porcentajes del FTP (Coggan)
const POWER_PCT: [number, number][] = [
  [0, 0.55],
  [0.56, 0.75],
  [0.76, 0.9],
  [0.91, 1.05],
  [1.06, 1.2],
]

export interface ZoneInputs {
  ftpW?: number | null
  hrThreshold?: number | null
  hrMax?: number | null
  hrMaxSource?: 'measured' | 'estimated' | null
  hrRest?: number | null
  ageYears?: number | null
  usesPowerMeter?: boolean
}

export interface ZoneSet {
  /** De dónde salió el umbral de pulso */
  hrSource: 'threshold' | 'reserve' | 'max' | 'age' | null
  /** true si las zonas de pulso son estimadas (hay que destacarlo) */
  hrEstimated: boolean
  hrThreshold: number | null
  power: boolean
  ftpW: number | null
}

/** Decide con qué se medirán las zonas y si son estimaciones. */
export function zoneSet(p: ZoneInputs): ZoneSet {
  let hrThreshold: number | null = null
  let hrSource: ZoneSet['hrSource'] = null
  if (p.hrThreshold) {
    hrThreshold = p.hrThreshold
    hrSource = 'threshold'
  } else if (p.hrMax && p.hrRest) {
    // Karvonen: umbral ≈ reposo + 85 % de la reserva
    hrThreshold = Math.round(p.hrRest + 0.85 * (p.hrMax - p.hrRest))
    hrSource = 'reserve'
  } else if (p.hrMax) {
    hrThreshold = Math.round(p.hrMax * 0.89)
    hrSource = 'max'
  } else if (p.ageYears) {
    hrThreshold = Math.round((208 - 0.7 * p.ageYears) * 0.89)
    hrSource = 'age'
  }
  return {
    hrSource,
    // Solo el umbral medido es un dato propio; todo lo demás es una estimación
    hrEstimated: hrSource !== null && hrSource !== 'threshold',
    hrThreshold,
    power: Boolean(p.usesPowerMeter && p.ftpW),
    ftpW: p.ftpW ?? null,
  }
}

export interface ZoneTarget {
  zone: Zone
  rpe: [number, number]
  hr: [number, number] | null
  power: [number, number] | null
  hrEstimated: boolean
}

export function zoneTarget(z: Zone, zs: ZoneSet, sport: string): ZoneTarget {
  const [hl, hh] = HR_PCT[z - 1]
  const [pl, ph] = POWER_PCT[z - 1]
  const hr: [number, number] | null =
    zs.hrThreshold && sport !== 'swimming' && sport !== 'strength'
      ? [Math.round(zs.hrThreshold * (hl || 0.7)), Math.round(zs.hrThreshold * hh)]
      : null
  const power: [number, number] | null = zs.power && zs.ftpW && sport === 'cycling' ? [Math.round(zs.ftpW * (pl || 0.45)), Math.round(zs.ftpW * ph)] : null
  return { zone: z, rpe: RPE_BY_ZONE[z], hr, power, hrEstimated: zs.hrEstimated }
}
