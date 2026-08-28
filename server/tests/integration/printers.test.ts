import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

describe('Printer CRUD routes', () => {
  let server: AppServer
  let eventId: string
  let adminHeaders: { authorization: string }

  beforeAll(async () => {
    server = buildServer()
    await server.listen({ port: 0, host: '127.0.0.1' })
    adminHeaders = { authorization: `Bearer ${server.jwt.sign({ admin: true }, { expiresIn: '8h' })}` }
  })

  afterAll(async () => {
    await server.close()
    await prisma.printer.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    await prisma.printer.deleteMany({})
    await prisma.event.deleteMany({})
    const ev = await prisma.event.create({ data: { name: 'Printer Test Event' } })
    eventId = ev.id
  })

  it('POST creates a printer', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/printers`,
      payload: { name: 'Bar Drucker', type: 'network', ip: '192.168.1.50', charsPerLine: 48 },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeDefined()
    expect(body.name).toBe('Bar Drucker')
    expect(body.type).toBe('network')
    expect(body.ip).toBe('192.168.1.50')
    expect(body.charsPerLine).toBe(48)
    expect(body.font).toBe('A')
    expect(body.buzzer).toBe(false)
    expect(body.paperCut).toBe('partial')
    expect(body.eventId).toBe(eventId)
  })

  it('POST creates a dummy printer with defaults', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/printers`,
      payload: { name: 'Dummy Printer', type: 'dummy' },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.type).toBe('dummy')
    expect(body.ip).toBeNull()
    expect(body.charsPerLine).toBe(42)
  })

  it('POST returns 400 for missing name', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/printers`,
      payload: { type: 'dummy' },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST returns 404 for non-existent event', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/events/nonexistent/printers',
      payload: { name: 'Test', type: 'dummy' },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(404)
  })

  it('GET lists printers for an event', async () => {
    await prisma.printer.create({ data: { name: 'B', type: 'dummy', eventId } })
    await prisma.printer.create({ data: { name: 'A', type: 'dummy', eventId } })

    const res = await server.inject({
      method: 'GET',
      url: `/api/events/${eventId}/printers`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(2)
    expect(body.map((p: { name: string }) => p.name)).toEqual(['A', 'B'])
  })

  it('GET /printers/:id returns a single printer', async () => {
    const created = await prisma.printer.create({ data: { name: 'Test', type: 'ignore', eventId } })

    const res = await server.inject({ method: 'GET', url: `/api/printers/${created.id}` })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Test')
  })

  it('GET /printers/:id returns 404 for missing printer', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/printers/nonexistent' })
    expect(res.statusCode).toBe(404)
  })

  it('PUT updates a printer', async () => {
    const created = await prisma.printer.create({ data: { name: 'Original', type: 'dummy', eventId } })

    const res = await server.inject({
      method: 'PUT',
      url: `/api/printers/${created.id}`,
      payload: { name: 'Updated', ip: '10.0.0.1', charsPerLine: 80, buzzer: true },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.name).toBe('Updated')
    expect(body.ip).toBe('10.0.0.1')
    expect(body.charsPerLine).toBe(80)
    expect(body.buzzer).toBe(true)
  })

  it('PUT returns 404 for missing printer', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/printers/nonexistent',
      payload: { name: 'Nope' },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(404)
  })

  it('DELETE removes a printer', async () => {
    const created = await prisma.printer.create({ data: { name: 'ToDelete', type: 'dummy', eventId } })

    const res = await server.inject({ method: 'DELETE', url: `/api/printers/${created.id}`, headers: adminHeaders })
    expect(res.statusCode).toBe(204)

    const exists = await prisma.printer.findUnique({ where: { id: created.id } })
    expect(exists).toBeNull()
  })

  it('DELETE returns 404 for missing printer', async () => {
    const res = await server.inject({ method: 'DELETE', url: '/api/printers/nonexistent', headers: adminHeaders })
    expect(res.statusCode).toBe(404)
  })

  it('POST /printers/:id/test returns 200 for dummy printer', async () => {
    const created = await prisma.printer.create({ data: { name: 'Dummy', type: 'dummy', eventId } })

    const res = await server.inject({ method: 'POST', url: `/api/printers/${created.id}/test`, headers: adminHeaders })
    expect(res.statusCode).toBe(200)
    expect(res.json().message).toContain('Test print')
    expect(res.json().bytes).toBeGreaterThan(0)
  })

  it('POST /printers/:id/test returns 502 for unreachable network printer', async () => {
    const created = await prisma.printer.create({ data: { name: 'Net', type: 'network', ip: '192.168.99.99', eventId } })

    const res = await server.inject({ method: 'POST', url: `/api/printers/${created.id}/test`, headers: adminHeaders })
    expect(res.statusCode).toBe(502)
  })

  it('POST /printers/:id/test returns 400 for network printer without IP', async () => {
    const created = await prisma.printer.create({ data: { name: 'NoIP', type: 'network', eventId } })

    const res = await server.inject({ method: 'POST', url: `/api/printers/${created.id}/test`, headers: adminHeaders })
    expect(res.statusCode).toBe(400)
  })

  it('POST /printers/:id/test returns 200 for ignore printer (no-op)', async () => {
    const created = await prisma.printer.create({ data: { name: 'Ign', type: 'ignore', eventId } })

    const res = await server.inject({ method: 'POST', url: `/api/printers/${created.id}/test`, headers: adminHeaders })
    expect(res.statusCode).toBe(200)
    expect(res.json().message).toContain('ignore')
  })
})