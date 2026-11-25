import { strToU8, zipSync } from 'fflate'
import type { Repo } from '../../data/repo'

/**
 * «Exportar mis datos»: arma en el navegador un .zip con todo lo guardado.
 * Se hace del lado de la persona porque RLS ya garantiza que solo lee lo suyo;
 * los datos de salud vienen descifrados por la Edge Function.
 */
export async function buildExport(repo: Repo): Promise<Blob> {
  const consents = await repo.listConsents()
  const hasHealth = consents.some((c) => c.type === 'health_data' && !c.revokedAt)
  const activities = await repo.listActivities()
  const data = {
    exportedAt: new Date().toISOString(),
    profile: await repo.getProfile(),
    weights: await repo.listWeights(),
    physiology: await repo.listPhysiology(),
    nutrition: await repo.getNutrition(),
    consents,
    health: hasHealth ? await repo.listHealth() : [],
    connections: await repo.listConnections(),
    goals: await repo.listGoals(),
    pauses: await repo.listPauses(),
    importJobs: await repo.listJobs(),
    mealPlans: await repo.listMealPlans(),
    usage: await repo.listMyUsage(),
    recommendationState: await repo.listRecommendationState(),
    activities,
  }
  const files: Record<string, Uint8Array> = {
    'LEEME.txt': strToU8(
      'Exportación de tus datos.\n\n' +
        'datos.json: todo tu perfil, metas, pausas, datos de salud (incluidos exámenes), menús y el resumen de cada actividad.\n' +
        'actividades.csv: una fila por actividad (se abre con Excel o Google Sheets).\n' +
        'series/: las series detalladas (pulso, potencia, GPS) de las actividades de los últimos 12 meses.\n' +
        'Unidades: metros, segundos, kilogramos, vatios. Fechas en UTC.\n',
    ),
    'datos.json': strToU8(JSON.stringify(data, null, 2)),
    'actividades.csv': strToU8(toCsv(activities)),
  }
  // Foto de perfil, si hay
  try {
    const url = await repo.getAvatarUrl()
    if (url) files['foto-de-perfil.jpg'] = new Uint8Array(await (await fetch(url)).arrayBuffer())
  } catch {
    /* sin foto o sin conexión: el resto de la exportación sigue */
  }
  for (const a of activities) {
    for (const s of a.sources) {
      if (!s.streamsPath) continue
      const streams = await repo.getStreams(s)
      if (streams) files[`series/${s.id}.json`] = strToU8(JSON.stringify(streams))
    }
  }
  const zip = zipSync(files, { level: 6 })
  return new Blob([zip as BlobPart], { type: 'application/zip' })
}

function toCsv(activities: Awaited<ReturnType<Repo['listActivities']>>) {
  const header = ['id', 'fecha_inicio_utc', 'deporte', 'modalidad', 'nombre', 'duracion_s', 'en_movimiento_s', 'distancia_m', 'desnivel_m', 'pulso_prom', 'potencia_prom', 'potencia_normalizada', 'esfuerzo_1a10', 'fuentes']
  const q = (v: unknown) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`)
  const rows = activities.map((a) =>
    [a.id, a.startTime, a.sport, a.subSport, a.title, a.elapsedS, a.movingS, a.distanceM, a.elevationGainM, a.avgHr, a.avgPowerW, a.normalizedPowerW, a.rpe, a.sources.map((s) => s.format).join('+')]
      .map(q)
      .join(','),
  )
  return [header.join(','), ...rows].join('\n')
}
