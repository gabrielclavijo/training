import type { MatchDeltas, MatchedBy, MergedActivity } from '../core/dedupe'
import type { WeekDraft } from '../core/planner/plan'
import type { PlanChange } from '../core/planner/adapt'
import type {
  Availability,
  CurrentPlan,
  InboxItem,
  PlanChangeRecord,
  Activity,
  Connection,
  Consent,
  ConsentType,
  Goal,
  HealthCategory,
  HealthData,
  HealthRecord,
  ImportItem,
  ImportItemStatus,
  ImportJob,
  ImportKind,
  MergeRecord,
  NewSource,
  NutritionPrefs,
  Pause,
  PhysiologyEntry,
  Profile,
  StoredSource,
  Streams,
  WeightEntry,
  MealPlan,
  MenuRequest,
  RecommendationState,
  DailyCheckin,
} from './types'
import type { AdminStats } from '../../supabase/functions/_shared/adminStats.ts'

/**
 * Contrato de acceso a datos. Hay dos implementaciones:
 *   - SupabaseRepo: la real (RLS filtra todo por usuario).
 *   - MemoryRepo: en memoria, para desarrollo sin backend y pruebas automáticas.
 */
export interface Repo {
  readonly kind: 'supabase' | 'memory'

  // Perfil
  getProfile(): Promise<Profile>
  updateProfile(patch: Partial<Profile>): Promise<void>
  listWeights(): Promise<WeightEntry[]>
  saveWeight(entry: Omit<WeightEntry, 'id'>): Promise<void>
  deleteWeight(id: string): Promise<void>
  listPhysiology(): Promise<PhysiologyEntry[]>
  savePhysiology(entry: Omit<PhysiologyEntry, 'id'>): Promise<void>
  deletePhysiology(id: string): Promise<void>
  /** Foto de perfil: dirección temporal para mostrarla, o null si no hay foto */
  getAvatarUrl(): Promise<string | null>
  /** Guarda la foto (JPEG ya recortado a 256×256 en el navegador) */
  saveAvatar(jpeg: Blob): Promise<void>
  deleteAvatar(): Promise<void>
  getNutrition(): Promise<NutritionPrefs | null>
  saveNutrition(prefs: NutritionPrefs): Promise<void>

  // Consentimientos y salud (cifrado en el servidor)
  listConsents(): Promise<Consent[]>
  grantConsent(type: ConsentType, version: string): Promise<void>
  revokeConsent(type: ConsentType): Promise<void>
  listHealth(): Promise<HealthRecord[]>
  saveHealth(rec: { id?: string; category: HealthCategory; recordedOn: string | null; data: HealthData }): Promise<void>
  deleteHealth(id: string): Promise<void>
  deleteAllHealth(): Promise<void>

  // Conexiones
  listConnections(): Promise<Connection[]>
  touchConnection(provider: Connection['provider']): Promise<void>

  // Actividades
  listActivities(): Promise<Activity[]>
  getActivity(id: string): Promise<{ activity: Activity; merges: MergeRecord[] } | null>
  updateActivity(id: string, patch: Partial<Pick<Activity, 'rpe' | 'rpeIsEstimated' | 'title' | 'notes' | 'sport' | 'subSport'>>): Promise<void>
  deleteActivity(id: string): Promise<void>
  getStreams(source: StoredSource): Promise<Streams | null>

  // Primitivas para la importación y la fusión
  findSourceByIdentity(fileSha256: string | null, externalId: string | null): Promise<{ sourceId: string; activityId: string } | null>
  activitiesNear(startIso: string, windowS: number): Promise<Activity[]>
  createActivity(merged: Omit<MergedActivity, 'primarySourceId' | 'powerSourceId' | 'hrSourceId' | 'gpsSourceId' | 'cadenceSourceId'>, isDemo: boolean): Promise<string>
  insertSource(activityId: string, src: NewSource): Promise<string>
  moveSource(sourceId: string, toActivityId: string): Promise<void>
  updateCanonical(activityId: string, merged: MergedActivity): Promise<void>
  saveStreams(sourceId: string, streams: Streams): Promise<string | null>
  insertMerge(activityId: string, sourceId: string, matchedBy: MatchedBy | 'user', deltas: MatchDeltas): Promise<void>
  markMergesUndone(activityId: string, sourceId: string): Promise<void>
  listNotDuplicatePairs(): Promise<Set<string>>
  addNotDuplicatePair(a: string, b: string): Promise<void>

