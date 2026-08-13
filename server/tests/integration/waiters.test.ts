import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { buildServer, type AppServer } from '@/index'
import { waitersRoutes } from '@/routes/waiters'
import { prisma } from '@/db/client'

const PIN = '1234'
const NAME = 'Test Waiter'

let server: AppServer

beforeAll(async () => {
  // Build a fresh server (buildServer already registers cors + /health) but
  // we do NOT rely on index.ts registering the waiters route. We register the
  // plugin ourselves so the tests run standalone.
  server = buildServer() as FastifyInstance
  // `buildServer` doesn't close the previous instance; fastify-plugin or plain
  // async plugin both work. Register the routes plugin directly.
  ;(server as unknown as { register: (p: unknown) => void }).register(waitersRoutes)
  await server.ready()
})

afterAll(async () => {
  await prisma.waiter.deleteMany({ where: { name: NAME } })
  await server.close()
})

// A unique eventId is created for each describe block so routes are isolated.
let sharedEventId: string
let sharedEventName = `Waiter Test ${Date.now()}`

beforeEach(async () => {
  // (Re)create an event for each test so waiter lists stay isolated.
  const ev = await prisma.event.create({ data: { name: sharedEventName } })
  sharedEventId = ev.id
})

afterEach(async () => {
  await prisma.waiter.deleteMany({ where: { eventId: sharedEventId } }).catch(() => {})
  await prisma.event.delete({ where: { id: sharedEventId } }).catch(() => {})
})

describe('Waiter CRUD - POST /api/events/:eventId/waiters', () => {
  it('creates a waiter and returns 201', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${sharedEventId}/waiters`,
      payload: { name: NAME, pin: PIN, canCancel: true, canCashOut: true },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as Record<string, unknown>
    expect(body.id).toBeDefined()
    expect(body.name).toBe(NAME)
    expect(body.pin).toBe(PIN)
    expect(body.eventId).toBe(sharedEventId)
    expect(body.canCancel).toBe(true)
    expect(body.canCashOut).toBe(true)
    expect(body.canStatistics).toBe(false) // default
    expect(body.active).toBe(true) // default
  })

  it('rejects creation when name is missing (400)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${sharedEventId}/waiters`,
      payload: { pin: PIN }, // name missing
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('Waiter CRUD - GET /api/events/:eventId/waiters', () => {
  it('lists waiters for the event', async () => {
    await server.inject({
      method: 'POST',
      url: `/api/events/${sharedEventId}/waiters`,
      payload: { name: `${NAME}-a`, pin: '1' },
    })
    await server.inject({
      method: 'POST',
      url: `/api/events/${sharedEventId}/waiters`,
      payload: { name: `${NAME}-b`, pin: '2' },
    })
    const res = await server.inject({
      method: 'GET',
      url: `/api/events/${sharedEventId}/waiters`,
    })
    expect(res.statusCode).toBe(200)
    const list = res.json() as unknown[]
    expect(list.length).toBeGreaterThanOrEqual(2)
    list.forEach((w) => {
      expect((w as Record<string, unknown>).eventId).toBe(sharedEventId)
    })
  })
})

let sharedWaiterId: string

describe('Waiter CRUD - GET /api/waiters/:id', () => {
  it('fetches a single waiter by id', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/api/events/${sharedEventId}/waiters`,
      payload: { name: NAME, pin: PIN },
    })
    sharedWaiterId = created.json().id

    const res = await server.inject({ method: 'GET', url: `/api/waiters/${sharedWaiterId}` })
    expect(res.statusCode).toBe(200)
    expect((res.json() as Record<string, unknown>).id).toBe(sharedWaiterId)
  })

  it('returns 404 for an unknown waiter id', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/waiters/nonexistent' })
    expect(res.statusCode).toBe(404)
  })
})

describe('Waiter CRUD - PUT /api/waiters/:id', () => {
  it('updates a waiter', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/api/events/${sharedEventId}/waiters`,
      payload: { name: NAME, pin: PIN },
    })
    const id = created.json().id

    const res = await server.inject({
      method: 'PUT',
      url: `/api/waiters/${id}`,
      payload: { name: `${NAME}-upd`, canStatistics: true, pin: '9999' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, unknown>
    expect(body.name).toBe(`${NAME}-upd`)
    expect(body.pin).toBe('9999')
    expect(body.canStatistics).toBe(true)
  })
})

describe('Waiter CRUD - DELETE /api/waiters/:id', () => {
  it('deletes a waiter', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/api/events/${sharedEventId}/waiters`,
      payload: { name: NAME, pin: PIN },
    })
    const id = created.json().id

    const del = await server.inject({ method: 'DELETE', url: `/api/waiters/${id}` })
    expect(del.statusCode).toBe(204)

    const get = await server.inject({ method: 'GET', url: `/api/waiters/${id}` })
    expect(get.statusCode).toBe(404)
  })
})

describe('Waiter CRUD - PATCH /api/waiters/:id/active', () => {
  it('toggles the active flag', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/api/events/${sharedEventId}/waiters`,
      payload: { name: NAME, pin: PIN },
    })
    const id = created.json().id
    expect(created.json().active).toBe(true)

    const res = await server.inject({
      method: 'PATCH',
      url: `/api/waiters/${id}/active`,
      payload: { active: false },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as Record<string, unknown>).active).toBe(false)

    const res2 = await server.inject({
      method: 'PATCH',
      url: `/api/waiters/${id}/active`,
      payload: { active: true },
    })
    expect(res2.statusCode).toBe(200)
    expect((res2.json() as Record<string, unknown>).active).toBe(true)
  })
})