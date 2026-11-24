/**
 * Exámenes de laboratorio sugeridos, con unidad y rango de referencia general
 * para adultos. Son valores orientativos: cada laboratorio tiene su propio rango
 * y ese es el que vale (la persona lo puede escribir al registrar el resultado).
 * La app NO interpreta ni diagnostica.
 */

export type Sex = 'female' | 'male'

interface Range {
  low: number | null
  high: number | null
}

export interface LabDef {
  key: string
  unit: string
  decimals: number
  range: Range | Record<Sex, Range>
}

export const LAB_CATALOG: LabDef[] = [
  { key: 'hemoglobin', unit: 'g/dL', decimals: 1, range: { female: { low: 12, high: 15.5 }, male: { low: 13.5, high: 17.5 } } },
  { key: 'hematocrit', unit: '%', decimals: 1, range: { female: { low: 36, high: 46 }, male: { low: 41, high: 53 } } },
  { key: 'ferritin', unit: 'ng/mL', decimals: 0, range: { female: { low: 15, high: 150 }, male: { low: 30, high: 400 } } },
  { key: 'iron', unit: 'µg/dL', decimals: 0, range: { low: 60, high: 170 } },
  { key: 'vitamin_d', unit: 'ng/mL', decimals: 1, range: { low: 30, high: 100 } },
  { key: 'b12', unit: 'pg/mL', decimals: 0, range: { low: 200, high: 900 } },
  { key: 'glucose', unit: 'mg/dL', decimals: 0, range: { low: 70, high: 99 } },
  { key: 'hba1c', unit: '%', decimals: 1, range: { low: 4, high: 5.6 } },
  { key: 'cholesterol_total', unit: 'mg/dL', decimals: 0, range: { low: null, high: 199 } },
  { key: 'ldl', unit: 'mg/dL', decimals: 0, range: { low: null, high: 129 } },
  { key: 'hdl', unit: 'mg/dL', decimals: 0, range: { female: { low: 50, high: null }, male: { low: 40, high: null } } },
  { key: 'triglycerides', unit: 'mg/dL', decimals: 0, range: { low: null, high: 149 } },
  { key: 'tsh', unit: 'mUI/L', decimals: 2, range: { low: 0.4, high: 4 } },
  { key: 'creatinine', unit: 'mg/dL', decimals: 2, range: { female: { low: 0.5, high: 1.1 }, male: { low: 0.7, high: 1.3 } } },
]

export const labDef = (key: string | null | undefined) => LAB_CATALOG.find((d) => d.key === key) ?? null

/** Rango general para la persona (si el rango depende del sexo y no se sabe, se usa el más amplio). */
export function generalRange(def: LabDef, sex: Sex | null): Range {
  const r = def.range
  if ('low' in r) return r
  if (sex) return r[sex]
  const lows = [r.female.low, r.male.low].filter((x): x is number => x !== null)
  const highs = [r.female.high, r.male.high].filter((x): x is number => x !== null)
  return { low: lows.length ? Math.min(...lows) : null, high: highs.length ? Math.max(...highs) : null }
}

export type LabStatus = 'low' | 'in_range' | 'high' | 'unknown'

export function labStatus(value: number, range: Range | null): LabStatus {
  if (!range || (range.low === null && range.high === null)) return 'unknown'
  if (range.low !== null && value < range.low) return 'low'
  if (range.high !== null && value > range.high) return 'high'
  return 'in_range'
}

/** Rango que aplica a un resultado: el del laboratorio si lo escribió; si no, el general. */
export function effectiveRange(
  r: { labKey?: string; refLow?: number | null; refHigh?: number | null },
  sex: Sex | null,
): { range: Range | null; source: 'lab' | 'general' | null } {
  const hasOwn = (r.refLow ?? null) !== null || (r.refHigh ?? null) !== null
  if (hasOwn) return { range: { low: r.refLow ?? null, high: r.refHigh ?? null }, source: 'lab' }
  const def = labDef(r.labKey)
  return def ? { range: generalRange(def, sex), source: 'general' } : { range: null, source: null }
}
