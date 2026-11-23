import { fromText } from '../activity/sport'
import type { SportMapping } from '../activity/sport'
import type { ParsedActivity, Sample } from '../activity/types'
import { buildParsed } from './build'
import { ImportError } from './errors'
import { attr, blocks, num, text } from './xml'

/** Lee un .GPX con hora en cada punto (de Garmin Connect, Strava u otro). */
export function parseGpx(xml: string, hint?: SportMapping): ParsedActivity {
  if (!/<gpx\b/i.test(xml)) throw new ImportError('corrupt', 'no es GPX')
  const pts = blocks(xml, 'trkpt')
  if (pts.length === 0) throw new ImportError('not_activity', 'GPX sin recorrido (puede ser una ruta planeada)')

  let t0: Date | null = null
  const samples: Sample[] = []
  for (const p of pts) {
    const time = text(p.body, 'time')
    if (!time) continue
    const d = new Date(time)
    if (Number.isNaN(d.getTime())) continue
    t0 ??= d
    samples.push({
      t: (d.getTime() - t0.getTime()) / 1000,
      lat: Number(attr(p.attrs, 'lat')),
      lon: Number(attr(p.attrs, 'lon')),
      alt: num(p.body, 'ele'),
      hr: num(p.body, 'hr'),
      cadence: num(p.body, 'cad'),
      power: num(p.body, 'power') ?? num(p.body, 'watts'),
    })
  }
  if (samples.length < 2) {
    throw new ImportError('not_activity', 'GPX sin horas: es una ruta, no una actividad grabada')
  }
  const trk = blocks(xml, 'trk')[0]?.body ?? ''
  const type = text(trk, 'type')
  const mapping = hint ?? fromText(type)
  return buildParsed({
    samples,
    startTime: t0,
    format: 'gpx',
    base: { ...mapping, rawSport: type ?? null, title: text(trk, 'name') ?? null },
  })
}

/** Lee solo los puntos de una ruta GPX (para metas): distancia, desnivel y altitud máxima. */
export function parseRouteGpx(xml: string) {
  const pts = [...blocks(xml, 'trkpt'), ...blocks(xml, 'rtept')]
  if (pts.length < 2) throw new ImportError('empty', 'ruta sin puntos')
  const samples: Sample[] = pts.map((p, i) => ({
    t: i,
    lat: Number(attr(p.attrs, 'lat')),
    lon: Number(attr(p.attrs, 'lon')),
    alt: num(p.body, 'ele'),
  }))
  const alts = samples.map((s) => s.alt).filter((a): a is number => a !== undefined)
  return { samples, maxAltitudeM: alts.length ? Math.round(Math.max(...alts)) : null }
}
