// =============================================================================
// Cálculos del panel de administración, sin dependencias (los usa la función
// admin-stats y la app en modo local / pruebas). Días en hora de Colombia.
// =============================================================================

export interface RawUser {
  id: string
  email: string | null
  name: string | null
  provider: string | null
  createdAt: string
  lastSignInAt: string | null
}
export interface RawUsage {
  userId: string
  day: string
  seconds: number
  visits: number
  lastSeenAt: string
}
export interface RawAi {
  userId: string
  kind: 'menu' | 'swap'
  createdAt: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  counted: boolean
  model: string | null
}
export interface RawTopup {
  id: string
  amountUsd: number
  note: string | null
  toppedOn: string
}

export type Level = 'good' | 'caution' | 'alert'

export interface PersonRow {
  id: string
  name: string
  email: string | null
  provider: string
  createdAt: string
  lastSeenAt: string | null
  online: boolean
  minutes7d: number
  days7d: number
  minutes30d: number
  activities: number
  menus30d: number
  swaps30d: number
  cost30dUsd: number
  strava: boolean
}

export interface DaySeries {
  day: string
  activeUsers: number
  minutes: number
  aiCostUsd: number
  aiRequests: number
}

export interface AdminStats {
  generatedAt: string
  today: string
  users: { total: number; new7d: number; byProvider: Record<string, number> }
  activity: { onlineNow: number; activeToday: number; active7d: number; minutesToday: number; minutes7d: number; avgMinutesPerActive7d: number; visits7d: number }
  ai: {
    monthCostUsd: number
    totalCostUsd: number
    monthMenus: number
    monthSwaps: number
    monthFailed: number
    monthInputTokens: number
    monthOutputTokens: number
    avgCostPerMenuUsd: number | null
    toppedUpUsd: number
    balanceUsd: number
    thresholdUsd: number
    level: Level
    daysLeft: number | null
  }
  series: DaySeries[]
  people: PersonRow[]
  topups: RawTopup[]
}

export const ONLINE_MINUTES = 5

/** Clave de día «AAAA-MM-DD» en hora de Colombia (UTC−5, sin horario de verano). */
export function bogotaDay(d: Date | string | number): string {
  const t = new Date(d).getTime() - 5 * 3600_000
  return new Date(t).toISOString().slice(0, 10)
}
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const round = (x: number, k = 2) => Math.round(x * 10 ** k) / 10 ** k

