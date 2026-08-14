import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

describe('Station CRUD routes', () => {
  let server: AppServer
  let eventId: string

  beforeAll(async () => {
    server = buildServer()
    await server.listen({ port: 0, host: '127.0.0.1' })
  })

  afterAll(async () => {
    await server.close()
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.stationAltPrinter.deleteMany({})
    await prisma.printer.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.stationAltPrinter.deleteMany({})
    await prisma.printer.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
    const ev = await prisma.event.create({ data: { name: 'Station Test Event' } })
    eventId = ev.id
  })

  it('POST /api/events/:eventId/stations creates a station', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/stations`,
      payload: { name: 'Main Bar', kitchenMonitor: true, sortOrder: 1 },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.id).toBeDefined()
    expect(body.name).toBe('Main Bar')
    expect(body.eventId).toBe(eventId)
    expect(body.printerId).toBeNull()
    expect(body.kitchenMonitor).toBe(true)
    expect(body.sortOrder).toBe(1)
  })

  it('POST /api/events/:eventId/stations returns 400 for invalid payload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/stations`,
      payload: { sortOrder: 1 },
    })
    expect(response.statusCode).toBe(400)
  })

  it('POST /api/events/:eventId/stations returns 404 for missing event', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/events/nonexistent/stations',
      payload: { name: 'Ghost Station' },
    })
    expect(response.statusCode).toBe(404)
  })

  it('POST creates station with printer FK', async () => {
    const printer = await prisma.printer.create({
      data: { name: 'Bar Printer', type: 'network', ip: '192.168.1.50', eventId },
    })
    const response = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/stations`,
      payload: { name: 'Bar', printerId: printer.id, kitchenMonitor: true },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.printerId).toBe(printer.id)
    expect(body.printer).toBeDefined()
    expect(body.printer.name).toBe('Bar Printer')
    expect(body.printer.ip).toBe('192.168.1.50')
  })

  it('GET /api/events/:eventId/stations lists stations for event', async () => {
    await prisma.station.create({ data: { name: 'Bar A', eventId, sortOrder: 1 } })
    await prisma.station.create({ data: { name: 'Bar B', eventId, sortOrder: 2 } })

    const response = await server.inject({
      method: 'GET',
      url: `/api/events/${eventId}/stations`,
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toHaveLength(2)
    expect(body.map((s: { name: string }) => s.name)).toEqual(['Bar A', 'Bar B'])
    body.forEach((s: { eventId: string }) => expect(s.eventId).toBe(eventId))
  })

  it('GET /api/stations/:id returns a single station with printer', async () => {
    const created = await prisma.station.create({ data: { name: 'Solo Station', eventId } })

    const response = await server.inject({
      method: 'GET',
      url: `/api/stations/${created.id}`,
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.id).toBe(created.id)
    expect(body.name).toBe('Solo Station')
    expect(body.printer).toBeNull()
  })

  it('GET /api/stations/:id returns 404 for missing station', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/stations/nonexistent',
    })
    expect(response.statusCode).toBe(404)
  })

  it('PUT /api/stations/:id updates a station', async () => {
    const created = await prisma.station.create({ data: { name: 'Original', eventId } })

    const response = await server.inject({
      method: 'PUT',
      url: `/api/stations/${created.id}`,
      payload: { name: 'Updated', kitchenMonitor: true, sortOrder: 5 },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.name).toBe('Updated')
    expect(body.kitchenMonitor).toBe(true)
    expect(body.sortOrder).toBe(5)
  })

  it('PUT /api/stations/:id returns 404 for missing station', async () => {
    const response = await server.inject({
      method: 'PUT',
      url: '/api/stations/nonexistent',
      payload: { name: 'Nope' },
    })
    expect(response.statusCode).toBe(404)
  })

  it('DELETE /api/stations/:id deletes a station', async () => {
    const created = await prisma.station.create({ data: { name: 'ToDelete', eventId } })

    const response = await server.inject({
      method: 'DELETE',
      url: `/api/stations/${created.id}`,
    })
    expect(response.statusCode).toBe(204)

    const exists = await prisma.station.findUnique({ where: { id: created.id } })
    expect(exists).toBeNull()
  })

  it('DELETE /api/stations/:id returns 404 for missing station', async () => {
    const response = await server.inject({
      method: 'DELETE',
      url: '/api/stations/nonexistent',
    })
    expect(response.statusCode).toBe(404)
  })
})