  // Trabajos de importación
  createJob(kind: ImportKind, total: number): Promise<string>
  updateJob(id: string, patch: Partial<Omit<ImportJob, 'id' | 'kind' | 'startedAt'>>): Promise<void>
  addJobItem(jobId: string, filename: string, status: ImportItemStatus, errorCode: string | null, sourceId: string | null): Promise<void>
  listJobs(): Promise<ImportJob[]>
  listJobItems(jobId: string): Promise<ImportItem[]>

  // Metas y pausas
  listGoals(): Promise<Goal[]>
  getGoal(id: string): Promise<Goal | null>
  saveGoal(goal: Omit<Goal, 'id'> & { id?: string }): Promise<string>
  deleteGoal(id: string): Promise<void>
  listPauses(): Promise<Pause[]>
  savePause(p: Omit<Pause, 'id'> & { id?: string }): Promise<void>
  deletePause(id: string): Promise<void>

  // Plan de entrenamiento (fase 2)
  getAvailability(): Promise<Availability | null>
  saveAvailability(a: Availability): Promise<void>
  getCurrentPlan(): Promise<CurrentPlan>
  /** Guarda una versión nueva: reemplaza semanas desde la semana de `fromDay` y sesiones desde `fromDay`. */
  savePlan(args: { reason: PlanChange['reason']; inputsHash: string; weeks: WeekDraft[]; fromDay: string; changes: PlanChange[]; isDemo: boolean }): Promise<string>
  listPlanChanges(limit?: number): Promise<PlanChangeRecord[]>

  // Strava (bandeja de entrada del webhook y conexión)
  listInbox(): Promise<InboxItem[]>
  deleteInbox(ids: string[]): Promise<void>
  deleteSourceByExternalId(externalId: string): Promise<void>
  stravaConnect(code: string, scope: string): Promise<void>
  stravaDisconnect(): Promise<void>
  stravaSync(): Promise<{ queued: number }>

  // Alimentación (fase 3): los menús los arma la IA en el servidor
  listMealPlans(): Promise<MealPlan[]>
  generateMenu(req: MenuRequest): Promise<MealPlan>
  swapMeal(planId: string, date: string, mealIndex: number): Promise<MealPlan>
  deleteMealPlan(id: string): Promise<void>

  // Recomendaciones ocultadas por la persona
  listRecommendationState(): Promise<RecommendationState[]>
  dismissRecommendation(ruleKey: string, reaction: RecommendationState['reaction'], until: string): Promise<void>

  // «¿Cómo te sientes hoy?»
  /** Registros de los últimos `days` días (por defecto, todos) */
  listCheckins(days?: number): Promise<DailyCheckin[]>
  saveCheckin(c: Omit<DailyCheckin, 'updatedAt'>): Promise<void>
  deleteCheckin(day: string): Promise<void>

  // Uso de la app y panel de administración
  /** Señal de uso (cada minuto con la app a la vista) */
  trackUsage(seconds: number, newVisit: boolean): Promise<void>
  /** Mis datos de uso (para «Exportar mis datos») */
  listMyUsage(): Promise<{ day: string; seconds: number; visits: number }[]>
  isAdmin(): Promise<boolean>
  adminStats(): Promise<AdminStats>
  adminAddTopup(amountUsd: number, note: string | null, toppedOn: string): Promise<void>
  adminDeleteTopup(id: string): Promise<void>
  adminSetThreshold(usd: number): Promise<void>

  // Datos de prueba y cuenta
  clearDemoData(): Promise<void>
  deleteAccount(): Promise<void>
}
