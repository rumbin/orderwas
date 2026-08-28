import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { waitersRoutes } from '@/routes/waiters'
import { prisma } from '@/db/client'

const PIN = '1234'
const NAME = 'Test Waiter'

let server: AppServer
let adminHeaders: { authorization: string }

beforeAll(async () => {
  // Build a fresh server (buildServer already registers cors + /health) and
  // register the waiters plugin ourselves so the tests run standalone without
  // relying on index.ts wiring.
  server = buildServer()
  server.register(waitersRoutes)
  await server.ready()
  // Mutating waiters routes are gated with requireAdmin.
  adminHeaders = { authorization: `Bearer ${server.jwt.sign({ admin: true }, { expiresIn: '8h' })}` }
})

afterAll(async () => {
  await server.close()
})

/**
 * Create a throwaway event for a single test and return its id.  The event is
 * scoped to the test via `afterEach` cleanup by id, so we never rely on
 * global `deleteMany({})` (which other test suites use destructively).
 */
async function makeEvent(): Promise<string> {
  const ev = await prisma.event.create({ data: { name: `Waiter Test ${Date.now()}-${Math.random()}` } })
  return ev.id
}

const createdEvents: string[] = []

afterEach(async () => {
  // Clean up only the events (and their cascaded waiters) we created.
  for (const id of createdEvents.splice(0)) {
    await prisma.waiter.deleteMany({ where: { eventId: id } }).catch(() => {})
    await prisma.event.delete({ where: { id } }).catch(() => {})
  }
})

async function setupEvent(): Promise<string> {
  const id = await makeEvent()
  createdEvents.push(id)
  return id
}

describe('Waiter CRUD - POST /api/events/:eventId/waiters', () => {
  it('creates a waiter and returns 201', async () => {
    const eventId = await setupEvent()
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/waiters`,
      payload: { name: NAME, pin: PIN, canCancel: true, canCashOut: true },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as Record<string, unknown>
    expect(body.id).toBeDefined()
    expect(body.name).toBe(NAME)
    expect(body.pin).toBeUndefined() // pin is never returned
    expect(body.eventId).toBe(eventId)
    expect(body.canCancel).toBe(true)
    expect(body.canCashOut).toBe(true)
    expect(body.canStatistics).toBe(false) // default
    expect(body.active).toBe(true) // default
  })

  it('rejects creation when name is missing (400)', async () => {
    const eventId = await setupEvent()
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/waiters`,
      payload: { pin: PIN }, // name missing
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('Waiter CRUD - GET /api/events/:eventId/waiters', () => {
  it('lists waiters for the event', async () => {
    const eventId = await setupEvent()
    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/waiters`,
      payload: { name: `${NAME}-a`, pin: '1' },
      headers: adminHeaders,
    })
    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/waiters`,
      payload: { name: `${NAME}-b`, pin: '2' },
      headers: adminHeaders,
    })
    const res = await server.inject({
      method: 'GET',
      url: `/api/events/${eventId}/waiters`,
    })
    expect(res.statusCode).toBe(200)
    const list = res.json() as unknown[]
    expect(list.length).toBeGreaterThanOrEqual(2)
    list.forEach((w) => {
      expect((w as Record<string, unknown>).eventId).toBe(eventId)
    })
  })
})

describe('Waiter CRUD - GET /api/waiters/:id', () => {
  it('fetches a single waiter by id', async () => {
    const eventId = await setupEvent()
    const created = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/waiters`,
      payload: { name: NAME, pin: PIN },
      headers: adminHeaders,
    })
    const waiterId = created.json().id

    const res = await server.inject({ method: 'GET', url: `/api/waiters/${waiterId}` })
    expect(res.statusCode).toBe(200)
    expect((res.json() as Record<string, unknown>).id).toBe(waiterId)
  })

  it('returns 404 for an unknown waiter id', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/waiters/nonexistent' })
    expect(res.statusCode).toBe(404)
  })
})

describe('Waiter CRUD - PUT /api/waiters/:id', () => {
  it('updates a waiter', async () => {
    const eventId = await setupEvent()
    const created = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/waiters`,
      payload: { name: NAME, pin: PIN },
      headers: adminHeaders,
    })
    const id = created.json().id

    const res = await server.inject({
      method: 'PUT',
      url: `/api/waiters/${id}`,
      payload: { name: `${NAME}-upd`, canStatistics: true, pin: '9999' },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, unknown>
    expect(body.name).toBe(`${NAME}-upd`)
    expect(body.pin).toBeUndefined() // pin is never returned
    expect(body.canStatistics).toBe(true)
  })
})

describe('Waiter CRUD - DELETE /api/waiters/:id', () => {
  it('deletes a waiter', async () => {
    const eventId = await setupEvent()
    const created = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/waiters`,
      payload: { name: NAME, pin: PIN },
      headers: adminHeaders,
    })
    const id = created.json().id

    const del = await server.inject({ method: 'DELETE', url: `/api/waiters/${id}`, headers: adminHeaders })
    expect(del.statusCode).toBe(204)

    const get = await server.inject({ method: 'GET', url: `/api/waiters/${id}` })
    expect(get.statusCode).toBe(404)
  })
})

describe('Waiter CRUD - PATCH /api/waiters/:id/active', () => {
  it('toggles the active flag', async () => {
    const eventId = await setupEvent()
    const created = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/waiters`,
      payload: { name: NAME, pin: PIN },
      headers: adminHeaders,
    })
    const id = created.json().id
    expect(created.json().active).toBe(true)

    const res = await server.inject({
      method: 'PATCH',
      url: `/api/waiters/${id}/active`,
      payload: { active: false },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as Record<string, unknown>).active).toBe(false)

    const res2 = await server.inject({
      method: 'PATCH',
      url: `/api/waiters/${id}/active`,
      payload: { active: true },
      headers: adminHeaders,
    })
    expect(res2.statusCode).toBe(200)
    expect((res2.json() as Record<string, unknown>).active).toBe(true)
  })
})