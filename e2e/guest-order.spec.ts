import { test, expect } from '@playwright/test'
import { cleanStaleEvents, setupEvent, teardownEvent, type E2ESetup } from './helpers/setup'

const API_BASE = 'http://localhost:3000'
const UI_BASE = 'http://localhost:5173'

// QR guest-order journey: a guest opens the table's QR URL (encoded as
// base64url(eventId:table)), orders a product without logging in, and the
// resulting order is attributed to the event's hidden "Gast" waiter.
let ctx: E2ESetup

test.describe('QR guest order flow', () => {
  test.beforeAll(async ({ request }) => {
    await cleanStaleEvents(request)
    ctx = await setupEvent(request, 'E2E Gast')
  })

  test.afterAll(async ({ request }) => {
    await teardownEvent(request, ctx.eventId)
  })

  test('guest orders products from the QR menu for table 12', async ({ page, request }) => {
    // --- 1. Compose the QR token exactly as the server QR route does ---
    const table = '12'
    const token = Buffer.from(`${ctx.eventId}:${table}`).toString('base64url')

    // --- 2. Open the guest URL directly ---
    await page.goto(`${UI_BASE}/#/guest/${ctx.eventId}/${token}`)

    // --- 3. Menu renders the event's product ---
    const productButton = page.getByRole('button', { name: /E2E Gast Bier/ })
    await expect(productButton).toBeVisible()

    // --- 4. Add the product to the cart twice ---
    await productButton.click()
    await productButton.click()
    // Quantity badge on the product card shows the cart count.
    await expect(productButton.getByText('2', { exact: true })).toBeVisible()

    // --- 5. Submit the order ---
    await page.getByRole('button', { name: 'Bestellung abschließen' }).click()

    // --- 6. Success screen with the total ---
    await expect(page.getByText('Bestellung aufgegeben!')).toBeVisible()
    await expect(page.getByText('6,00 €')).toBeVisible()

    // --- 7. Verify via API: order exists at table 12 with the right total ---
    const orders = await (await request.get(`${API_BASE}/api/events/${ctx.eventId}/orders`)).json()
    const created = orders.find((o: { tableNumber: string }) => o.tableNumber === table)
    expect(created).toBeTruthy()
    expect(created.status).toBe('open')
    expect(created.tableNumber).toBe('12')
    expect(created.totalCents).toBe(600)
    const beerItem = created.items.find((i: { product: { name: string } }) => i.product.name === 'E2E Gast Bier')
    expect(beerItem.quantity).toBe(2)
    // Attributed to a different (hidden ghost) waiter "Gast", not the real waiter.
    expect(created.waiterId).toBeTruthy()
    expect(created.waiterId).not.toBe(ctx.waiterId)
  })
})