/**
 * Fechas y horas. Se guardan en UTC (timestamptz) y se muestran en la zona
 * horaria de la persona (por defecto America/Bogota) con formato día/mes/año.
 */

export const DEFAULT_TIMEZONE = 'America/Bogota'
export const DEFAULT_LOCALE = 'es-CO'

export interface DateOptions {
  timeZone?: string
  locale?: string
}

const cache = new Map<string, Intl.DateTimeFormat>()
function dtf(locale: string, o: Intl.DateTimeFormatOptions) {
  const key = locale + JSON.stringify(o)
  let f = cache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, o)
    cache.set(key, f)
  }
  return f
}

function resolve(o?: DateOptions) {
  return { timeZone: o?.timeZone ?? DEFAULT_TIMEZONE, locale: o?.locale ?? DEFAULT_LOCALE }
}

const toDate = (d: Date | string | number) => (d instanceof Date ? d : new Date(d))

/** 23/11/2026 */
export function formatDate(d: Date | string | number, o?: DateOptions) {
  const { timeZone, locale } = resolve(o)
  return dtf(locale, { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(toDate(d))
}

/** 08:05 a. m. */
export function formatTime(d: Date | string | number, o?: DateOptions) {
  const { timeZone, locale } = resolve(o)
  return dtf(locale, { timeZone, hour: '2-digit', minute: '2-digit' }).format(toDate(d))
}

/** 23/11/2026, 08:05 a. m. */
export function formatDateTime(d: Date | string | number, o?: DateOptions) {
  return `${formatDate(d, o)}, ${formatTime(d, o)}`
}

/** lunes, 23 de noviembre */
export function formatLongDate(d: Date | string | number, o?: DateOptions) {
  const { timeZone, locale } = resolve(o)
  return dtf(locale, { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(d))
}

/** Clave de día local "AAAA-MM-DD", útil para agrupar actividades por día. */
export function localDayKey(d: Date | string | number, timeZone = DEFAULT_TIMEZONE) {
  const parts = dtf('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(toDate(d))
  const get = (t: string) => parts.find((p) => p.type === t)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Suma días a una clave "AAAA-MM-DD" sin problemas de zona horaria. */
export function addDays(dayKey: string, days: number) {
  const [y, m, d] = dayKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** Días entre dos claves "AAAA-MM-DD" (b − a). */
export function daysBetween(a: string, b: string) {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

/** Lunes de la semana (ISO) de una clave de día. */
export function weekStart(dayKey: string) {
  const [y, m, d] = dayKey.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = domingo
  return addDays(dayKey, -((dow + 6) % 7))
}

/** Edad cumplida en años a una fecha dada. */
export function ageOn(birthDate: string, onDayKey: string) {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [y, m, d] = onDayKey.split('-').map(Number)
  let age = y - by
  if (m < bm || (m === bm && d < bd)) age--
  return age
}
