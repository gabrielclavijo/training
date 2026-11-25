import type { SupabaseClient } from '@supabase/supabase-js'
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate'
import type { MatchDeltas, MatchedBy, MergedActivity } from '../core/dedupe'
import { pairKey } from '../core/dedupe'
import type { Repo } from './repo'
import type { PlanChange } from '../core/planner/adapt'
import type { WeekDraft } from '../core/planner/plan'
import { weekStart } from '../core/dates'
import type {
  Availability,
  CurrentPlan,
  InboxItem,
  PlanChangeRecord,
  StoredSession,
  StoredWeek,
  Activity,
  Connection,
  ConsentType,
  Goal,
  GoalStage,
  HealthCategory,
  HealthData,
  HealthRecord,
  ImportItemStatus,
  ImportJob,
  ImportKind,
  NewSource,
  NutritionPrefs,
  MealPlan,
  MenuRequest,
  RecommendationState,
  Pause,
  PhysiologyEntry,
  Profile,
  StoredSource,
  Streams,
  WeightEntry,
} from './types'
import { DEFAULT_NUTRITION } from './types'
import type { AdminStats } from '../../supabase/functions/_shared/adminStats.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

/** Lanza un error legible si Supabase respondió con error. */
function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

const SOURCE_COLUMNS =
  'id, activity_id, provider, source_format, origin_hint, external_id, device_serial, file_sha256, streams_expire_at, original_filename, sport, sub_sport, raw_sport, title, start_time, timezone, elapsed_s, moving_s, distance_m, elevation_gain_m, avg_hr, max_hr, avg_power_w, normalized_power_w, avg_cadence, has_power, has_hr, has_gps, has_cadence, hr_samples, power_samples, gps_points, hr_histogram, power_histogram, power_curve, streams_path, retention_class, imported_at'

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function toSource(r: Row): StoredSource {
  return {
    id: r.id,
    activityId: r.activity_id,
    provider: r.provider,
    format: r.source_format,
    originHint: r.origin_hint,
    retentionClass: r.retention_class,
    sport: r.sport,
    subSport: r.sub_sport,
    rawSport: r.raw_sport,
    title: r.title,
    startTime: r.start_time,
    timezone: r.timezone,
    elapsedS: r.elapsed_s,
    movingS: r.moving_s,
    distanceM: n(r.distance_m),
    elevationGainM: n(r.elevation_gain_m),
    avgHr: r.avg_hr,
    maxHr: r.max_hr,
    avgPowerW: r.avg_power_w,
    normalizedPowerW: r.normalized_power_w,
    avgCadence: r.avg_cadence,
    hasPower: r.has_power,
    hasHr: r.has_hr,
    hasGps: r.has_gps,
    hasCadence: r.has_cadence,
    hrSamples: r.hr_samples,
    powerSamples: r.power_samples,
    gpsPoints: r.gps_points,
    deviceSerial: r.device_serial,
    externalId: r.external_id,
    fileSha256: r.file_sha256,
    streamsExpireAt: r.streams_expire_at,
    rpe: null,
    originalFilename: r.original_filename,
    importedAt: r.imported_at,
    hrHistogram: r.hr_histogram,
    powerHistogram: r.power_histogram,
    powerCurve: r.power_curve,
    streamsPath: r.streams_path,
  }
}

function toActivity(r: Row): Activity {
  return {
    id: r.id,
    sport: r.sport,
    subSport: r.sub_sport,
    title: r.title,
    startTime: r.start_time,
    timezone: r.timezone,
    elapsedS: r.elapsed_s,
    movingS: r.moving_s,
    distanceM: n(r.distance_m),
    elevationGainM: n(r.elevation_gain_m),
    avgHr: r.avg_hr,
    maxHr: r.max_hr,
    avgPowerW: r.avg_power_w,
    normalizedPowerW: r.normalized_power_w,
    avgCadence: r.avg_cadence,
    avgSpeedMs: n(r.avg_speed_ms),
    hasPower: r.has_power,
    hasHr: r.has_hr,
    hasGps: r.has_gps,
    hasCadence: r.has_cadence,
    rpe: r.rpe,
    rpeIsEstimated: r.rpe_is_estimated,
    notes: r.notes,
    isDemo: r.is_demo,
    primarySourceId: r.primary_source_id,
    powerSourceId: r.power_source_id,
    hrSourceId: r.hr_source_id,
    gpsSourceId: r.gps_source_id,
    cadenceSourceId: r.cadence_source_id,
    sources: (r.activity_sources ?? []).map(toSource),
  }
}

