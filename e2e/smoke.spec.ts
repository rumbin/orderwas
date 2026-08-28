import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { adminHeaders } from './helpers/auth'

// Simple helper to list + delete pre-existing E2E events (cleans up leftovers
// from crashed runs so label-based selection stays unambiguous).
async function cleanStaleEvents(request: APIRequestContext) {
  const res = await request.get('http://localhost:3000/api/events')
  if (!res.ok()) return
  const events = await res.json()
  for (const e of events) {
    if (e.name.startsWith('E2E ')) {
      await request.delete(`http://localhost:3000/api/events/${e.id}`).catch(() => {})
    }
  }
}

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

test('backend creates and lists events', async ({ page, request }) => {
  await cleanStaleEvents(request)
  const headers = await adminHeaders(request)
  const eventsBefore = await (await request.get('http://localhost:3000/api/events')).json()

  const createRes = await request.post('http://localhost:3000/api/events', {
    data: { name: 'E2E Test Event' },
    headers,
  })
  expect(createRes.ok()).toBeTruthy()
  const event = await createRes.json()
  expect(event.name).toBe('E2E Test Event')
  expect(event.status).toBe('test')

  // List events
  const listRes = await request.get('http://localhost:3000/api/events')
  expect(listRes.ok()).toBeTruthy()
  const events = await listRes.json()
  expect(events.length).toBe(eventsBefore.length + 1)

  // Cleanup
  await request.delete(`http://localhost:3000/api/events/${event.id}`, { headers })
})