export function buildStats(args: {
  now: Date
  users: RawUser[]
  usage: RawUsage[]
  ai: RawAi[]
  topups: RawTopup[]
  thresholdUsd: number
  activitiesByUser: Record<string, number>
  stravaUsers: string[]
}): AdminStats {
  const { now, users, usage, ai, topups } = args
  const today = bogotaDay(now)
  const from7 = addDays(today, -6)
  const from30 = addDays(today, -29)
  const month = today.slice(0, 7)
  const onlineSince = now.getTime() - ONLINE_MINUTES * 60_000

  const lastSeen = new Map<string, string>()
  for (const u of usage) if (!lastSeen.has(u.userId) || lastSeen.get(u.userId)! < u.lastSeenAt) lastSeen.set(u.userId, u.lastSeenAt)
  const online = new Set([...lastSeen].filter(([, t]) => Date.parse(t) >= onlineSince).map(([id]) => id))

  const u7 = usage.filter((u) => u.day >= from7 && u.day <= today)
  const uToday = usage.filter((u) => u.day === today)
  const active7 = new Set(u7.map((u) => u.userId))
  const minutes7d = u7.reduce((a, u) => a + u.seconds, 0) / 60

  // Serie de 30 días
  const series: DaySeries[] = []
  for (let d = from30; d <= today; d = addDays(d, 1)) {
    const rows = usage.filter((u) => u.day === d)
    const aiRows = ai.filter((x) => bogotaDay(x.createdAt) === d)
    series.push({
      day: d,
      activeUsers: new Set(rows.map((r) => r.userId)).size,
      minutes: round(rows.reduce((a, r) => a + r.seconds, 0) / 60, 1),
      aiCostUsd: round(aiRows.reduce((a, r) => a + r.costUsd, 0), 4),
      aiRequests: aiRows.length,
    })
  }

  // IA
  const aiMonth = ai.filter((x) => bogotaDay(x.createdAt).startsWith(month))
  const monthCost = aiMonth.reduce((a, x) => a + x.costUsd, 0)
  const totalCost = ai.reduce((a, x) => a + x.costUsd, 0)
  const okMenus = ai.filter((x) => x.kind === 'menu' && x.counted && x.costUsd > 0)
  const toppedUp = topups.reduce((a, t) => a + t.amountUsd, 0)
  const balance = toppedUp - totalCost
  const level: Level = toppedUp === 0 ? 'caution' : balance <= 0 ? 'alert' : balance <= args.thresholdUsd ? 'caution' : 'good'
  // Gasto diario promedio de los últimos 30 días → días que alcanza el saldo
  const spent30 = ai.filter((x) => bogotaDay(x.createdAt) >= from30).reduce((a, x) => a + x.costUsd, 0)
  const perDay = spent30 / 30
  const daysLeft = perDay > 0 && balance > 0 ? Math.floor(balance / perDay) : null

  const byProvider: Record<string, number> = {}
  for (const u of users) {
    const k = u.provider ?? 'email'
    byProvider[k] = (byProvider[k] ?? 0) + 1
  }

  const people: PersonRow[] = users
    .map((u) => {
      const mine = usage.filter((x) => x.userId === u.id)
      const mine7 = mine.filter((x) => x.day >= from7)
      const mineAi = ai.filter((x) => x.userId === u.id && bogotaDay(x.createdAt) >= from30)
      return {
        id: u.id,
        name: u.name || (u.email ? u.email.split('@')[0] : 'Sin nombre'),
        email: u.email,
        provider: u.provider ?? 'email',
        createdAt: u.createdAt,
        lastSeenAt: lastSeen.get(u.id) ?? u.lastSignInAt,
        online: online.has(u.id),
        minutes7d: round(mine7.reduce((a, x) => a + x.seconds, 0) / 60, 0),
        days7d: mine7.length,
        minutes30d: round(mine.filter((x) => x.day >= from30).reduce((a, x) => a + x.seconds, 0) / 60, 0),
        activities: args.activitiesByUser[u.id] ?? 0,
        menus30d: mineAi.filter((x) => x.kind === 'menu' && x.counted).length,
        swaps30d: mineAi.filter((x) => x.kind === 'swap' && x.counted).length,
        cost30dUsd: round(mineAi.reduce((a, x) => a + x.costUsd, 0), 4),
        strava: args.stravaUsers.includes(u.id),
      }
    })
    .sort((a, b) => Number(b.online) - Number(a.online) || (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''))

  return {
    generatedAt: now.toISOString(),
    today,
    users: { total: users.length, new7d: users.filter((u) => bogotaDay(u.createdAt) >= from7).length, byProvider },
    activity: {
      onlineNow: online.size,
      activeToday: new Set(uToday.map((u) => u.userId)).size,
      active7d: active7.size,
      minutesToday: round(uToday.reduce((a, u) => a + u.seconds, 0) / 60, 0),
      minutes7d: round(minutes7d, 0),
      avgMinutesPerActive7d: active7.size ? round(minutes7d / active7.size, 0) : 0,
      visits7d: u7.reduce((a, u) => a + u.visits, 0),
    },
    ai: {
      monthCostUsd: round(monthCost, 4),
      totalCostUsd: round(totalCost, 4),
      monthMenus: aiMonth.filter((x) => x.kind === 'menu' && x.counted).length,
      monthSwaps: aiMonth.filter((x) => x.kind === 'swap' && x.counted).length,
      monthFailed: aiMonth.filter((x) => !x.counted).length,
      monthInputTokens: aiMonth.reduce((a, x) => a + x.inputTokens, 0),
      monthOutputTokens: aiMonth.reduce((a, x) => a + x.outputTokens, 0),
      avgCostPerMenuUsd: okMenus.length ? round(okMenus.reduce((a, x) => a + x.costUsd, 0) / okMenus.length, 4) : null,
      toppedUpUsd: round(toppedUp, 2),
      balanceUsd: round(balance, 2),
      thresholdUsd: args.thresholdUsd,
      level,
      daysLeft,
    },
    series,
    people,
    topups: [...topups].sort((a, b) => b.toppedOn.localeCompare(a.toppedOn)),
  }
}