function canonicalRow(m: Partial<MergedActivity>): Row {
  const row: Row = {
    sport: m.sport,
    sub_sport: m.subSport,
    title: m.title,
    start_time: m.startTime,
    timezone: m.timezone,
    elapsed_s: m.elapsedS,
    moving_s: m.movingS,
    distance_m: m.distanceM,
    elevation_gain_m: m.elevationGainM,
    avg_hr: m.avgHr,
    max_hr: m.maxHr,
    avg_power_w: m.avgPowerW,
    normalized_power_w: m.normalizedPowerW,
    avg_cadence: m.avgCadence,
    avg_speed_ms: m.avgSpeedMs,
    has_power: m.hasPower,
    has_hr: m.hasHr,
    has_gps: m.hasGps,
    has_cadence: m.hasCadence,
    primary_source_id: m.primarySourceId,
    power_source_id: m.powerSourceId,
    hr_source_id: m.hrSourceId,
    gps_source_id: m.gpsSourceId,
    cadence_source_id: m.cadenceSourceId,
  }
  for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k]
  return row
}

const toGoal = (r: Row): Goal => ({
  id: r.id,
  name: r.name,
  sport: r.sport,
  subSport: r.sub_sport,
  eventDate: r.event_date,
  priority: r.priority,
  goalType: r.goal_type,
  objective: r.objective,
  targetTimeS: r.target_time_s,
  distanceM: n(r.distance_m),
  elevationGainM: n(r.elevation_gain_m),
  terrain: r.terrain,
  maxAltitudeM: n(r.max_altitude_m),
  gpxPath: r.gpx_path,
  notes: r.notes,
  status: r.status,
  isDemo: r.is_demo,
  stages: ((r.goal_stages ?? []) as Row[])
    .map(
      (s): GoalStage => ({
        stageNumber: s.stage_number,
        dayOffset: s.day_offset,
        distanceM: Number(s.distance_m),
        elevationGainM: Number(s.elevation_gain_m),
        terrain: s.terrain,
        targetTimeS: s.target_time_s,
      }),
    )
    .sort((a, b) => a.stageNumber - b.stageNumber),
})

export class SupabaseRepo implements Repo {
  readonly kind = 'supabase' as const
  private sb: SupabaseClient
  private userId: string
  constructor(sb: SupabaseClient, userId: string) {
    this.sb = sb
    this.userId = userId
  }

