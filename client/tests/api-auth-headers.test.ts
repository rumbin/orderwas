import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Regression test: when both waiter and admin JWTs exist in the session store,
 * the waiter token MUST be used for API requests (not the admin token).
 *
 * Previously, `adminAuthHeaders()` was spread AFTER `authHeaders()` in the
 * request function, causing the admin JWT to silently override the waiter JWT.
 * This broke payment collection (Kassieren) because the admin token lacks the
 * `canCashOut` permission.
 */

const WAITER_TOKEN = 'waiter-jwt-token-abc123'
const ADMIN_TOKEN = 'admin-jwt-token-xyz789'

// Capture the Authorization header sent by fetch
let capturedAuthHeader: string | undefined

beforeEach(() => {
  capturedAuthHeader = undefined
  // Mock fetch to capture the Authorization header
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      capturedAuthHeader = (init?.headers as Record<string, string>)?.Authorization
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

function setSession(overrides: { token?: string; adminToken?: string }) {
  const state: Record<string, unknown> = {
    event: null,
    waiter: null,
    token: overrides.token ?? null,
    adminToken: overrides.adminToken ?? null,
  }
  localStorage.setItem('orderwas-session', JSON.stringify({ state, version: 0 }))
}

describe('API auth header priority', () => {
  it('uses waiter token when only waiter token is set', async () => {
    setSession({ token: WAITER_TOKEN })

    const { api } = await import('@/api/client')
    // getOpenTables is a GET that goes through request()
    await api.getOpenTables('evt-1')

    expect(capturedAuthHeader).toBe(`Bearer ${WAITER_TOKEN}`)
  })

  it('uses admin token when only admin token is set', async () => {
    setSession({ adminToken: ADMIN_TOKEN })

    const { api } = await import('@/api/client')
    await api.getOpenTables('evt-1')

    expect(capturedAuthHeader).toBe(`Bearer ${ADMIN_TOKEN}`)
  })

  it('prefers waiter token when BOTH tokens are set (regression: admin override)', async () => {
    setSession({ token: WAITER_TOKEN, adminToken: ADMIN_TOKEN })

    const { api } = await import('@/api/client')
    await api.getOpenTables('evt-1')

    expect(capturedAuthHeader).toBe(`Bearer ${WAITER_TOKEN}`)
  })
})
