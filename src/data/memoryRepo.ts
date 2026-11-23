import type { MatchDeltas, MatchedBy, MergedActivity } from '../core/dedupe'
import { pairKey } from '../core/dedupe'
import type { Repo } from './repo'
import type {
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
} from './types'

/**
 * Repositorio en memoria. Se usa:
 *   - en el «modo local» (sin Supabase): los datos quedan solo en este navegador;
 *   - en las pruebas automáticas.
 * Opcionalmente persiste en localStorage.
 */

interface State {
  profile: Profile
  weights: WeightEntry[]
  physiology: PhysiologyEntry[]
  nutrition: NutritionPrefs | null
  consents: Consent[]
  health: HealthRecord[]
  connections: Connection[]
  activities: Omit<Activity, 'sources'>[]
  sources: StoredSource[]
  streams: Record<string, Streams>
  merges: MergeRecord[]
  notDup: string[]
  jobs: ImportJob[]
  items: ImportItem[]
  goals: Goal[]
  pauses: Pause[]
}

const now = () => new Date().toISOString()
const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)

function initial(): State {
  return {
    profile: {
      displayName: null,
      birthDate: null,
      sexForFormulas: null,
      heightCm: null,
      theme: 'system',
      adultConfirmed: false,
      onboardingStep: 0,
      onboardingDone: false,
    },
    weights: [],
    physiology: [],
    nutrition: null,
    consents: [],
    health: [],
    connections: [
      { provider: 'file', status: 'active', lastSyncAt: null, lastError: null },
      { provider: 'manual', status: 'active', lastSyncAt: null, lastError: null },
      { provider: 'strava', status: 'not_available', lastSyncAt: null, lastError: null },
      { provider: 'garmin_api', status: 'not_available', lastSyncAt: null, lastError: null },
    ],
    activities: [],
    sources: [],
    streams: {},
    merges: [],
    notDup: [],
    jobs: [],
    items: [],
    goals: [],
    pauses: [],
  }
}

const clone = <T,>(x: T): T => structuredClone(x)

export class MemoryRepo implements Repo {
  readonly kind = 'memory' as const
  private s: State
  private storageKey: string | null

  constructor(opts: { storageKey?: string } = {}) {
    this.storageKey = opts.storageKey ?? null
    this.s = initial()
    if (this.storageKey) {
      try {
        const raw = localStorage.getItem(this.storageKey)
        if (raw) this.s = { ...initial(), ...JSON.parse(raw) }
      } catch {
        /* sin almacenamiento: queda en memoria */
      }
    }
  }

  private save() {
    if (!this.storageKey) return
    try {
      // Las series pesan mucho: en modo local no se guardan en el navegador.
      localStorage.setItem(this.storageKey, JSON.stringify({ ...this.s, streams: {} }))
    } catch {
      /* cuota llena o sin almacenamiento */
    }
  }

  private async done<T>(v: T): Promise<T> {
    this.save()
    return clone(v)
  }