  // ---- Perfil
  async getProfile(): Promise<Profile> {
    const r = check(await this.sb.from('profiles').select('*').eq('user_id', this.userId).single()) as Row
    return {
      displayName: r.display_name,
      birthDate: r.birth_date,
      sexForFormulas: r.sex_for_formulas,
      heightCm: n(r.height_cm),
      theme: r.theme,
      adultConfirmed: r.adult_confirmed,
      onboardingStep: r.onboarding_step,
      onboardingDone: Boolean(r.onboarding_done_at),
    }
  }
  async updateProfile(p: Partial<Profile>) {
    const row: Row = {
      display_name: p.displayName,
      birth_date: p.birthDate,
      sex_for_formulas: p.sexForFormulas,
      height_cm: p.heightCm,
      theme: p.theme,
      adult_confirmed: p.adultConfirmed,
      onboarding_step: p.onboardingStep,
      onboarding_done_at: p.onboardingDone === undefined ? undefined : p.onboardingDone ? new Date().toISOString() : null,
    }
    for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k]
    check(await this.sb.from('profiles').update(row).eq('user_id', this.userId))
  }
  async listWeights(): Promise<WeightEntry[]> {
    const rows = check(await this.sb.from('body_measurements').select('*').order('measured_on')) as Row[]
    return rows.map((r) => ({ id: r.id, measuredOn: r.measured_on, weightKg: Number(r.weight_kg), isDemo: r.is_demo }))
  }
  async saveWeight(e: Omit<WeightEntry, 'id'>) {
    check(
      await this.sb
        .from('body_measurements')
        .upsert({ measured_on: e.measuredOn, weight_kg: e.weightKg, is_demo: e.isDemo ?? false }, { onConflict: 'user_id,measured_on' }),
    )
  }
  async deleteWeight(id: string) {
    check(await this.sb.from('body_measurements').delete().eq('id', id))
  }
  async listPhysiology(): Promise<PhysiologyEntry[]> {
    const rows = check(await this.sb.from('physiology_settings').select('*').order('effective_from')) as Row[]
    return rows.map((r) => ({
      id: r.id,
      effectiveFrom: r.effective_from,
      hrRest: r.hr_rest,
      hrMax: r.hr_max,
      hrMaxSource: r.hr_max_source,
      hrThreshold: r.hr_threshold,
      ftpW: r.ftp_w,
      runThresholdSPerKm: n(r.run_threshold_s_per_km),
      swimThresholdSPer100m: n(r.swim_threshold_s_per_100m),
      isDemo: r.is_demo,
    }))
  }
  async savePhysiology(e: Omit<PhysiologyEntry, 'id'>) {
    check(
      await this.sb.from('physiology_settings').upsert(
        {
          effective_from: e.effectiveFrom,
          hr_rest: e.hrRest,
          hr_max: e.hrMax,
          hr_max_source: e.hrMax ? (e.hrMaxSource ?? 'measured') : null,
          hr_threshold: e.hrThreshold,
          ftp_w: e.ftpW,
          run_threshold_s_per_km: e.runThresholdSPerKm,
          swim_threshold_s_per_100m: e.swimThresholdSPer100m,
          is_demo: e.isDemo ?? false,
        },
        { onConflict: 'user_id,effective_from' },
      ),
    )
  }
  async deletePhysiology(id: string) {
    check(await this.sb.from('physiology_settings').delete().eq('id', id))
  }
  // ---- Foto de perfil (bucket privado avatars/{user_id}/avatar.jpg)
  private get avatarPath() {
    return `${this.userId}/avatar.jpg`
  }
  async getAvatarUrl(): Promise<string | null> {
    const { data } = await this.sb.storage.from('avatars').list(this.userId, { search: 'avatar.jpg', limit: 1 })
    const file = data?.find((f) => f.name === 'avatar.jpg')
    if (!file) return null
    const { data: signed, error } = await this.sb.storage.from('avatars').createSignedUrl(this.avatarPath, 3600)
    if (error || !signed) return null
    // El parámetro evita ver la foto anterior guardada en caché
    return `${signed.signedUrl}&v=${encodeURIComponent(file.updated_at ?? '')}`
  }
  async saveAvatar(jpeg: Blob) {
    const { error } = await this.sb.storage.from('avatars').upload(this.avatarPath, jpeg, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
    if (error) throw new Error(error.message)
  }
  async deleteAvatar() {
    const { error } = await this.sb.storage.from('avatars').remove([this.avatarPath])
    if (error) throw new Error(error.message)
  }

  async getNutrition(): Promise<NutritionPrefs | null> {
    const r = check(await this.sb.from('nutrition_preferences').select('*').maybeSingle()) as Row | null
    return r
      ? {
          dietType: r.diet_type,
          excludedFoods: r.excluded_foods ?? [],
          goal: r.goal ?? DEFAULT_NUTRITION.goal,
          foodAllergies: r.food_allergies ?? [],
          mealsPerDay: r.meals_per_day ?? DEFAULT_NUTRITION.mealsPerDay,
          cookingMinutes: r.cooking_minutes ?? DEFAULT_NUTRITION.cookingMinutes,
          budget: r.budget ?? DEFAULT_NUTRITION.budget,
          pantry: r.pantry ?? [],
        }
      : null
  }
  async saveNutrition(p: NutritionPrefs) {
    check(
      await this.sb.from('nutrition_preferences').upsert({
        diet_type: p.dietType,
        excluded_foods: p.excludedFoods,
        goal: p.goal,
        food_allergies: p.foodAllergies,
        meals_per_day: p.mealsPerDay,
        cooking_minutes: p.cookingMinutes,
        budget: p.budget,
        pantry: p.pantry,
      }),
    )
  }

  // ---- Consentimiento y salud
  async listConsents() {
    const rows = check(await this.sb.from('consents').select('*').order('granted_at')) as Row[]
    return rows.map((r) => ({ id: r.id, type: r.consent_type, version: r.policy_version, grantedAt: r.granted_at, revokedAt: r.revoked_at }))
  }
  async grantConsent(type: ConsentType, version: string) {
    check(await this.sb.from('consents').insert({ consent_type: type, policy_version: version }))
  }
  async revokeConsent(type: ConsentType) {
    check(
      await this.sb.from('consents').update({ revoked_at: new Date().toISOString() }).eq('consent_type', type).is('revoked_at', null),
    )
  }
  /** Los datos de salud pasan SIEMPRE por la Edge Function que cifra y descifra. */
  private async health<T>(body: Row): Promise<T> {
    const { data, error } = await this.sb.functions.invoke('health-crypto', { body })
    if (error) throw new Error(error.message)
    return data as T
  }
  async listHealth() {
    const res = await this.health<{ records: HealthRecord[] }>({ action: 'list' })
    return res.records
  }
  async saveHealth(rec: { id?: string; category: HealthCategory; recordedOn: string | null; data: HealthData }) {
    await this.health({ action: 'save', record: rec })
  }
  async deleteHealth(id: string) {
    check(await this.sb.from('health_records').delete().eq('id', id))
  }
  async deleteAllHealth() {
    check(await this.sb.from('health_records').delete().eq('user_id', this.userId))
  }

  // ---- Conexiones
  async listConnections(): Promise<Connection[]> {
    const rows = check(await this.sb.from('connections').select('*')) as Row[]
    return rows.map((r) => ({ provider: r.provider, status: r.status, lastSyncAt: r.last_sync_at, lastError: r.last_error }))
  }
  async touchConnection(provider: Connection['provider']) {
    check(await this.sb.from('connections').update({ last_sync_at: new Date().toISOString(), last_error: null }).eq('provider', provider))
  }

  // ---- Actividades
  async listActivities() {
    const out: Activity[] = []
    // Paginado: PostgREST devuelve como máximo 1.000 filas por consulta
    for (let from = 0; ; from += 500) {
      const rows = check(
        await this.sb
          .from('activities')
          .select(`*, activity_sources!activity_sources_activity_id_user_id_fkey(${SOURCE_COLUMNS})`)
          .order('start_time', { ascending: false })
          .range(from, from + 499),
      ) as Row[]
      out.push(...rows.map(toActivity))
      if (rows.length < 500) break
    }
    return out
  }
  async getActivity(id: string) {
    const r = check(
      await this.sb
        .from('activities')
        .select(`*, activity_sources!activity_sources_activity_id_user_id_fkey(${SOURCE_COLUMNS})`)
        .eq('id', id)
        .maybeSingle(),
    ) as Row | null
    if (!r) return null
    const merges = check(await this.sb.from('activity_merges').select('*').eq('activity_id', id).order('created_at')) as Row[]
    return {
      activity: toActivity(r),
      merges: merges.map((m) => ({
        id: m.id,
        activityId: m.activity_id,
        sourceId: m.source_id,
        matchedBy: m.matched_by,
        deltas: m.deltas,
        createdAt: m.created_at,
        undoneAt: m.undone_at,
      })),
    }
  }
  async updateActivity(id: string, p: Partial<Activity>) {
    const row: Row = { rpe: p.rpe, rpe_is_estimated: p.rpeIsEstimated, title: p.title, notes: p.notes, sport: p.sport, sub_sport: p.subSport }
    for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k]
    check(await this.sb.from('activities').update(row).eq('id', id))
  }
  async deleteActivity(id: string) {
    const rows = check(await this.sb.from('activity_sources').select('streams_path').eq('activity_id', id)) as Row[]
    const paths = rows.map((r) => r.streams_path).filter(Boolean)
    if (paths.length) await this.sb.storage.from('activity-streams').remove(paths)
    check(await this.sb.from('activities').delete().eq('id', id))
  }
  async getStreams(source: StoredSource): Promise<Streams | null> {
    if (!source.streamsPath) return null
    const { data, error } = await this.sb.storage.from('activity-streams').download(source.streamsPath)
    if (error || !data) return null
    return JSON.parse(strFromU8(gunzipSync(new Uint8Array(await data.arrayBuffer()))))
  }

  async findSourceByIdentity(hash: string | null, externalId: string | null) {
    const filters = [hash ? `file_sha256.eq.${hash}` : null, externalId ? `external_id.eq.${externalId}` : null].filter(Boolean)
    if (filters.length === 0) return null
    const rows = check(await this.sb.from('activity_sources').select('id, activity_id').or(filters.join(',')).limit(1)) as Row[]
    return rows[0] ? { sourceId: rows[0].id, activityId: rows[0].activity_id } : null
  }
  async activitiesNear(startIso: string, windowS: number) {
    const t = Date.parse(startIso)
    const from = new Date(t - windowS * 1000).toISOString()
    const to = new Date(t + windowS * 1000).toISOString()
    const ids = check(await this.sb.from('activity_sources').select('activity_id').gte('start_time', from).lte('start_time', to)) as Row[]
    const unique = [...new Set(ids.map((r) => r.activity_id))]
    if (unique.length === 0) return []
    const rows = check(
      await this.sb
        .from('activities')
        .select(`*, activity_sources!activity_sources_activity_id_user_id_fkey(${SOURCE_COLUMNS})`)
        .in('id', unique),
    ) as Row[]
    return rows.map(toActivity)
  }
  async createActivity(m: Omit<MergedActivity, 'primarySourceId' | 'powerSourceId' | 'hrSourceId' | 'gpsSourceId' | 'cadenceSourceId'>, isDemo: boolean) {
    const row = { ...canonicalRow(m), rpe: m.rpe, is_demo: isDemo }
    const r = check(await this.sb.from('activities').insert(row).select('id').single()) as Row
    return r.id as string
  }
  async insertSource(activityId: string, s: NewSource) {
    const r = check(
      await this.sb
        .from('activity_sources')
        .insert({
          activity_id: activityId,
          provider: s.provider,
          source_format: s.format,
          origin_hint: s.originHint,
          external_id: s.externalId,
          device_serial: s.deviceSerial,
          file_sha256: s.fileSha256,
          original_filename: s.originalFilename,
          sport: s.sport,
          sub_sport: s.subSport,
          raw_sport: s.rawSport,
          title: s.title,
          start_time: s.startTime,
          timezone: s.timezone ?? null,
          elapsed_s: s.elapsedS,
          moving_s: s.movingS,
          distance_m: s.distanceM,
          elevation_gain_m: s.elevationGainM,
          avg_hr: s.avgHr,
          max_hr: s.maxHr,
          avg_power_w: s.avgPowerW,
          normalized_power_w: s.normalizedPowerW,
          avg_cadence: s.avgCadence,
          has_power: s.hasPower,
          has_hr: s.hasHr,
          has_gps: s.hasGps,
          has_cadence: s.hasCadence,
          hr_samples: s.hrSamples,
          power_samples: s.powerSamples,
          gps_points: s.gpsPoints,
          hr_histogram: s.hrHistogram,
          power_histogram: s.powerHistogram,
          power_curve: s.powerCurve,
          retention_class: s.retentionClass ?? 'owned',
          streams_expire_at: s.streamsExpireAt ?? null,
          ai_allowed: (s.retentionClass ?? 'owned') === 'owned',
          import_job_id: s.importJobId,
          is_demo: s.isDemo,
        })
        .select('id')
        .single(),
    ) as Row
    return r.id as string
  }
  async moveSource(sourceId: string, toActivityId: string) {
    check(await this.sb.from('activity_sources').update({ activity_id: toActivityId }).eq('id', sourceId))
  }
  async updateCanonical(activityId: string, m: MergedActivity) {
    const current = check(await this.sb.from('activities').select('rpe').eq('id', activityId).single()) as Row
    check(await this.sb.from('activities').update({ ...canonicalRow(m), rpe: current.rpe ?? m.rpe }).eq('id', activityId))
  }
  async saveStreams(sourceId: string, streams: Streams) {
    const path = `${this.userId}/${sourceId}.json.gz`
    const body = gzipSync(strToU8(JSON.stringify(streams)))
    const { error } = await this.sb.storage
      .from('activity-streams')
      .upload(path, new Blob([body as BlobPart], { type: 'application/gzip' }), { upsert: true })
    if (error) return null
    check(await this.sb.from('activity_sources').update({ streams_path: path }).eq('id', sourceId))
    return path
  }
  async insertMerge(activityId: string, sourceId: string, matchedBy: MatchedBy | 'user', deltas: MatchDeltas) {
    check(await this.sb.from('activity_merges').insert({ activity_id: activityId, source_id: sourceId, matched_by: matchedBy, deltas }))
  }
  async markMergesUndone(activityId: string, sourceId: string) {
    check(
      await this.sb
        .from('activity_merges')
        .update({ undone_at: new Date().toISOString() })
        .eq('activity_id', activityId)
        .eq('source_id', sourceId)
        .is('undone_at', null),
    )
  }
  async listNotDuplicatePairs() {
    const rows = check(await this.sb.from('activity_not_duplicates').select('source_a, source_b')) as Row[]
    return new Set(rows.map((r) => pairKey(r.source_a, r.source_b)))
  }
  async addNotDuplicatePair(a: string, b: string) {
    const [x, y] = a < b ? [a, b] : [b, a]
    check(await this.sb.from('activity_not_duplicates').upsert({ source_a: x, source_b: y }))
  }

  // ---- Trabajos de importación
  async createJob(kind: ImportKind, total: number) {
    const r = check(await this.sb.from('import_jobs').insert({ kind, total }).select('id').single()) as Row
    return r.id as string
  }
  async updateJob(id: string, p: Partial<ImportJob>) {
    const row: Row = {
      status: p.status,
      total: p.total,
      processed: p.processed,
      imported: p.imported,
      merged: p.merged,
      duplicates: p.duplicates,
      failed: p.failed,
      finished_at: p.finishedAt,
    }
    for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k]
    check(await this.sb.from('import_jobs').update(row).eq('id', id))
  }
  async addJobItem(jobId: string, filename: string, status: ImportItemStatus, errorCode: string | null, sourceId: string | null) {
    check(
      await this.sb
        .from('import_items')
        .insert({ job_id: jobId, filename: filename.slice(0, 300), status, error_code: errorCode, activity_source_id: sourceId }),
    )
  }
  async listJobs(): Promise<ImportJob[]> {
    const rows = check(await this.sb.from('import_jobs').select('*').order('started_at', { ascending: false }).limit(30)) as Row[]
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      total: r.total,
      processed: r.processed,
      imported: r.imported,
      merged: r.merged,
      duplicates: r.duplicates,
      failed: r.failed,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    }))
  }
  async listJobItems(jobId: string) {
    const rows = check(await this.sb.from('import_items').select('*').eq('job_id', jobId).order('created_at')) as Row[]
    return rows.map((r) => ({ id: r.id, jobId: r.job_id, filename: r.filename, status: r.status, errorCode: r.error_code, createdAt: r.created_at }))
  }

  // ---- Metas y pausas
  async listGoals() {
    const rows = check(await this.sb.from('goals').select('*, goal_stages(*)').order('event_date')) as Row[]
    return rows.map(toGoal)
  }
  async getGoal(id: string) {
    const r = check(await this.sb.from('goals').select('*, goal_stages(*)').eq('id', id).maybeSingle()) as Row | null
    return r ? toGoal(r) : null
  }
  async saveGoal(g: Omit<Goal, 'id'> & { id?: string }) {
    const row: Row = {
      name: g.name,
      sport: g.sport,
      sub_sport: g.subSport,
      event_date: g.eventDate,
      priority: g.priority,
      goal_type: g.goalType,
      objective: g.objective,
      target_time_s: g.objective === 'time' ? g.targetTimeS : null,
      distance_m: g.distanceM,
      elevation_gain_m: g.elevationGainM,
      terrain: g.terrain,
      max_altitude_m: g.maxAltitudeM,
      gpx_path: g.gpxPath,
      notes: g.notes,
      status: g.status,
      is_demo: g.isDemo ?? false,
    }
    let id = g.id
    if (id) check(await this.sb.from('goals').update(row).eq('id', id))
    else id = (check(await this.sb.from('goals').insert(row).select('id').single()) as Row).id as string
    check(await this.sb.from('goal_stages').delete().eq('goal_id', id))
    if (g.goalType === 'stage' && g.stages.length) {
      check(
        await this.sb.from('goal_stages').insert(
          g.stages.map((s) => ({
            goal_id: id,
            stage_number: s.stageNumber,
            day_offset: s.dayOffset,
            distance_m: s.distanceM,
            elevation_gain_m: s.elevationGainM,
            terrain: s.terrain,
            target_time_s: s.targetTimeS,
          })),
        ),
      )
    }
    return id!
  }
  async deleteGoal(id: string) {
    check(await this.sb.from('goals').delete().eq('id', id))
  }
  async listPauses(): Promise<Pause[]> {
    const rows = check(await this.sb.from('pauses').select('*').order('starts_on')) as Row[]
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      canTrain: r.can_train,
      available: r.available,
      minutesPerDay: r.minutes_per_day,
      notes: r.notes,
      isDemo: r.is_demo,
    }))
  }
  async savePause(p: Omit<Pause, 'id'> & { id?: string }) {
    const row = {
      kind: p.kind,
      starts_on: p.startsOn,
      ends_on: p.endsOn,
      can_train: p.canTrain,
      available: p.available,
      minutes_per_day: p.minutesPerDay,
      notes: p.notes,
      is_demo: p.isDemo ?? false,
    }
    if (p.id) check(await this.sb.from('pauses').update(row).eq('id', p.id))
    else check(await this.sb.from('pauses').insert(row))
  }
  async deletePause(id: string) {
    check(await this.sb.from('pauses').delete().eq('id', id))
  }

  // ---- Plan
  async getAvailability(): Promise<Availability | null> {
    const r = check(await this.sb.from('training_availability').select('*').maybeSingle()) as Row | null
    if (!r) return null
    const m: Row = r.minutes_by_day ?? {}
    const minutesByDay = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, Number(m[d] ?? 0)])) as Availability['minutesByDay']
    return { minutesByDay, longDay: r.long_day }
  }
  async saveAvailability(a: Availability) {
    check(await this.sb.from('training_availability').upsert({ minutes_by_day: a.minutesByDay, long_day: a.longDay, updated_at: new Date().toISOString() }))
  }
  async getCurrentPlan(): Promise<CurrentPlan> {
    const plans = check(await this.sb.from('training_plans').select('*').order('created_at', { ascending: false }).limit(1)) as Row[]
    const weeks = check(await this.sb.from('plan_weeks').select('*').order('week_start')) as Row[]
    const sessions: Row[] = []
    for (let from = 0; ; from += 1000) {
      const page = check(await this.sb.from('planned_sessions').select('*').order('date').range(from, from + 999)) as Row[]
      sessions.push(...page)
      if (page.length < 1000) break
    }
    const p = plans[0]
    return {
      plan: p ? { id: p.id, reason: p.reason, inputsHash: p.inputs?.hash ?? null, createdAt: p.created_at } : null,
      weeks: weeks.map(
        (w): StoredWeek => ({ planId: w.plan_id, weekStart: w.week_start, phase: w.phase, goalId: w.goal_id, targetLoad: Number(w.target_load), notes: w.notes ?? [] }),
      ),
      sessions: sessions.map(
        (x): StoredSession => ({
          id: x.id,
          planId: x.plan_id,
          goalId: x.goal_id,
          date: x.date,
          sport: x.sport,
          kind: x.kind,
          durationMin: x.duration_min,
          plannedLoad: Number(x.planned_load),
          blocks: x.structure?.blocks ?? [],
          phase: x.phase,
          note: x.structure?.note ?? null,
        }),
      ),
    }
  }
  async savePlan(args: { reason: PlanChange['reason']; inputsHash: string; weeks: WeekDraft[]; fromDay: string; changes: PlanChange[]; isDemo: boolean }) {
    const plan = check(
      await this.sb.from('training_plans').insert({ reason: args.reason, inputs: { hash: args.inputsHash }, is_demo: args.isDemo }).select('id').single(),
    ) as Row
    const id = plan.id as string
    const ws = weekStart(args.fromDay)
    check(await this.sb.from('plan_weeks').delete().gte('week_start', ws))
    check(await this.sb.from('planned_sessions').delete().gte('date', args.fromDay))
    const weekRows = args.weeks.map((w) => ({
      plan_id: id,
      week_start: w.weekStart,
      phase: w.phase,
      goal_id: w.goalId,
      target_load: w.targetLoad,
      notes: w.notes,
      is_demo: args.isDemo,
    }))
    if (weekRows.length) check(await this.sb.from('plan_weeks').insert(weekRows))
    const sessionRows = args.weeks.flatMap((w) =>
      w.sessions
        .filter((x) => x.date >= args.fromDay)
        .map((x) => ({
          plan_id: id,
          goal_id: x.goalId,
          date: x.date,
          sport: x.sport,
          kind: x.kind,
          duration_min: Math.round(x.durationMin),
          planned_load: x.load,
          structure: { blocks: x.blocks, note: x.note ?? null },
          phase: x.phase,
          is_demo: args.isDemo,
        })),
    )
    for (let i = 0; i < sessionRows.length; i += 500) check(await this.sb.from('planned_sessions').insert(sessionRows.slice(i, i + 500)))
    if (args.changes.length) {
      check(await this.sb.from('plan_changes').insert(args.changes.map((c) => ({ plan_id: id, reason: c.reason, params: c.params, is_demo: args.isDemo }))))
    }
    return id
  }
  async listPlanChanges(limit = 30): Promise<PlanChangeRecord[]> {
    const rows = check(await this.sb.from('plan_changes').select('*').order('created_at', { ascending: false }).limit(limit)) as Row[]
    return rows.map((r) => ({ id: r.id, planId: r.plan_id, reason: r.reason, params: r.params ?? {}, createdAt: r.created_at }))
  }

  // ---- Strava
  async listInbox(): Promise<InboxItem[]> {
    const rows = check(await this.sb.from('provider_inbox').select('*').order('received_at')) as Row[]
    return rows.map((r) => ({ id: r.id, provider: r.provider, externalId: r.external_id, event: r.event, payload: r.payload, receivedAt: r.received_at }))
  }
  async deleteInbox(ids: string[]) {
    if (ids.length) check(await this.sb.from('provider_inbox').delete().in('id', ids))
  }
  async deleteSourceByExternalId(externalId: string) {
    const rows = check(await this.sb.from('activity_sources').select('id, activity_id').eq('external_id', externalId)) as Row[]
    for (const r of rows) {
      check(await this.sb.from('activity_sources').delete().eq('id', r.id))
      const left = check(await this.sb.from('activity_sources').select('id').eq('activity_id', r.activity_id).limit(1)) as Row[]
      if (left.length === 0) check(await this.sb.from('activities').delete().eq('id', r.activity_id))
    }
  }
  private async fn<T>(name: string, body: Row = {}): Promise<T> {
    const { data, error } = await this.sb.functions.invoke(name, { body })
    if (error) {
      // Mensaje del servidor si lo hay
      const ctx = (error as { context?: Response }).context
      let detail = error.message
      try {
        if (ctx) detail = ((await ctx.json()) as { error?: string }).error ?? detail
      } catch {
        /* sin cuerpo */
      }
      throw new Error(detail)
    }
    return data as T
  }
  async stravaConnect(code: string, scope: string) {
    await this.fn('strava-connect', { code, scope })
  }
  async stravaDisconnect() {
    await this.fn('strava-disconnect')
  }
  async stravaSync() {
    return this.fn<{ queued: number }>('strava-sync')
  }

  // ---- Alimentación
  async listMealPlans(): Promise<MealPlan[]> {
    const rows = check(await this.sb.from('meal_plans').select('*').order('week_start', { ascending: false }).limit(20)) as Row[]
    return rows.map(toMealPlan)
  }
  async generateMenu(req: MenuRequest) {
    const res = await this.fn<{ plan: Row }>('nutrition-menu', { action: 'generate', request: req })
    return toMealPlan(res.plan)
  }
  async swapMeal(planId: string, date: string, mealIndex: number) {
    const res = await this.fn<{ plan: Row }>('nutrition-menu', { action: 'swap', planId, date, mealIndex })
    return toMealPlan(res.plan)
  }
  async deleteMealPlan(id: string) {
    check(await this.sb.from('meal_plans').delete().eq('id', id))
  }

  // ---- Recomendaciones
  async listRecommendationState(): Promise<RecommendationState[]> {
    const rows = check(await this.sb.from('recommendation_state').select('*')) as Row[]
    return rows.map((r) => ({ ruleKey: r.rule_key, reaction: r.reaction, dismissedUntil: r.dismissed_until }))
  }
  async dismissRecommendation(ruleKey: string, reaction: RecommendationState['reaction'], until: string) {
    check(await this.sb.from('recommendation_state').upsert({ rule_key: ruleKey, reaction, dismissed_until: until }))
  }

  // ---- Uso y panel de administración
  async trackUsage(seconds: number, newVisit: boolean) {
    const { error } = await this.sb.rpc('track_usage', { p_seconds: Math.round(seconds), p_new_visit: newVisit })
    if (error) throw new Error(error.message)
  }
  async listMyUsage() {
    const rows = check(await this.sb.from('usage_daily').select('day, seconds, visits').order('day')) as Row[]
    return rows.map((r) => ({ day: r.day, seconds: r.seconds, visits: r.visits }))
  }
  async isAdmin() {
    try {
      return (await this.fn<{ admin: boolean }>('admin-stats', { action: 'whoami' })).admin
    } catch {
      return false
    }
  }
  async adminStats() {
    return (await this.fn<{ stats: AdminStats }>('admin-stats', { action: 'stats' })).stats
  }
  async adminAddTopup(amountUsd: number, note: string | null, toppedOn: string) {
    await this.fn('admin-stats', { action: 'topup', amountUsd, note, toppedOn })
  }
  async adminDeleteTopup(id: string) {
    await this.fn('admin-stats', { action: 'deleteTopup', id })
  }
  async adminSetThreshold(usd: number) {
    await this.fn('admin-stats', { action: 'threshold', thresholdUsd: usd })
  }

  // ---- Demo y cuenta
  async clearDemoData() {
    check(await this.sb.from('training_plans').delete().eq('is_demo', true))
    const rows = check(await this.sb.from('activity_sources').select('streams_path').eq('is_demo', true)) as Row[]
    const paths = rows.map((r) => r.streams_path).filter(Boolean)
    if (paths.length) await this.sb.storage.from('activity-streams').remove(paths)
    for (const t of ['activities', 'goals', 'pauses', 'physiology_settings', 'body_measurements', 'seasons']) {
      check(await this.sb.from(t).delete().eq('is_demo', true))
    }
    check(await this.sb.from('import_jobs').delete().eq('kind', 'demo'))
  }
  async deleteAccount() {
    const { error } = await this.sb.functions.invoke('account-delete', { body: { confirm: true } })
    if (error) throw new Error(error.message)
    await this.sb.auth.signOut()
  }
}

function toMealPlan(r: Row): MealPlan {
  return { id: r.id, weekStart: r.week_start, inputs: r.inputs, menu: r.menu, model: r.model, createdAt: r.created_at, updatedAt: r.updated_at ?? r.created_at }
}
