import { test, expect } from '@playwright/test'

test('frontend renders the app heading', async ({ page }) => {
  await page.goto('http://localhost:5173')
  await expect(page.locator('h1')).toContainText(/orderwas/i)
})

test('backend health endpoint returns ok', async ({ request }) => {
  const response = await request.get('http://localhost:3000/health')
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  expect(body.status).toBe('ok')
})

test('backend creates and lists events', async ({ request }) => {
  // Create event
  const createRes = await request.post('http://localhost:3000/api/events', {
    data: { name: 'E2E Test Event' },
  })
  expect(createRes.ok()).toBeTruthy()
  const event = await createRes.json()
  expect(event.name).toBe('E2E Test Event')
  expect(event.status).toBe('test')

  // List events
  const listRes = await request.get('http://localhost:3000/api/events')
  expect(listRes.ok()).toBeTruthy()
  const events = await listRes.json()
  expect(events.length).toBeGreaterThan(0)

  // Cleanup
  await request.delete(`http://localhost:3000/api/events/${event.id}`)
})
