import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { adminHeaders } from './helpers/auth'

const BASE = 'http://localhost:3000'

interface TestContext {
  eventId: string
  eventName: string
  barStationId: string
  kitchenStationId: string
  beerId: string
  bratwurstId: string
  sauceExtraId: string
  ketchupOptionId: string
  aliceId: string
  aliceToken: string
}

let ctx: TestContext

async function setupEvent(request: APIRequestContext): Promise<TestContext> {
  const headers = await adminHeaders(request)
  const eventName = `E2E Lifecycle ${Date.now()}`

  // Create dedicated event
  const evRes = await request.post(`${BASE}/api/events`, { data: { name: eventName }, headers })
  const event = await evRes.json()

  // Printer (dummy)
  const printerRes = await request.post(`${BASE}/api/events/${event.id}/printers`, {
    data: { name: 'E2E Bar Drucker', type: 'dummy' },
    headers,
  })
  const printer = await printerRes.json()

  // Stations
  const barRes = await request.post(`${BASE}/api/events/${event.id}/stations`, {
    data: { name: 'E2E Bar', printerId: printer.id, sortOrder: 1 },
    headers,
  })
  const bar = await barRes.json()
  const kitchenRes = await request.post(`${BASE}/api/events/${event.id}/stations`, {
    data: { name: 'E2E Küche', sortOrder: 2 },
    headers,
  })
  const kitchen = await kitchenRes.json()

  // Products
  const beerRes = await request.post(`${BASE}/api/stations/${bar.id}/products`, {
    data: { name: 'E2E Bier', priceCents: 300 },
    headers,
  })
  const beer = await beerRes.json()
  const bratwurstRes = await request.post(`${BASE}/api/stations/${kitchen.id}/products`, {
    data: { name: 'E2E Bratwurst', priceCents: 450 },
    headers,
  })
  const bratwurst = await bratwurstRes.json()

  // Extra on Bratwurst
  const extraRes = await request.post(`${BASE}/api/products/${bratwurst.id}/extras`, {
    data: {
      name: 'Soße',
      multiSelect: false,
      options: [
        { name: 'Ohne Senf', priceDeltaCents: 0 },
        { name: 'Mit Ketchup', priceDeltaCents: 50 },
      ],
    },
    headers,
  })
  const extra = await extraRes.json()
  const ketchup = extra.options.find((o: { name: string }) => o.name === 'Mit Ketchup')

  // Waiter with permissions
  const waiterRes = await request.post(`${BASE}/api/events/${event.id}/waiters`, {
    data: { name: 'E2E Alice', pin: '1111', canCancel: true, canCashOut: true },
    headers,
  })
  const alice = await waiterRes.json()

  const loginRes = await request.post(`${BASE}/api/auth/login`, {
    data: { waiterId: alice.id, pin: '1111' },
  })
  const login = await loginRes.json()

  return {
    eventId: event.id,
    eventName,
    barStationId: bar.id,
    kitchenStationId: kitchen.id,
    beerId: beer.id,
    bratwurstId: bratwurst.id,
    sauceExtraId: extra.id,
    ketchupOptionId: ketchup.id,
    aliceId: alice.id,
    aliceToken: login.token,
  }
}

async function loginViaUI(page: Page) {
  // Landing page: select the (unique) event, then click the waiter tile (→ /login)
  await page.goto('http://localhost:5173/#/')
  await page.getByTestId('landing-event-select').selectOption({ label: ctx?.eventName ?? 'x' })
  await page.getByTestId('tile-waiter').click()
  await page.waitForURL('**/#/login')
  await page.getByTestId('waiter-E2E Alice').click()
  await page.getByTestId('pin-input').fill('1111')
  await page.getByTestId('login-button').click()
  await page.waitForURL('**/#/order')
}

