import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { layoutsRoutes } from '@/routes/layouts'
import { prisma } from '@/db/client'

const BUTTONS_JSON = JSON.stringify([
  { name: 'Beer', color: '#FFD700', productId: 'p1', row: 0, col: 0 },
  { name: 'Cola', color: '#FF0000', productId: 'p2', row: 0, col: 1 },
])

let server: AppServer

beforeAll(async () => {
  server = buildServer()
  server.register(layoutsRoutes)
  await server.ready()
})

afterAll(async () => {
  await server.close()
})

async function makeEvent(): Promise<string> {
  const ev = await prisma.event.create({ data: { name: `Layout Test ${Date.now()}-${Math.random()}` } })
  return ev.id
}

const createdEvents: string[] = []

afterEach(async () => {
  for (const id of createdEvents.splice(0)) {
    await prisma.appLayout.deleteMany({ where: { eventId: id } }).catch(() => {})
    await prisma.event.delete({ where: { id } }).catch(() => {})
  }
})

async function setupEvent(): Promise<string> {
  const id = await makeEvent()
  createdEvents.push(id)
  return id
}

describe('Layout CRUD - POST /api/events/:eventId/layouts', () => {
  it('creates a layout and returns 201', async () => {
    const eventId = await setupEvent()
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/layouts`,
      payload: { columns: 4, rows: 6, buttons: BUTTONS_JSON },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as Record<string, unknown>
    expect(body.id).toBeDefined()
    expect(body.columns).toBe(4)
    expect(body.rows).toBe(6)
    expect(body.buttons).toBe(BUTTONS_JSON)
    expect(body.eventId).toBe(eventId)
    expect(body.waiterId).toBeNull()
  })

  it('creates a layout with waiterId', async () => {
    const eventId = await setupEvent()
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/layouts`,
      payload: { waiterId: 'w1', columns: 3, rows: 5 },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as Record<string, unknown>
    expect(body.waiterId).toBe('w1')
  })

  it('uses defaults when optional fields omitted', async () => {
    const eventId = await setupEvent()
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/layouts`,
      payload: {},
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as Record<string, unknown>
    expect(body.columns).toBe(3)
    expect(body.rows).toBe(5)
    expect(body.buttons).toBe('[]')
  })

  it('rejects invalid columns (400)', async () => {
    const eventId = await setupEvent()
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/layouts`,
      payload: { columns: 0 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for unknown event', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/events/nonexistent/layouts',
      payload: { columns: 3 },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('Layout CRUD - GET /api/events/:eventId/layouts', () => {
  it('lists layouts for the event', async () => {
    const eventId = await setupEvent()
    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/layouts`,
      payload: { columns: 3 },
    })
    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/layouts`,
      payload: { waiterId: 'w1', columns: 4 },
    })
    const res = await server.inject({
      method: 'GET',
      url: `/api/events/${eventId}/layouts`,
    })
    expect(res.statusCode).toBe(200)
    const list = res.json() as unknown[]
    expect(list.length).toBe(2)
    list.forEach((l) => {
      expect((l as Record<string, unknown>).eventId).toBe(eventId)
    })
  })
})

describe('Layout CRUD - PUT /api/layouts/:id', () => {
  it('updates a layout', async () => {
    const eventId = await setupEvent()
    const created = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/layouts`,
      payload: { columns: 3 },
    })
    const id = created.json().id as string

    const res = await server.inject({
      method: 'PUT',
      url: `/api/layouts/${id}`,
      payload: { columns: 5, buttons: BUTTONS_JSON },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, unknown>
    expect(body.columns).toBe(5)
    expect(body.buttons).toBe(BUTTONS_JSON)
  })

  it('returns 404 for unknown layout', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/layouts/nonexistent',
      payload: { columns: 5 },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('Layout CRUD - DELETE /api/layouts/:id', () => {
  it('deletes a layout', async () => {
    const eventId = await setupEvent()
    const created = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/layouts`,
      payload: { columns: 3 },
    })
    const id = created.json().id as string

    const del = await server.inject({ method: 'DELETE', url: `/api/layouts/${id}` })
    expect(del.statusCode).toBe(204)

    const get = await server.inject({ method: 'GET', url: `/api/events/${eventId}/layouts` })
    const list = get.json() as unknown[]
    expect(list.length).toBe(0)
  })

  it('returns 404 for unknown layout', async () => {
    const res = await server.inject({ method: 'DELETE', url: '/api/layouts/nonexistent' })
    expect(res.statusCode).toBe(404)
  })
})

describe('Layout CRUD - GET /api/waiters/:waiterId/layout', () => {
  it('returns waiter-specific layout when available', async () => {
    const eventId = await setupEvent()
    // Create a real waiter
    const waiter = await prisma.waiter.create({
      data: { name: 'Test Waiter', pin: '1234', eventId },
    })
    // Create default layout
    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/layouts`,
      payload: { columns: 3, rows: 5 },
    })
    // Create waiter-specific layout
    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/layouts`,
      payload: { waiterId: waiter.id, columns: 4, rows: 6 },
    })

    const res = await server.inject({
      method: 'GET',
      url: `/api/waiters/${waiter.id}/layout`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, unknown>
    expect(body.waiterId).toBe(waiter.id)
    expect(body.columns).toBe(4)
  })

  it('falls back to event default layout', async () => {
    const eventId = await setupEvent()
    // Create a real waiter
    const waiter = await prisma.waiter.create({
      data: { name: 'Test Waiter 2', pin: '5678', eventId },
    })
    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/layouts`,
      payload: { columns: 5, rows: 7 },
    })

    const res = await server.inject({
      method: 'GET',
      url: `/api/waiters/${waiter.id}/layout`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, unknown>
    expect(body.waiterId).toBeNull()
    expect(body.columns).toBe(5)
  })

  it('returns 404 for unknown waiter', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/waiters/nonexistent/layout',
    })
    expect(res.statusCode).toBe(404)
  })
})
