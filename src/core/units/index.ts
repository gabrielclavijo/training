/**
 * Conversión y formato de unidades.
 *
 * Regla: en la base de datos y en los cálculos TODO va en unidades del SI
 * (metros, segundos, kilogramos, vatios, m/s). Solo este módulo convierte a lo
 * que ve la persona. Para agregar el sistema imperial más adelante basta con
 * implementar otra entrada en `SYSTEMS` y elegirla desde el perfil.
 */

export type UnitSystem = 'metric'

export interface FormatOptions {
  locale?: string
  system?: UnitSystem
}

const DEFAULTS: Required<FormatOptions> = { locale: 'es-CO', system: 'metric' }

function nf(locale: string, maxDecimals: number, minDecimals = 0) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: minDecimals,
  })
}

function opts(o?: FormatOptions) {
  return { ...DEFAULTS, ...o }
}

const SYSTEMS = {
  metric: {
    distance(m: number, locale: string) {
      if (Math.abs(m) < 1000) return `${nf(locale, 0).format(m)} m`
      const km = m / 1000
      return `${nf(locale, km < 100 ? 1 : 0).format(km)} km`
    },
    elevation: (m: number, locale: string) => `${nf(locale, 0).format(m)} m`,
    speed: (ms: number, locale: string) => `${nf(locale, 1).format(ms * 3.6)} km/h`,
    weight: (kg: number, locale: string) => `${nf(locale, 1).format(kg)} kg`,
    height: (cm: number, locale: string) => `${nf(locale, 0).format(cm)} cm`,
    temperature: (c: number, locale: string) => `${nf(locale, 0).format(c)} °C`,
    pacePerKm: (sPerKm: number) => `${mmss(sPerKm)} /km`,
    pacePer100m: (sPer100: number) => `${mmss(sPer100)} /100 m`,
  },
} as const

function mmss(totalSeconds: number) {
  const s = Math.round(totalSeconds)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export const formatDistance = (m: number, o?: FormatOptions) => {
  const { locale, system } = opts(o)
  return SYSTEMS[system].distance(m, locale)
}
export const formatElevation = (m: number, o?: FormatOptions) => {
  const { locale, system } = opts(o)
  return SYSTEMS[system].elevation(m, locale)
}
export const formatSpeed = (ms: number, o?: FormatOptions) => {
  const { locale, system } = opts(o)
  return SYSTEMS[system].speed(ms, locale)
}
export const formatWeight = (kg: number, o?: FormatOptions) => {
  const { locale, system } = opts(o)
  return SYSTEMS[system].weight(kg, locale)
}
export const formatHeight = (cm: number, o?: FormatOptions) => {
  const { locale, system } = opts(o)
  return SYSTEMS[system].height(cm, locale)
}
export const formatTemperature = (c: number, o?: FormatOptions) => {
  const { locale, system } = opts(o)
  return SYSTEMS[system].temperature(c, locale)
}

/** Ritmo de running a partir de metros y segundos. */
export const formatPacePerKm = (distanceM: number, durationS: number, o?: FormatOptions) => {
  if (distanceM <= 0) return '—'
  return SYSTEMS[opts(o).system].pacePerKm(durationS / (distanceM / 1000))
}

/** Ritmo de natación a partir de metros y segundos. */
export const formatPacePer100m = (distanceM: number, durationS: number, o?: FormatOptions) => {
  if (distanceM <= 0) return '—'
  return SYSTEMS[opts(o).system].pacePer100m(durationS / (distanceM / 100))
}

export const formatPower = (w: number, o?: FormatOptions) =>
  `${nf(opts(o).locale, 0).format(w)} W`

export const formatWattsPerKg = (w: number, kg: number, o?: FormatOptions) =>
  kg > 0 ? `${nf(opts(o).locale, 1, 1).format(w / kg)} W/kg` : '—'

export const formatHeartRate = (bpm: number, o?: FormatOptions) =>
  `${nf(opts(o).locale, 0).format(bpm)} ppm`

export const formatNumber = (n: number, maxDecimals = 0, o?: FormatOptions) =>
  nf(opts(o).locale, maxDecimals).format(n)

/** Duración legible: "45 min", "1 h 05 min", "12 h 30 min". */
export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return m === 0 ? `${s} s` : `${m} min`
  return `${h} h ${String(m).padStart(2, '0')} min`
}

/** Duración tipo reloj: "1:05:09". */
export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}
