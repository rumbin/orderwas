import { test, expect } from '@playwright/test'
import { cleanStaleEvents, setupEvent, teardownEvent, loginViaUI, type E2ESetup } from './helpers/setup'
import { adminHeaders } from './helpers/auth'

const API_BASE = 'http://localhost:3000'
/** PIN the counter login is created with (see eventService.syncCounterWaiter). */
const THEKE_PIN = '0000'
/** Event prefix used by setupEvent; the seeded product is `${PREFIX} Bier`. */
const PREFIX = 'E2E Theke'
const PRODUCT = `${PREFIX} Bier`

/**
 * Theke (counter) journey:
 * enabling the counter creates the "Theke" login, which sells against a Bon
 * (tear-off) number instead of a table, jumps to the cashier screen right after
 * submitting, refuses a new order until that Bon is paid, and then returns to
 * order taking with the next Bon pre-filled.
 */
let ctx: E2ESetup

test.describe('Theke (counter) flow', () => {
  test.beforeAll(async ({ request }) => {
    await cleanStaleEvents(request)
    ctx = await setupEvent(request, PREFIX)

    // Enable the counter for this event → creates the "Theke" waiter.
    const headers = await adminHeaders(request)
    const res = await request.put(`${API_BASE}/api/events/${ctx.eventId}`, {
      data: { counterEnabled: true },
      headers,
    })
    expect(res.ok()).toBeTruthy()
  })

  test.afterAll(async ({ request }) => {
    await teardownEvent(request, ctx.eventId)
  })

  test('sells a Bon, blocks the next order until it is paid, then continues', async ({ page, request }) => {
    // --- 1. The counter login exists for this event ---
    const waiters = await (await request.get(`${API_BASE}/api/events/${ctx.eventId}/waiters`)).json()
    const theke = waiters.find((w: { isCounter: boolean }) => w.isCounter)
    expect(theke, 'enabling the counter must create the Theke waiter').toBeTruthy()
    expect(theke.name).toBe('Theke')

    await loginViaUI(page, ctx.eventName, theke.name, THEKE_PIN)

    // --- 2. Counter page: Bon pre-filled with the next tear-off number, no table ---
    const bonInput = page.getByTestId('bon-number-input')
    await expect(bonInput).toHaveValue('1')
    await expect(page.getByTestId('table-number-input')).toHaveCount(0)

    // --- 3. Sell the Bon ---
    await page.getByTestId(`increment-${PRODUCT}`).click()
    await page.getByTestId('submit-order').click()

    // --- 4. Straight to the cashier screen, showing the open Bon ---
    const counterHeader = page.getByTestId('counter-cashier-header')
    await expect(counterHeader).toBeVisible()
    await expect(counterHeader).toContainText('Bon 1')
    await expect(page.getByText(PRODUCT)).toBeVisible()

    // --- 5. A new order is blocked while the Bon is unpaid ---
    await page.getByRole('button', { name: 'Neue Bestellung' }).click()
    await expect(page.getByTestId('counter-blocked-hint')).toBeVisible()
    await page.getByTestId(`increment-${PRODUCT}`).click()
    await expect(page.getByTestId('submit-order')).toBeDisabled()

    // The block is real, not cosmetic: no second order reached the server.
    const afterBlocked = await (await request.get(`${API_BASE}/api/events/${ctx.eventId}/orders`)).json()
    expect(afterBlocked).toHaveLength(1)

    // The hint's shortcut leads back to the cashier screen.
    await page.getByTestId('counter-blocked-action').click()
    await expect(counterHeader).toBeVisible()

    // --- 6. Cash out the Bon (items are pre-selected in counter mode) ---
    await page.getByRole('button', { name: 'Bezahlt', exact: true }).click()

    // --- 7. Back to order taking with the next Bon pre-filled.
    //        At the counter a full payment returns immediately, so the
    //        confirmation IS this return plus the next Bon — there is no toast
    //        to wait for (the toast only appears while items remain unpaid). ---
    await expect(page.getByTestId('bon-number-input')).toHaveValue('2')
    await expect(page.getByTestId('counter-blocked-hint')).toHaveCount(0)

    // --- 8. API state: one counter order, paid, Bon 1, no table ---
    const orders = await (await request.get(`${API_BASE}/api/events/${ctx.eventId}/orders`)).json()
    expect(orders).toHaveLength(1)
    expect(orders[0].tearOffNumber).toBe(1)
    expect(orders[0].tableNumber).toBeNull()
    expect(orders[0].pickupCode).toBeNull()
    expect(orders[0].status).toBe('paid')
    orders[0].items.forEach((i: { paidAt: string | null }) => expect(i.paidAt).toBeTruthy())

    // --- 9. The counter has nothing left to collect ---
    await page.getByRole('button', { name: 'Kassieren' }).click()
    await expect(page.getByTestId('counter-empty')).toBeVisible()
    await expect(page.getByTestId('counter-cashier-header')).toHaveText('Theke')
  })

  test('a regular waiter on the same event still sells by table number', async ({ page }) => {
    await loginViaUI(page, ctx.eventName, ctx.waiterName, ctx.waiterPin)

    // Table flow is untouched by the counter being enabled.
    await expect(page.getByTestId('table-number-input')).toBeVisible()
    await expect(page.getByTestId('bon-number-input')).toHaveCount(0)
    await expect(page.getByTestId('counter-blocked-hint')).toHaveCount(0)
  })
})
