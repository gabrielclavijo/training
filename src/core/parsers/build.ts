import { computeStats, downsample } from '../activity/summarize'
import { emptySummary, type ActivitySummary, type OriginHint, type ParsedActivity, type Sample, type SourceFormat } from '../activity/types'
import { ImportError } from './errors'

/**
 * Une lo que calculamos de las muestras con los totales que trae el archivo
 * (cuando el dispositivo los da, son más confiables: p. ej. el desnivel barométrico).
 */
export function buildParsed(args: {
  samples: Sample[]
  startTime: Date | null
  format: SourceFormat
  originHint?: OriginHint
  base: Pick<ActivitySummary, 'sport' | 'subSport'> & Partial<ActivitySummary>
  totals?: Partial<ActivitySummary>
}): ParsedActivity {
  const { samples, format, base, totals = {} } = args
  const start = args.startTime
  if (!start || Number.isNaN(start.getTime())) throw new ImportError('empty', 'sin hora de inicio')
  const stats = samples.length > 1 ? computeStats(samples) : null

  const elapsedS = totals.elapsedS ?? stats?.elapsedS ?? 0
  if (elapsedS <= 0) throw new ImportError('empty', 'sin duración')

  const pick = <K extends keyof ActivitySummary>(k: K, fromStats: ActivitySummary[K] | null | undefined) =>
    (totals[k] ?? fromStats ?? null) as ActivitySummary[K]

  const distanceM = pick('distanceM', stats?.distanceM)
  const movingS = pick('movingS', stats?.movingS)
  const summary = emptySummary({
    ...base,
    startTime: start.toISOString(),
    elapsedS: Math.round(elapsedS),
    movingS: movingS !== null ? Math.round(movingS) : null,
    distanceM,
    elevationGainM: pick('elevationGainM', stats?.elevationGainM),
    avgHr: pick('avgHr', stats?.avgHr),
    maxHr: pick('maxHr', stats?.maxHr),
    avgPowerW: pick('avgPowerW', stats?.avgPowerW),
    normalizedPowerW: pick('normalizedPowerW', stats?.normalizedPowerW),
    avgCadence: pick('avgCadence', stats?.avgCadence),
    hrSamples: stats?.hrSamples ?? 0,
    powerSamples: stats?.powerSamples ?? 0,
    gpsPoints: stats?.gpsPoints ?? 0,
    hrHistogram: stats?.hrHistogram ?? null,
    powerHistogram: stats?.powerHistogram ?? null,
    powerCurve: stats?.powerCurve ?? null,
  })
  summary.hasHr = summary.hrSamples > 10 || (summary.avgHr !== null && summary.hrSamples > 0)
  summary.hasPower = summary.powerSamples > 10 && (summary.avgPowerW ?? 0) > 0
  summary.hasGps = summary.gpsPoints > 10
  summary.hasCadence = summary.avgCadence !== null
  const dur = summary.movingS || summary.elapsedS
  summary.avgSpeedMs = distanceM && dur ? Math.round((distanceM / dur) * 1000) / 1000 : null

  return {
    summary,
    streams: samples.length > 1 ? downsample(samples) : null,
    format,
    originHint: args.originHint ?? 'device_file',
  }
}
