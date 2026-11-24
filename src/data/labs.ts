import type { HealthRecord } from './types'

export interface LabGroup {
  id: string
  name: string
  unit: string
  results: HealthRecord[] // de la más antigua a la más reciente
}

/** Agrupa los resultados por examen (del catálogo por clave; los propios por nombre). */
export function groupLabs(records: HealthRecord[], name: (key: string) => string): LabGroup[] {
  const groups = new Map<string, LabGroup>()
  for (const r of records.filter((x) => x.category === 'lab_result' && typeof x.data.value === 'number')) {
    const id = r.data.labKey ?? `custom:${r.data.name.toLowerCase()}`
    const g = groups.get(id) ?? { id, name: r.data.labKey ? name(r.data.labKey) : r.data.name, unit: r.data.unit ?? '', results: [] }
    g.results.push(r)
    groups.set(id, g)
  }
  for (const g of groups.values()) g.results.sort((a, b) => (a.recordedOn ?? '').localeCompare(b.recordedOn ?? ''))
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
}
