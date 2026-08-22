import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

describe('Event CRUD routes', () => {
  let server: AppServer
  let adminToken: string

  beforeAll(async () => {
    server = buildServer()
    await server.listen({ port: 0, host: '127.0.0.1' })
    adminToken = server.jwt.sign({ admin: true }, { expiresIn: '8h' })
  })

  afterAll(async () => {
    await server.close()
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })

  it('POST /api/events creates a new event', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/events',
      payload: { name: 'Test Event', status: 'live' },
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.id).toBeDefined()
    expect(body.name).toBe('Test Event')
    expect(body.status).toBe('live')
    expect(body.hidePrices).toBe(false)
    expect(body.tseEnabled).toBe(false)
  })

  it('POST /api/events returns 400 for invalid payload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/events',
      payload: { status: 'live' },
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(response.statusCode).toBe(400)
  })

  it('GET /api/events lists all events', async () => {
    await prisma.event.create({ data: { name: 'Event A' } })
    await prisma.event.create({ data: { name: 'Event B' } })

    const response = await server.inject({
      method: 'GET',
      url: '/api/events',
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toHaveLength(2)
    expect(body.map((e: { name: string }) => e.name).sort()).toEqual(['Event A', 'Event B'])
  })

  it('GET /api/events/:id returns a single event', async () => {
    const created = await prisma.event.create({ data: { name: 'Single Event' } })

    const response = await server.inject({
      method: 'GET',
      url: `/api/events/${created.id}`,
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.id).toBe(created.id)
    expect(body.name).toBe('Single Event')
  })

  it('GET /api/events/:id returns 404 for missing event', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/events/nonexistent',
    })
    expect(response.statusCode).toBe(404)
  })

  it('PUT /api/events/:id updates an event', async () => {
    const created = await prisma.event.create({ data: { name: 'Original' } })

    const response = await server.inject({
      method: 'PUT',
      url: `/api/events/${created.id}`,
      payload: { name: 'Updated', status: 'live', hidePrices: true, tseEnabled: true },
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.name).toBe('Updated')
    expect(body.status).toBe('live')
    expect(body.hidePrices).toBe(true)
    expect(body.tseEnabled).toBe(true)
  })

  it('PUT /api/events/:id returns 404 for missing event', async () => {
    const response = await server.inject({
      method: 'PUT',
      url: '/api/events/nonexistent',
      payload: { name: 'Nope' },
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(response.statusCode).toBe(404)
  })

  it('DELETE /api/events/:id deletes an event', async () => {
    const created = await prisma.event.create({ data: { name: 'ToDelete' } })

    const response = await server.inject({
      method: 'DELETE',
      url: `/api/events/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(response.statusCode).toBe(204)

    const exists = await prisma.event.findUnique({ where: { id: created.id } })
    expect(exists).toBeNull()
  })

  it('DELETE /api/events/:id returns 404 for missing event', async () => {
    const response = await server.inject({
      method: 'DELETE',
      url: '/api/events/nonexistent',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(response.statusCode).toBe(404)
  })
})
