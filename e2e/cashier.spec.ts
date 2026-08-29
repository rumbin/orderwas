import { test, expect } from '@playwright/test'
import { cleanStaleEvents, setupEvent, teardownEvent, loginViaUI, type E2ESetup } from './helpers/setup'

const API_BASE = 'http://localhost:3000'

// Item-level cashier (pay-items) journey:
// a canCashOut waiter collects payment for a table's items in the CashierView.
let ctx: E2ESetup

test.describe('cashier pay-items flow', () => {
  test.beforeAll(async ({ request }) => {
    await cleanStaleEvents(request)
    ctx = await setupEvent(request, 'E2E Cashier')
  })

  test.afterAll(async ({ request }) => {
    await teardownEvent(request, ctx.eventId)
  })

  test('collects payment for a table’s unpaid items via the cashier UI', async ({ page, request }) => {
    // --- 1. Create an order via API: 2× Bier at table 42, owned by the cashier waiter ---
    const createRes = await request.post(`${API_BASE}/api/orders`, {
      data: {
        tableNumber: '42',
        waiterId: ctx.waiterId,
        eventId: ctx.eventId,
        items: [{ productId: ctx.beerId, quantity: 2 }],
      },
    })
    expect(createRes.ok()).toBeTruthy()
    const order = await createRes.json()
    expect(order.totalCents).toBe(600)

    // --- 2. Log in as the cashier waiter via UI ---
    await loginViaUI(page, ctx.eventName, ctx.waiterName, ctx.waiterPin)

    // --- 3. Switch to the Cashier tab (#/order → "Kassieren") ---
    await page.getByRole('button', { name: 'Kassieren' }).click()

    // CashierView auto-detects the last table for the current waiter (42),
    // then lists its unpaid items.
    await expect(page.getByText('Tisch 42')).toBeVisible()
    await expect(page.getByText('E2E Cashier Bier')).toBeVisible()

    // --- 4. Select all open items; the running sum is shown ---
    await page.getByText('Alle auswählen').click()
    await expect(page.getByText('Summe').locator('xpath=following-sibling::span')).toHaveText('6,00 €')

    // --- 5. Collect payment ---
    await page.getByRole('button', { name: 'Bezahlt', exact: true }).click()
    await expect(page.getByText(/Zahlung erfasst/)).toBeVisible()

    // --- 6. Items no longer appear as open (pay bar + select-all disappear,
    //        the table shows the "no open items" empty state) ---
    await expect(page.getByText(/Keine offenen? Posten an diesem Tisch/)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Alle auswählen')).toHaveCount(0)

    // --- 7. Verify via API: items are paid ---
    const paidOrder = await (await request.get(`${API_BASE}/api/orders/${order.id}`)).json()
    expect(paidOrder.status).toBe('paid')
    paidOrder.items.forEach((i: { paidAt: string | null }) => expect(i.paidAt).toBeTruthy())
  })
})