  // ---- Perfil
  async getProfile() {
    return clone(this.s.profile)
  }
  async updateProfile(patch: Partial<Profile>) {
    this.s.profile = { ...this.s.profile, ...patch }
    await this.done(null)
  }
  async listWeights() {
    return clone([...this.s.weights].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn)))
  }
  async saveWeight(e: Omit<WeightEntry, 'id'>) {
    this.s.weights = this.s.weights.filter((w) => w.measuredOn !== e.measuredOn)
    this.s.weights.push({ ...e, id: uid() })
    await this.done(null)
  }
  async deleteWeight(id: string) {
    this.s.weights = this.s.weights.filter((w) => w.id !== id)
    await this.done(null)
  }
  async listPhysiology() {
    return clone([...this.s.physiology].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)))
  }
  async savePhysiology(e: Omit<PhysiologyEntry, 'id'>) {
    this.s.physiology = this.s.physiology.filter((p) => p.effectiveFrom !== e.effectiveFrom)
    this.s.physiology.push({ ...e, id: uid() })
    await this.done(null)
  }
  async deletePhysiology(id: string) {
    this.s.physiology = this.s.physiology.filter((p) => p.id !== id)
    await this.done(null)
  }
  async getNutrition() {
    return clone(this.s.nutrition)
  }
  async saveNutrition(p: NutritionPrefs) {
    this.s.nutrition = p
    await this.done(null)
  }

  // ---- Consentimiento y salud
  async listConsents() {
    return clone(this.s.consents)
  }
  async grantConsent(type: ConsentType, version: string) {
    this.s.consents.push({ id: uid(), type, version, grantedAt: now(), revokedAt: null })
    await this.done(null)
  }
  async revokeConsent(type: ConsentType) {
    for (const c of this.s.consents) if (c.type === type && !c.revokedAt) c.revokedAt = now()
    await this.done(null)
  }
  private hasHealthConsent() {
    return this.s.consents.some((c) => c.type === 'health_data' && !c.revokedAt)
  }
  async listHealth() {
    return clone(this.s.health)
  }
  async saveHealth(rec: { id?: string; category: HealthCategory; recordedOn: string | null; data: HealthData }) {
    if (!this.hasHealthConsent()) throw new Error('consent_required')
    if (rec.id) this.s.health = this.s.health.filter((h) => h.id !== rec.id)
    this.s.health.push({ id: rec.id ?? uid(), category: rec.category, recordedOn: rec.recordedOn, data: rec.data })
    await this.done(null)
  }
  async deleteHealth(id: string) {
    this.s.health = this.s.health.filter((h) => h.id !== id)
    await this.done(null)
  }
  async deleteAllHealth() {
    this.s.health = []
    await this.done(null)
  }

  // ---- Conexiones
  async listConnections() {
    return clone(this.s.connections)
  }
  async touchConnection(provider: Connection['provider']) {
    const c = this.s.connections.find((x) => x.provider === provider)
    if (c) {
      c.lastSyncAt = now()
      c.lastError = null
    }
    await this.done(null)
  }

  // ---- Actividades
  private withSources(a: Omit<Activity, 'sources'>): Activity {
    return { ...a, sources: this.s.sources.filter((s) => s.activityId === a.id) }
  }
  async listActivities() {
    return clone(
      [...this.s.activities].sort((a, b) => b.startTime.localeCompare(a.startTime)).map((a) => this.withSources(a)),
    )
  }
  async getActivity(id: string) {
    const a = this.s.activities.find((x) => x.id === id)
    if (!a) return null
    return clone({ activity: this.withSources(a), merges: this.s.merges.filter((m) => m.activityId === id) })
  }
  async updateActivity(id: string, patch: Partial<Activity>) {
    const a = this.s.activities.find((x) => x.id === id)
    if (a) Object.assign(a, patch)
    await this.done(null)
  }
  async deleteActivity(id: string) {
    const ids = new Set(this.s.sources.filter((s) => s.activityId === id).map((s) => s.id))
    this.s.activities = this.s.activities.filter((a) => a.id !== id)
    this.s.sources = this.s.sources.filter((s) => s.activityId !== id)
    this.s.merges = this.s.merges.filter((m) => m.activityId !== id)
    this.s.notDup = this.s.notDup.filter((p) => !p.split('|').some((x) => ids.has(x)))
    await this.done(null)
  }
  async getStreams(source: StoredSource) {
    return clone(this.s.streams[source.id] ?? null)
  }

  async findSourceByIdentity(hash: string | null, externalId: string | null) {
    const s = this.s.sources.find((x) => (hash && (x as StoredSource & { fileSha256?: string }).fileSha256 === hash) || (externalId && x.externalId === externalId))
    return s ? { sourceId: s.id, activityId: s.activityId } : null
  }
  async activitiesNear(startIso: string, windowS: number) {
    const t = Date.parse(startIso)
    const ids = new Set(
      this.s.sources.filter((s) => Math.abs(Date.parse(s.startTime) - t) <= windowS * 1000).map((s) => s.activityId),
    )
    return clone(this.s.activities.filter((a) => ids.has(a.id)).map((a) => this.withSources(a)))
  }
  async createActivity(m: Omit<MergedActivity, 'primarySourceId' | 'powerSourceId' | 'hrSourceId' | 'gpsSourceId' | 'cadenceSourceId'>, isDemo: boolean) {
    const id = uid()
    this.s.activities.push({
      ...m,
      id,
      rpeIsEstimated: false,
      notes: null,
      isDemo,
      primarySourceId: '',
      powerSourceId: null,
      hrSourceId: null,
      gpsSourceId: null,
      cadenceSourceId: null,
    })
    return this.done(id)
  }
  async insertSource(activityId: string, src: NewSource) {
    const id = uid()
    this.s.sources.push({
      ...src,
      id,
      activityId,
      importedAt: now(),
      streamsPath: null,
      retentionClass: src.retentionClass ?? 'owned',
    } as StoredSource)
    return this.done(id)
  }
  async moveSource(sourceId: string, toActivityId: string) {
    const s = this.s.sources.find((x) => x.id === sourceId)
    if (s) s.activityId = toActivityId
    await this.done(null)
  }
  async updateCanonical(activityId: string, m: MergedActivity) {
    const a = this.s.activities.find((x) => x.id === activityId)
    if (a) {
      const keepRpe = a.rpe
      Object.assign(a, m)
      a.rpe = keepRpe ?? m.rpe
    }
    await this.done(null)
  }
  async saveStreams(sourceId: string, streams: Streams) {
    this.s.streams[sourceId] = streams
    const s = this.s.sources.find((x) => x.id === sourceId)
    if (s) s.streamsPath = `memoria/${sourceId}`
    return s?.streamsPath ?? null
  }
  async insertMerge(activityId: string, sourceId: string, matchedBy: MatchedBy | 'user', deltas: MatchDeltas) {
    this.s.merges.push({ id: uid(), activityId, sourceId, matchedBy, deltas, createdAt: now(), undoneAt: null })
    await this.done(null)
  }
  async markMergesUndone(activityId: string, sourceId: string) {
    for (const m of this.s.merges) if (m.activityId === activityId && m.sourceId === sourceId && !m.undoneAt) m.undoneAt = now()
    await this.done(null)
  }
  async listNotDuplicatePairs() {
    return new Set(this.s.notDup)
  }
  async addNotDuplicatePair(a: string, b: string) {
    this.s.notDup.push(pairKey(a, b))
    await this.done(null)
  }

  // ---- Trabajos de importación
  async createJob(kind: ImportKind, total: number) {
    const id = uid()
    this.s.jobs.push({ id, kind, status: 'running', total, processed: 0, imported: 0, merged: 0, duplicates: 0, failed: 0, startedAt: now(), finishedAt: null })
    return this.done(id)
  }
  async updateJob(id: string, patch: Partial<ImportJob>) {
    const j = this.s.jobs.find((x) => x.id === id)
    if (j) Object.assign(j, patch)
    await this.done(null)
  }
  async addJobItem(jobId: string, filename: string, status: ImportItemStatus, errorCode: string | null) {
    this.s.items.push({ id: uid(), jobId, filename, status, errorCode, createdAt: now() })
    await this.done(null)
  }
  async listJobs() {
    return clone([...this.s.jobs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)))
  }
  async listJobItems(jobId: string) {
    return clone(this.s.items.filter((i) => i.jobId === jobId))
  }

  // ---- Metas y pausas
  async listGoals() {
    return clone([...this.s.goals].sort((a, b) => a.eventDate.localeCompare(b.eventDate)))
  }
  async getGoal(id: string) {
    return clone(this.s.goals.find((g) => g.id === id) ?? null)
  }
  async saveGoal(g: Omit<Goal, 'id'> & { id?: string }) {
    const id = g.id ?? uid()
    this.s.goals = this.s.goals.filter((x) => x.id !== id)
    this.s.goals.push({ ...g, id })
    return this.done(id)
  }
  async deleteGoal(id: string) {
    this.s.goals = this.s.goals.filter((g) => g.id !== id)
    await this.done(null)
  }
  async listPauses() {
    return clone([...this.s.pauses].sort((a, b) => a.startsOn.localeCompare(b.startsOn)))
  }
  async savePause(p: Omit<Pause, 'id'> & { id?: string }) {
    const id = p.id ?? uid()
    this.s.pauses = this.s.pauses.filter((x) => x.id !== id)
    this.s.pauses.push({ ...p, id })
    await this.done(null)
  }
  async deletePause(id: string) {
    this.s.pauses = this.s.pauses.filter((p) => p.id !== id)
    await this.done(null)
  }

  // ---- Demo y cuenta
  async clearDemoData() {
    const demoActs = new Set(this.s.activities.filter((a) => a.isDemo).map((a) => a.id))
    for (const id of demoActs) await this.deleteActivity(id)
    this.s.goals = this.s.goals.filter((g) => !g.isDemo)
    this.s.pauses = this.s.pauses.filter((p) => !p.isDemo)
    this.s.physiology = this.s.physiology.filter((p) => !p.isDemo)
    this.s.weights = this.s.weights.filter((w) => !w.isDemo)
    this.s.jobs = this.s.jobs.filter((j) => j.kind !== 'demo')
    await this.done(null)
  }
  async deleteAccount() {
    this.s = initial()
    if (this.storageKey) {
      try {
        localStorage.removeItem(this.storageKey)
      } catch {
        /* nada */
      }
    }
  }
}
