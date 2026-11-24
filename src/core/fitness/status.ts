/**
 * «Semáforo» de cada indicador: convierte los números de forma, fatiga, estado
 * y ritmo de aumento en un nivel (bien / atención / alerta) con su explicación,
 * y en una escala para dibujar dónde está la persona.
 * Umbrales habituales en entrenamiento por carga (TSB, ACWR, rampa de CTL).
 */

export type Level = 'good' | 'caution' | 'alert'

export interface Zone {
  to: number // límite superior de la zona (la última llega hasta `max`)
  level: Level
}

export interface Scale {
  min: number
  max: number
  zones: Zone[]
}

export interface IndicatorStatus {
  level: Level
  /** Clave del texto que explica el nivel */
  verdict: string
  scale: Scale
  /** Valor que se marca en la escala */
  marker: number
}

const clampTo = (v: number, s: Scale) => Math.min(s.max, Math.max(s.min, v))

/** Posición (0-100 %) de un valor en la escala. */
export function scalePct(v: number, s: Scale) {
  return ((clampTo(v, s) - s.min) / (s.max - s.min)) * 100
}

function levelIn(v: number, zones: Zone[]): Level {
  for (const z of zones) if (v <= z.to) return z.level
  return zones[zones.length - 1].level
}

/** Estado de forma (TSB = forma − fatiga). */
export function formStatus(tsb: number): IndicatorStatus {
  const scale: Scale = {
    min: -45,
    max: 35,
    zones: [
      { to: -30, level: 'alert' },
      { to: -10, level: 'caution' },
      { to: 25, level: 'good' },
      { to: 35, level: 'caution' },
    ],
  }
  const verdict = tsb < -30 ? 'tsbVeryTired' : tsb < -10 ? 'tsbTired' : tsb <= 5 ? 'tsbNeutral' : tsb <= 25 ? 'tsbFresh' : 'tsbDetrained'
  return { level: levelIn(tsb, scale.zones), verdict, scale, marker: tsb }
}

/** Fatiga aguda frente a la forma crónica (ATL / CTL). */
export function fatigueStatus(atl: number, ctl: number): IndicatorStatus & { ratio: number | null } {
  const scale: Scale = {
    min: 0.4,
    max: 1.7,
    zones: [
      { to: 1.15, level: 'good' },
      { to: 1.35, level: 'caution' },
      { to: 1.7, level: 'alert' },
    ],
  }
  // Con muy poca forma acumulada la proporción no dice mucho
  if (ctl < 10) return { level: 'good', verdict: 'fatigueLowBase', scale, marker: 1, ratio: null }
  const ratio = atl / ctl
  const level = levelIn(ratio, scale.zones)
  const verdict = level === 'good' ? 'fatigueOk' : level === 'caution' ? 'fatigueHigh' : 'fatigueVeryHigh'
  return { level, verdict, scale, marker: ratio, ratio }
}

/** Ritmo de aumento de la forma (puntos de CTL por semana). */
export function rampStatus(ramp: number): IndicatorStatus {
  const scale: Scale = {
    min: -10,
    max: 12,
    zones: [
      { to: -5, level: 'caution' },
      { to: 5, level: 'good' },
      { to: 8, level: 'caution' },
      { to: 12, level: 'alert' },
    ],
  }
  const verdict = ramp < -5 ? 'rampLosing' : ramp <= 5 ? 'rampOk' : ramp <= 8 ? 'rampFast' : 'rampTooFast'
  return { level: levelIn(ramp, scale.zones), verdict, scale, marker: ramp }
}

/** Forma actual frente a la mejor alcanzada. */
export function fitnessVsBest(ctl: number, series: { day: string; ctl: number }[]): IndicatorStatus & { best: number; bestDay: string | null; pct: number } {
  let best = 0
  let bestDay: string | null = null
  for (const p of series) {
    if (p.ctl > best) {
      best = p.ctl
      bestDay = p.day
    }
  }
  best = Math.max(best, ctl)
  const pct = best > 0 ? Math.round((ctl / best) * 100) : 0
  const scale: Scale = {
    min: 0,
    max: 100,
    zones: [
      { to: 60, level: 'alert' },
      { to: 85, level: 'caution' },
      { to: 100, level: 'good' },
    ],
  }
  const level = best < 10 ? 'good' : levelIn(pct, scale.zones)
  const verdict = best < 10 ? 'formBuilding' : pct >= 97 ? 'formAtBest' : level === 'good' ? 'formNearBest' : level === 'caution' ? 'formBelowBest' : 'formFarBest'
  return { level, verdict, scale, marker: pct, best, bestDay, pct }
}
