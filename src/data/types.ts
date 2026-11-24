import type { OriginHint, Provider, SourceFormat, Sport, SubSport } from '../core/activity/types'
import type { MatchDeltas, MatchedBy, MergedActivity, SourceLike } from '../core/dedupe'
import type { Streams } from '../core/activity/types'

/** Modelos de dominio (camelCase). La capa de datos convierte desde/hacia las tablas. */

export type ThemePref = 'light' | 'dark' | 'system'
export type SexForFormulas = 'female' | 'male'

export interface Profile {
  displayName: string | null
  birthDate: string | null
  sexForFormulas: SexForFormulas | null
  heightCm: number | null
  theme: ThemePref
  adultConfirmed: boolean
  onboardingStep: number
  onboardingDone: boolean
}

export interface WeightEntry {
  id: string
  measuredOn: string
  weightKg: number
  isDemo?: boolean
}

export interface PhysiologyEntry {
  id: string
  effectiveFrom: string
  hrRest: number | null
  hrMax: number | null
  hrMaxSource: 'measured' | 'estimated' | null
  hrThreshold: number | null
  ftpW: number | null
  runThresholdSPerKm: number | null
  swimThresholdSPer100m: number | null
  isDemo?: boolean
}

export type ConsentType = 'privacy_policy' | 'health_data'
export interface Consent {
  id: string
  type: ConsentType
  version: string
  grantedAt: string
  revokedAt: string | null
}

export type HealthCategory = 'medication' | 'allergy' | 'lab_result'
/** Contenido de un registro de salud (se guarda cifrado). */
export interface HealthData {
  name: string
  notes?: string
  affectsHeartRate?: boolean // medicamentos como los betabloqueantes
}
export interface HealthRecord {
  id: string
  category: HealthCategory
  recordedOn: string | null
  data: HealthData
}

export type DietType = 'omnivore' | 'vegetarian' | 'vegan'
export interface NutritionPrefs {
  dietType: DietType
  excludedFoods: string[]
}

export type ConnectionStatus = 'active' | 'disabled' | 'error' | 'not_available'
export interface Connection {
  provider: Provider
  status: ConnectionStatus
  lastSyncAt: string | null
  lastError: string | null
}

/** Una fuente guardada (una llegada de la actividad). */
export interface StoredSource extends SourceLike {
  activityId: string
  originalFilename: string | null
  importedAt: string
  hrHistogram: [number, number][] | null
  powerHistogram: [number, number][] | null
  powerCurve: Record<string, number> | null
  streamsPath: string | null
  rawSport: string | null
  fileSha256?: string | null
}

export interface Activity extends Omit<MergedActivity, 'rpe'> {
  id: string
  rpe: number | null
  rpeIsEstimated: boolean
  notes: string | null
  isDemo: boolean
  sources: StoredSource[]
}

export interface MergeRecord {
  id: string
  activityId: string
  sourceId: string
  matchedBy: MatchedBy | 'user'
  deltas: MatchDeltas
  createdAt: string
  undoneAt: string | null
}

export type Terrain = 'paved' | 'unpaved' | 'mixed' | 'technical' | 'track' | 'pool' | 'open_water'

export interface GoalStage {
  stageNumber: number
  dayOffset: number
  distanceM: number
  elevationGainM: number
  terrain: Terrain | null
  targetTimeS: number | null
}

export interface Goal {
  id: string
  name: string
  sport: Sport
  subSport: SubSport | null
  eventDate: string
  priority: 'primary' | 'secondary'
  goalType: 'single' | 'stage'
  objective: 'finish' | 'time'
  targetTimeS: number | null
  distanceM: number | null
  elevationGainM: number | null
  terrain: Terrain | null
  maxAltitudeM: number | null
  gpxPath: string | null
  notes: string | null
  status: 'active' | 'done' | 'cancelled'
  isDemo?: boolean
  stages: GoalStage[]
}

export type PauseKind = 'illness' | 'injury' | 'travel' | 'vacation' | 'other'
export type PauseAvailability = 'bike' | 'run' | 'gym' | 'pool' | 'none'
export interface Pause {
  id: string
  kind: PauseKind
  startsOn: string
  endsOn: string | null
  canTrain: boolean | null
  available: PauseAvailability[]
  minutesPerDay: number | null
  notes: string | null
  isDemo?: boolean
}

export type ImportKind = 'files' | 'strava_archive' | 'garmin_archive' | 'provider_sync' | 'demo'
export interface ImportJob {
  id: string
  kind: ImportKind
  status: 'running' | 'done' | 'failed' | 'cancelled'
  total: number
  processed: number
  imported: number
  merged: number
  duplicates: number
  failed: number
  startedAt: string
  finishedAt: string | null
}
export type ImportItemStatus = 'imported' | 'merged' | 'duplicate' | 'skipped' | 'error'
export interface ImportItem {
  id: string
  jobId: string
  filename: string
  status: ImportItemStatus
  errorCode: string | null
  createdAt: string
}

/** Fuente nueva lista para guardar. */
export interface NewSource extends Omit<SourceLike, 'id'> {
  originalFilename: string | null
  fileSha256: string | null
  rawSport: string | null
  hrHistogram: [number, number][] | null
  powerHistogram: [number, number][] | null
  powerCurve: Record<string, number> | null
  originHint: OriginHint
  format: SourceFormat
  isDemo: boolean
  importJobId: string | null
}

export type { Streams }
