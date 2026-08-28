import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

/**
 * QR guest ordering (public, token-in-URL). Guest orders must be attributed to
 * a dedicated ghost waiter, not an arbitrary active waiter.
 */
describe('Guest QR ordering', () => {
  let server: AppServer
  let eventId: string
  let stationId: string
  let beerId: string
  let adminHeaders: { authorization: string }

  beforeAll(async () => {
    server = buildServer()
    await server.listen({ port: 0, host: '127.0.0.1' })
  })
  afterAll(async () => {
    await server.close()
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.auditLog.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })
  beforeEach(async () => {
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.auditLog.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})

    const ev = await prisma.event.create({ data: { name: 'QR Event', status: 'live' } })
    eventId = ev.id
    const st = await prisma.station.create({ data: { name: 'Bar', eventId } })
    stationId = st.id
    const beer = await prisma.product.create({ data: { name: 'Bier', priceCents: 300, stationId } })
    beerId = beer.id
    adminHeaders = { authorization: `Bearer ${server.jwt.sign({ admin: true }, { expiresIn: '8h' })}` }
  })

  function guestToken(table: string): string {
    return Buffer.from(`${eventId}:${table}`).toString('base64url')
  }

  it('creates a guest order attributed to a dedicated ghost waiter', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/guest/orders',
      payload: { token: guestToken('12'), items: [{ productId: beerId, quantity: 2 }] },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.orderId).toBeDefined()
    expect(body.totalCents).toBe(600)

    const order = await prisma.order.findUnique({ where: { id: body.orderId } })
    expect(order!.tableNumber).toBe('12')
    // attributed to a ghost waiter (hidden), not an arbitrary active waiter
    const ghost = await prisma.waiter.findUnique({ where: { id: order!.waiterId } })
    expect(ghost).toBeDefined()
    expect(ghost!.hidden).toBe(true)
  })

  it('rejects an invalid token (400)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/guest/orders',
      payload: { token: 'not-a-valid-token', items: [{ productId: beerId, quantity: 1 }] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects an order for a non-existent / non-live event (404)', async () => {
    const fakeToken = Buffer.from('nonexistentevent:5').toString('base64url')
    const res = await server.inject({
      method: 'POST',
      url: '/api/guest/orders',
      payload: { token: fakeToken, items: [{ productId: beerId, quantity: 1 }] },
    })
    expect(res.statusCode).toBe(404)
  })

  it('rejects a product that is unavailable or missing (400)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/guest/orders',
      payload: { token: guestToken('3'), items: [{ productId: 'does-not-exist', quantity: 1 }] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects when stock is insufficient (409)', async () => {
    const tracked = await prisma.product.create({
      data: { name: 'Letzte', priceCents: 250, stationId, stockMode: 'tracked', stockCount: 1 },
    })
    const res = await server.inject({
      method: 'POST',
      url: '/api/guest/orders',
      payload: { token: guestToken('8'), items: [{ productId: tracked.id, quantity: 5 }] },
    })
    expect(res.statusCode).toBe(409)
  })
})