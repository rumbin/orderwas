import { test, expect } from '@playwright/test'
import { adminHeaders } from './helpers/auth'
import { cleanStaleEvents, teardownEvent } from './helpers/setup'

const API_BASE = 'http://localhost:3000'
const UI_BASE = 'http://localhost:5173'

// Admin CRUD journey: log in with the admin PIN, then create a station,
// a product under it and a waiter through the admin UI, asserting each
// appears in the list. Everything lives under a dedicated event cleaned up
// at the end.
let eventId = ''
let eventName = ''

test.describe('admin CRUD journey', () => {
  test.beforeAll(async ({ request }) => {
    await cleanStaleEvents(request)
    // Dedicated malloc event for admin CRUD; owns nothing yet (entries are
    // created through the UI, then the whole event is deleted in afterAll).
    const headers = await adminHeaders(request)
    const created = await (await request.post(`${API_BASE}/api/events`, {
      data: { name: `E2E Admin ${Date.now()}` },
      headers,
    })).json()
    eventId = created.id
    eventName = created.name
  })

  test.afterAll(async ({ request }) => {
    await teardownEvent(request, eventId)
  })

  test('creates station, product and waiter via the admin UI', async ({ page }) => {
    const stationName = `E2E Admin Bar`
    const productName = `E2E Admin Bier`
    const waiterName = `E2E Admin Kellner`

    // --- 1. Log in to the admin panel ---
    await page.goto(`${UI_BASE}/#/admin`)
    await page.getByPlaceholder('PIN eingeben').fill('admin')
    await page.getByRole('button', { name: 'Anmelden' }).click()

    // Sidebar appears once the admin login gate passes. The events dropdown
    // populates reactively once the login stores the admin token.
    const eventSelect = page.locator('select.bg-gray-700')
    await expect(eventSelect).toBeVisible()
    await expect(eventSelect.locator('option')).not.toHaveCount(0)

    // --- 2. Select the admin event (unique across runs via its name) ---
    await eventSelect.selectOption({ label: eventName })

    // --- 3. Stations tab: create a station ---
    await page.getByTestId('tab-stations').click()
    await page.getByPlaceholder(/Stationsname/).fill(stationName)
    await page.getByRole('button', { name: 'Erstellen' }).click()
    await expect(page.getByText(stationName)).toBeVisible()

    // --- 4. Products tab: create a product under that station ---
    await page.getByTestId('tab-products').click()
    await page.getByPlaceholder('Produktname').fill(productName)
    await page.getByPlaceholder('Cent').fill('300')
    await page.getByRole('button', { name: 'Erstellen' }).click()
    await expect(page.getByText(productName)).toBeVisible()

    // --- 5. Waiters tab: create a waiter ---
    await page.getByTestId('tab-waiters').click()
    await page.getByPlaceholder('Name').fill(waiterName)
    await page.getByPlaceholder('PIN').fill('2222')
    await page.getByRole('button', { name: 'Erstellen' }).click()
    await expect(page.getByText(waiterName)).toBeVisible()
  })
})