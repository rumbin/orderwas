import type { APIRequestContext, Page } from '@playwright/test'
import { adminHeaders } from './auth'

const API_BASE = 'http://localhost:3000'
const UI_BASE = 'http://localhost:5173'

export interface E2ESetup {
  eventId: string
  eventName: string
  stationId: string
  printerId: string
  beerId: string
  waiterId: string
  waiterName: string
  waiterToken: string
  waiterPin: string
}

/** Deletes any leftover `E2E ` events from earlier (possibly crashed) runs. */
export async function cleanStaleEvents(request: APIRequestContext) {
  const res = await request.get(`${API_BASE}/api/events`)
  if (!res.ok()) return
  const events = await res.json()
  for (const e of events) {
    if (e.name.startsWith('E2E ')) {
      await request.delete(`${API_BASE}/api/events/${e.id}`).catch(() => {})
    }
  }
}

/**
 * Creates a fresh, uniquely-named event with a bar station, a product and a
 * canCashOut waiter, and returns the ids/tokens needed by the journey specs.
 */
export async function setupEvent(
  request: APIRequestContext,
  prefix: string,
): Promise<E2ESetup> {
  const headers = await adminHeaders(request)
  const eventName = `${prefix} ${Date.now()}`
  const waiterName = `${prefix} Kellner`
  const waiterPin = '1111'

  const event = await (await request.post(`${API_BASE}/api/events`, { data: { name: eventName }, headers })).json()

  const printer = await (
    await request.post(`${API_BASE}/api/events/${event.id}/printers`, {
      data: { name: `${prefix} Drucker`, type: 'dummy' },
      headers,
    })
  ).json()

  const station = await (
    await request.post(`${API_BASE}/api/events/${event.id}/stations`, {
      data: { name: `${prefix} Bar`, printerId: printer.id, sortOrder: 1 },
      headers,
    })
  ).json()

  const beer = await (
    await request.post(`${API_BASE}/api/stations/${station.id}/products`, {
      data: { name: `${prefix} Bier`, priceCents: 300 },
      headers,
    })
  ).json()

  const waiter = await (
    await request.post(`${API_BASE}/api/events/${event.id}/waiters`, {
      data: { name: waiterName, pin: waiterPin, canCashOut: true },
      headers,
    })
  ).json()

  const login = await (
    await request.post(`${API_BASE}/api/auth/login`, {
      data: { waiterId: waiter.id, pin: waiterPin },
    })
  ).json()

  if (!login.token) {
    throw new Error(`Waiter login failed in setup: ${JSON.stringify(login)}`)
  }

  return {
    eventId: event.id,
    eventName,
    stationId: station.id,
    printerId: printer.id,
    beerId: beer.id,
    waiterId: waiter.id,
    waiterName,
    waiterToken: login.token,
    waiterPin,
  }
}

/** Destroys the event and everything under it (FK-safe cascade). */
export async function teardownEvent(request: APIRequestContext, eventId: string) {
  if (!eventId) return
  const headers = await adminHeaders(request)
  await request.delete(`${API_BASE}/api/events/${eventId}`, { headers })
}

/**
 * Logs a waiter in through the real UI (landing → event select → waiter tile
 * → PIN). Assumes the waiter belongs to `eventName` and surfaces on the login
 * page under `waiterName`.
 */
export async function loginViaUI(page: Page, eventName: string, waiterName: string, pin: string) {
  await page.goto(`${UI_BASE}/#/`)
  await page.getByTestId('landing-event-select').selectOption({ label: eventName })
  await page.getByTestId('tile-waiter').click()
  await page.waitForURL('**/#/login')
  await page.getByTestId(`waiter-${waiterName}`).click()
  await page.getByTestId('pin-input').fill(pin)
  await page.getByTestId('login-button').click()
  await page.waitForURL('**/#/order')
}