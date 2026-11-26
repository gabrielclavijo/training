import { costUsd, priceFor } from '../../../supabase/functions/_shared/pricing.ts'
import { bogotaDay, buildStats, type RawAi, type RawUsage } from '../../../supabase/functions/_shared/adminStats.ts'

describe('costo de la IA', () => {
  it('usa la tarifa de Claude Opus 5.5 ($4 / $20 por millón)', () => {
    expect(costUsd('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(4)
    expect(costUsd('claude-opus-5-5', { input_tokens: 3000, output_tokens: 8000 })).toBeCloseTo(0.012 + 0.16)
  })
  it('cobra caché y reconoce modelos con sufijo o desconocidos', () => {
    expect(costUsd('claude-opus-5-5', { cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.2)
    expect(costUsd('claude-opus-5-5', { cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(5)
    expect(priceFor('claude-sonnet-5-5-20261101').input).toBe(2)
    expect(priceFor('modelo-raro').input).toBe(4)
  })
})

describe('panel de administración', () => {
  const now = new Date('2026-11-26T15:00:00Z') // 10:00 en Colombia
  const today = bogotaDay(now)
  const users = [
    { id: 'a', email: 'ana@x.co', name: 'Ana', provider: 'google', createdAt: '2026-11-25T12:00:00Z', lastSignInAt: null },
    { id: 'b', email: 'beto@x.co', name: null, provider: 'email', createdAt: '2026-10-01T12:00:00Z', lastSignInAt: '2026-11-01T12:00:00Z' },
  ]
  const usage: RawUsage[] = [
    { userId: 'a', day: today, seconds: 600, visits: 2, lastSeenAt: '2026-11-26T14:58:00Z' },
    { userId: 'a', day: '2026-11-24', seconds: 1200, visits: 1, lastSeenAt: '2026-11-24T20:00:00Z' },
    { userId: 'b', day: '2026-11-22', seconds: 300, visits: 1, lastSeenAt: '2026-11-22T20:00:00Z' },
  ]
  const ai: RawAi[] = [
    {
      userId: 'a',
      kind: 'menu',
      createdAt: '2026-11-25T18:00:00Z',
      costUsd: 0.18,
      inputTokens: 3000,
      outputTokens: 8000,
      counted: true,
      model: 'claude-opus-5-5',
    },
    {
      userId: 'a',
      kind: 'swap',
      createdAt: '2026-11-25T18:10:00Z',
      costUsd: 0.02,
      inputTokens: 900,
      outputTokens: 800,
      counted: true,
      model: 'claude-opus-5-5',
    },
    {
      userId: 'a',
      kind: 'menu',
      createdAt: '2026-11-26T14:00:00Z',
      costUsd: 0.05,
      inputTokens: 3000,
      outputTokens: 1500,
      counted: false,
      model: 'claude-opus-5-5',
    },
  ]
  const s = buildStats({
    now,
    users,
    usage,
    ai,
    topups: [{ id: 't', amountUsd: 5, note: null, toppedOn: '2026-11-20' }],
    thresholdUsd: 2,
    activitiesByUser: { a: 12 },
    stravaUsers: ['a'],
  })

  it('cuenta registrados, nuevos y por forma de entrar', () => {
    expect(s.users).toEqual({ total: 2, new7d: 1, byProvider: { google: 1, email: 1 } })
  })
  it('conectado = señal en los últimos 5 minutos', () => {
    expect(s.activity.onlineNow).toBe(1)
    expect(s.people[0]).toMatchObject({ id: 'a', online: true, minutes7d: 30, days7d: 2, activities: 12, menus30d: 1, swaps30d: 1, strava: true })
    expect(s.people[1]).toMatchObject({ name: 'beto', online: false, minutes7d: 5 })
  })
  it('minutos y activos de hoy y de la semana', () => {
    expect(s.activity).toMatchObject({ activeToday: 1, active7d: 2, minutesToday: 10, minutes7d: 35, visits7d: 4 })
    expect(s.series).toHaveLength(30)
    expect(s.series.at(-1)).toMatchObject({ day: today, activeUsers: 1, minutes: 10 })
  })
  it('costo, intentos fallidos y saldo', () => {
    expect(s.ai).toMatchObject({ monthMenus: 1, monthSwaps: 1, monthFailed: 1, toppedUpUsd: 5, balanceUsd: 4.75, level: 'good' })
    expect(s.ai.totalCostUsd).toBeCloseTo(0.25)
    expect(s.ai.avgCostPerMenuUsd).toBeCloseTo(0.18)
    expect(s.ai.daysLeft).toBeGreaterThan(100)
  })
  it('semáforo del saldo: amarillo bajo el umbral, rojo sin saldo', () => {
    const low = buildStats({
      now,
      users,
      usage,
      ai,
      topups: [{ id: 't', amountUsd: 1, note: null, toppedOn: '2026-11-20' }],
      thresholdUsd: 2,
      activitiesByUser: {},
      stravaUsers: [],
    })
    expect(low.ai.level).toBe('caution')
    const none = buildStats({
      now,
      users,
      usage,
      ai,
      topups: [{ id: 't', amountUsd: 0.1, note: null, toppedOn: '2026-11-20' }],
      thresholdUsd: 2,
      activitiesByUser: {},
      stravaUsers: [],
    })
    expect(none.ai.level).toBe('alert')
  })
})
