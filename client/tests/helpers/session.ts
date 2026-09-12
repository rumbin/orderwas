import { vi } from 'vitest'
import type { Event, Waiter } from '@/api/types'

/**
 * Identity-stable session-store mock for client tests.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 * A mocked zustand store MUST return the SAME object references across calls.
 * Building the state inside the mock factory (`() => ({ event: {...} })`)
 * returns a fresh `event` object on every render, so every `[event]`-keyed
 * effect sees "changed" deps and re-runs. Combined with the `setState` those
 * effects perform, that is a self-sustaining async loop which outlives the test
 * and starves the vitest worker — the suite hangs with no output (exit 124).
 *
 * This module keeps one state object at module scope; tests change it through
 * the mutators below, which mirror real store updates (new reference ONCE, then
 * stable again).
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 * ```ts
 * vi.mock('@/stores/session', async () => {
 *   const { useSessionStoreMock } = await import('./helpers/session')
 *   return { useSessionStore: useSessionStoreMock }
 * })
 *
 * beforeEach(() => resetSessionState({ waiter: makeWaiter({ isCounter: true }) }))
 * ```
 * (The `await import` inside the factory is required: `vi.mock` is hoisted
 * above the test file's imports, so the factory may not close over them.)
 */

const BASE_DATE = '2026-01-01T00:00:00.000Z'

export function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-1',
    name: 'Testfest',
    status: 'test',
    hidePrices: false,
    tseEnabled: false,
    counterEnabled: false,
    lastTearOffNumber: 0,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    ...overrides,
  }
}

export function makeWaiter(overrides: Partial<Waiter> = {}): Waiter {
  return {
    id: 'w-1',
    name: 'Alice',
    logo: null,
    eventId: 'evt-1',
    printerId: null,
    pickupCode: null,
    printsImmediately: true,
    canCancel: false,
    canCashOut: false,
    canStatistics: false,
    canCreateWaiters: false,
    canTransfer: false,
    isStationWaiter: false,
    isCounter: false,
    hidden: false,
    autoSammelbon: false,
    active: true,
    ...overrides,
  }
}

/** The counter (Theke) login identity used by the counter flows. */
export function makeCounterWaiter(overrides: Partial<Waiter> = {}): Waiter {
  return makeWaiter({ id: 'w-theke', name: 'Theke', isCounter: true, canCashOut: true, canCancel: true, ...overrides })
}

export interface SessionState {
  event: Event | null
  waiter: Waiter | null
  token: string | null
  adminToken: string | null
  setEvent: ReturnType<typeof vi.fn>
  setWaiter: ReturnType<typeof vi.fn>
  setToken: ReturnType<typeof vi.fn>
  setAdminToken: ReturnType<typeof vi.fn>
  setSession: ReturnType<typeof vi.fn>
  clear: ReturnType<typeof vi.fn>
  isLoggedIn: () => boolean
  isAdminLoggedIn: () => boolean
}

/** Created once per test file — its identity must never change. */
const state: SessionState = {
  event: makeEvent(),
  waiter: makeWaiter(),
  token: 'fake-token',
  adminToken: null,
  setEvent: vi.fn(),
  setWaiter: vi.fn(),
  setToken: vi.fn(),
  setAdminToken: vi.fn(),
  setSession: vi.fn(),
  clear: vi.fn(),
  // Mirrors the real store: `Boolean(token && waiter)`.
  isLoggedIn: () => Boolean(state.token && state.waiter),
  isAdminLoggedIn: () => Boolean(state.adminToken),
}

/** Drop-in replacement for `useSessionStore(ctx.store)`. */
export function useSessionStoreMock<T>(selector?: (s: SessionState) => T): SessionState | T {
  return selector ? selector(state) : state
}

/** The live state object (for assertions on `setEvent` etc. or extra mutation). */
export function sessionState(): SessionState {
  return state
}

/**
 * Resets the stable state between tests. Mutates in place on purpose: the
 * object identity stays the same, so a mounted component is not surprised by a
 * brand-new store object.
 */
export function resetSessionState(overrides: {
  event?: Event | null
  waiter?: Waiter | null
  token?: string | null
  adminToken?: string | null
} = {}): SessionState {
  state.event = overrides.event === undefined ? makeEvent() : overrides.event
  state.waiter = overrides.waiter === undefined ? makeWaiter() : overrides.waiter
  state.token = overrides.token === undefined ? 'fake-token' : overrides.token
  state.adminToken = overrides.adminToken === undefined ? null : overrides.adminToken

  for (const fn of [state.setEvent, state.setWaiter, state.setToken, state.setAdminToken, state.setSession, state.clear]) {
    fn.mockReset()
  }
  return state
}
