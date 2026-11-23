import { fromText } from '../activity/sport'
import type { SportMapping } from '../activity/sport'
import type { ParsedActivity, Sample } from '../activity/types'
import { buildParsed } from './build'
import { ImportError } from './errors'
import { attr, blocks, num, text } from './xml'

/** Lee un .TCX (formato de Garmin Training Center). */
export function parseTcx(xml: string, hint?: SportMapping): ParsedActivity {
  if (!/<TrainingCenterDatabase\b/i.test(xml)) throw new ImportError('corrupt', 'no es TCX')
  const act = blocks(xml, 'Activity')[0]
  if (!act) throw new ImportError('not_activity', 'TCX sin actividad (puede ser un curso)')

  const laps = blocks(act.body, 'Lap')
  let t0: Date | null = null
  let lapTime = 0
  let lapDist = 0
  const samples: Sample[] = []
  for (const lap of laps) {
    lapTime += num(lap.body, 'TotalTimeSeconds') ?? 0
    lapDist += num(lap.body, "DistanceMeters") ?? 0
    const lapStart = attr(lap.attrs, 'StartTime')
    if (!t0 && lapStart) t0 = new Date(lapStart)
    for (const tp of blocks(lap.body, 'Trackpoint')) {
      const time = text(tp.body, 'Time')
      if (!time) continue
      const d = new Date(time)
      if (Number.isNaN(d.getTime())) continue
      t0 ??= d
      const pos = blocks(tp.body, 'Position')[0]?.body ?? ''
      const hrBlock = blocks(tp.body, 'HeartRateBpm')[0]?.body ?? ''
      samples.push({
        t: (d.getTime() - t0.getTime()) / 1000,
        lat: num(pos, 'LatitudeDegrees'),
        lon: num(pos, 'LongitudeDegrees'),
        alt: num(tp.body, 'AltitudeMeters'),
        dist: num(tp.body, 'DistanceMeters'),
        hr: num(hrBlock, 'Value'),
        cadence: num(tp.body, 'Cadence') ?? num(tp.body, 'RunCadence'),
        power: num(tp.body, 'Watts'),
        speed: num(tp.body, 'Speed'),
      })
    }
  }
  const idText = text(act.body, 'Id')
  if (!t0 && idText) t0 = new Date(idText)
  if (samples.length < 2 && lapTime <= 0) throw new ImportError('empty')

  const sportAttr = attr(act.attrs, 'Sport')
  const mapping = hint ?? fromText(sportAttr)
  const serial = text(blocks(act.body, 'Creator')[0]?.body ?? '', 'UnitId') ?? null
  return buildParsed({
    samples,
    startTime: t0,
    format: 'tcx',
    base: {
      ...mapping,
      rawSport: sportAttr ?? null,
      deviceSerial: serial,
      deviceName: text(blocks(act.body, 'Creator')[0]?.body ?? '', 'Name') ?? null,
    },
    totals: {
      movingS: lapTime > 0 ? lapTime : undefined,
      distanceM: lapDist > 0 ? lapDist : undefined,
      elapsedS: samples.length < 2 ? lapTime : undefined,
    },
  })
}
