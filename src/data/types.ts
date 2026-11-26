import type { OriginHint, Provider, SourceFormat, Sport, SubSport } from '../core/activity/types'
import type { TriLegs, TriPreset } from '../core/triathlon'
import type { MatchDeltas, MatchedBy, MergedActivity, SourceLike } from '../core/dedupe'
import type { Streams } from '../core/activity/types'
import type { Availability, Block, Phase, SessionDraft, SessionKind, WeekNote } from '../core/planner/plan'
import type { ChangeReason } from '../core/planner/adapt'
import type { AiPayload, Menu } from '../../supabase/functions/_shared/menu.ts'

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
  // Solo resultados de laboratorio
  labKey?: string // examen del catálogo (ausente si es un examen propio)
  value?: number
  unit?: string
  refLow?: number | null // rango que trae el laboratorio
  refHigh?: number | null
}
export interface HealthRecord {
  id: string
  category: HealthCategory
  recordedOn: string | null
  data: HealthData
}

export type DietType = 'omnivore' | 'vegetarian' | 'vegan'
export type NutritionGoal = 'maintain' | 'lose' | 'gain' | 'perform'
export type Budget = 'low' | 'medium' | 'high'
/** Perfil de alimentación: lo escribe la persona; es lo único personal que llega a la IA. */
export interface NutritionPrefs {
  dietType: DietType
  excludedFoods: string[]
  goal: NutritionGoal
  foodAllergies: string[]
  mealsPerDay: number
  cookingMinutes: number
  budget: Budget
  pantry: string[]
}
export const DEFAULT_NUTRITION: NutritionPrefs = {
  dietType: 'omnivore',
  excludedFoods: [],
  goal: 'perform',
  foodAllergies: [],
  mealsPerDay: 4,
  cookingMinutes: 30,
  budget: 'medium',
  pantry: [],
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
  streamsExpireAt?: string | null
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

/** Deporte de una meta: los de las actividades o triatlón (natación + bici + running) */
export type GoalSport = Sport | 'triathlon'

export interface Goal {
  id: string
  name: string
  sport: GoalSport
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
  /** Solo triatlón: distancia del catálogo y tramos */
  triPreset?: TriPreset | null
  legs?: TriLegs | null
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
  /** Solo datos de Strava: fecha en que se deben borrar */
  streamsExpireAt?: string | null
}

export type { Streams }

// ---------------------------------------------------------------------------
// Fase 2: plan de entrenamiento y Strava
// ---------------------------------------------------------------------------

export type { Availability }

export interface StoredWeek {
  planId: string
  weekStart: string
  phase: Phase
  goalId: string | null
  targetLoad: number
  notes: WeekNote[]
}

export interface StoredSession {
  id: string
  planId: string
  goalId: string | null
  date: string
  sport: Sport
  kind: SessionKind
  durationMin: number
  plannedLoad: number
  blocks: Block[]
  phase: Phase | null
  note: SessionDraft['note'] | null
}

export interface StoredPlan {
  id: string
  reason: ChangeReason
  inputsHash: string | null
  createdAt: string
}

export interface PlanChangeRecord {
  id: string
  planId: string
  reason: string
  params: Record<string, number | string>
  createdAt: string
}

export interface CurrentPlan {
  plan: StoredPlan | null
  weeks: StoredWeek[]
  sessions: StoredSession[]
}

export interface InboxItem {
  id: string
  provider: 'strava' | 'garmin_api'
  externalId: string
  event: 'create' | 'update' | 'delete'
  payload: unknown
  receivedAt: string
}

// ---------------------------------------------------------------------------
// Fase 3: menús y recomendaciones
// ---------------------------------------------------------------------------

export type { Menu, MenuDay, MenuMeal, MenuItem, MenuRequest, MenuDayTarget, AiPayload } from '../../supabase/functions/_shared/menu.ts'

export interface MealPlan {
  id: string
  weekStart: string
  /** Exactamente lo que se envió a la IA */
  inputs: AiPayload
  menu: Menu
  model: string
  createdAt: string
  updatedAt: string
}

export interface RecommendationState {
  ruleKey: string
  reaction: 'ok' | 'not_applicable'
  dismissedUntil: string
}

/** «¿Cómo te sientes hoy?»: un registro por día (solo lo ve la persona; nunca va a la IA) */
export const CHECKIN_TAGS = ['slept_bad', 'tired_legs', 'stress', 'energized', 'sick'] as const
export type CheckinTag = (typeof CHECKIN_TAGS)[number]
export interface DailyCheckin {
  day: string
  /** 1 = muy mal … 5 = muy bien */
  feeling: 1 | 2 | 3 | 4 | 5
  tags: CheckinTag[]
  updatedAt: string
}