test.describe('full order lifecycle', () => {
  test.beforeAll(async ({ request }) => {
    // cleanup stale events from earlier crashed runs so label selection is unique
    const stale = await request.get(`${BASE}/api/events`)
    if (stale.ok()) {
      const events = await stale.json()
      for (const e of events) {
        if (e.name.startsWith('E2E ')) await request.delete(`${BASE}/api/events/${e.id}`).catch(() => {})
      }
    }
    ctx = await setupEvent(request)
  })

  test.afterAll(async ({ request }) => {
    if (ctx?.eventId) {
      const headers = await adminHeaders(request)
      await request.delete(`${BASE}/api/events/${ctx.eventId}`, { headers })
    }
  })

  test('complete lifecycle: order → station display → prepared → paid', async ({ page, request }) => {
      // --- 1. Login as Alice via UI ---
      await loginViaUI(page)

      // --- 2. Add products: Bier ×2 via the + button (current UI: no card-click add) ---
      await page.getByTestId('increment-E2E Bier').click()
      await page.getByTestId('increment-E2E Bier').click()
      await expect(page.getByTestId('cart-item').filter({ hasText: '2× E2E Bier' })).toBeVisible()

      // --- 3. Submit order ---
      await page.getByTestId('table-number-input').fill('42')
      await page.getByTestId('submit-order').click()
      await expect(page.getByText('Bestellung aufgegeben!')).toBeVisible()

      // --- 4. API state: order open with correct total + tear-off ---
      const ordersRes = await request.get(`${BASE}/api/events/${ctx.eventId}/orders`)
      const orders = await ordersRes.json()
      expect(orders).toHaveLength(1)
      const order = orders[0]
      expect(order.status).toBe('open')
      expect(order.tableNumber).toBe('42')
      expect(order.totalCents).toBe(600) // 2×300
      expect(order.tearOffNumber).toBe(1)
      const beerItem = order.items.find((i: { product: { name: string } }) => i.product.name === 'E2E Bier')
      expect(beerItem).toBeTruthy()
      expect(beerItem.quantity).toBe(2)

      // --- 5. Station displays show the order (live) ---
      const barPage = await page.context().newPage()
      await barPage.goto(`http://localhost:5173/#/station/${ctx.barStationId}`)
      await expect(barPage.getByTestId('order-identifier')).toHaveText('Tisch 42')
      await expect(barPage.getByText('E2E Bier')).toBeVisible()

      // --- 6. Mark Bier prepared on Bar display ---
      await barPage.getByTestId(`done-${beerItem.id}`).click()
      // Item leaves the open list
      await expect(barPage.getByText('E2E Bier')).toHaveCount(0)
      // Bar display drops the whole order card (no more open items for bar)
      await expect(barPage.getByTestId('order-identifier')).toHaveCount(0, { timeout: 5000 })

      // API state: item prepared
      const orderAfter = await (await request.get(`${BASE}/api/orders/${order.id}`)).json()
      const beerAfter = orderAfter.items.find((i: { id: string }) => i.id === beerItem.id)
      expect(beerAfter.status).toBe('prepared')

      // --- 7. Waiter pays the order ---
      const payRes = await request.post(`${BASE}/api/orders/${order.id}/pay`, {
        headers: { authorization: `Bearer ${ctx.aliceToken}` },
      })
      expect(payRes.ok()).toBeTruthy()
      const paid = await payRes.json()
      expect(paid.status).toBe('paid')

      await barPage.close()
    })

    test('cancel flow: order appears then gets cancelled', async ({ page, request }) => {
      // Create an order via API
      const createRes = await request.post(`${BASE}/api/orders`, {
        data: {
          tableNumber: '77',
          waiterId: ctx.aliceId,
          eventId: ctx.eventId,
          items: [{ productId: ctx.beerId, quantity: 1 }],
        },
      })
      const order = await createRes.json()

      // Bar display shows it live
      await page.goto(`http://localhost:5173/#/station/${ctx.barStationId}`)
      await expect(page.getByTestId('order-identifier')).toHaveText('Tisch 77', { timeout: 5000 })

      // Cancel via API (Alice has canCancel)
      const cancelRes = await request.post(`${BASE}/api/orders/${order.id}/cancel`, {
        headers: { authorization: `Bearer ${ctx.aliceToken}` },
      })
      expect(cancelRes.ok()).toBeTruthy()

      // Display no longer shows the cancelled order. Reload to make the
      // terminal-state filter (paid/cancelled/done are hidden) deterministic;
      // the live WebSocket drop path is covered by the complete-lifecycle test.
      await page.reload()
      await expect(page.getByTestId('order-identifier')).toHaveCount(0, { timeout: 5000 })

      // API: all items cancelled
      const after = await (await request.get(`${BASE}/api/orders/${order.id}`)).json()
      expect(after.status).toBe('cancelled')
      after.items.forEach((i: { status: string }) => expect(i.status).toBe('cancelled'))
    })

    test('pickup-code order lifecycle', async ({ page, request }) => {
      await loginViaUI(page)

      // Order via API with a pickup code (current UI drives table orders; pickup via API)
      const createRes = await request.post(`${BASE}/api/orders`, {
        data: {
          pickupCode: 'B7',
          waiterId: ctx.aliceId,
          eventId: ctx.eventId,
          items: [{ productId: ctx.bratwurstId, quantity: 1, optionSelections: [{ extraId: ctx.sauceExtraId, optionId: ctx.ketchupOptionId }] }],
        },
      })
      expect(createRes.ok()).toBeTruthy()
      const order = await createRes.json()
      expect(order.pickupCode).toBe('B7')
      expect(order.totalCents).toBe(500)

      // Kitchen display shows the pickup code instead of table
      await page.goto(`http://localhost:5173/#/station/${ctx.kitchenStationId}`)
      await expect(page.getByTestId('order-identifier')).toHaveText('B7', { timeout: 5000 })

      // Pay + cleanup
      await request.post(`${BASE}/api/orders/${order.id}/pay`, {
        headers: { authorization: `Bearer ${ctx.aliceToken}` },
      })
      // Terminal filter hides paid orders deterministically (see cancel flow).
      await page.reload()
      await expect(page.getByTestId('order-identifier')).toHaveCount(0, { timeout: 5000 })
    })

    test('idle station display shows empty state', async ({ page }) => {
      // Pay/cancel everything first is done by previous tests; check empty state on bar
      await page.goto(`http://localhost:5173/#/station/${ctx.barStationId}`)
      await expect(page.getByText('Keine offenen Bestellungen')).toBeVisible({ timeout: 5000 })
    })
  })