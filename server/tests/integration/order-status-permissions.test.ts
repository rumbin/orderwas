import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

/**
 * PATCH /orders/:id must NOT let a caller transition an order to 'paid' or
 * 'cancelled' — those moves are gated on dedicated /pay, /cancel endpoints
 * behind canCashOut / canCancel. Any caller reaching /pay or /cancel is
 * already authenticated, so the generic PATCH is restricted to the
 * preparation statuses only.
 */
describe('Order status transition permissions', () => {
  let server: AppServer
  let eventId: string
  let stationId: string
  let productId: string
  let waiterNoPermId: string
  let waiterNoPermToken: string

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

    const ev = await prisma.event.create({ data: { name: 'Perm Event' } })
    eventId = ev.id
    const st = await prisma.station.create({ data: { name: 'Bar', eventId } })
    stationId = st.id
    const p = await prisma.product.create({ data: { name: 'Bier', priceCents: 300, stationId } })
    productId = p.id
    const w = await prisma.waiter.create({ data: { name: 'NoPerm', pin: '1234', eventId } })
    waiterNoPermId = w.id
    const login = await server.inject({ method: 'POST', url: '/api/auth/login', payload: { waiterId: w.id, pin: '1234' } })
    waiterNoPermToken = login.json().token
  })

  it('PATCH cannot set status to paid via generic endpoint (no canCashOut)', async () => {
    const o = await prisma.order.create({ data: { tableNumber: '1', waiterId: waiterNoPermId, eventId, totalCents: 300 } })
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/orders/${o.id}`,
      headers: { authorization: `Bearer ${waiterNoPermToken}` },
      payload: { status: 'paid' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('PATCH cannot set status to cancelled via generic endpoint', async () => {
    const o = await prisma.order.create({ data: { tableNumber: '1', waiterId: waiterNoPermId, eventId, totalCents: 300 } })
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/orders/${o.id}`,
      headers: { authorization: `Bearer ${waiterNoPermToken}` },
      payload: { status: 'cancelled' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('PATCH can set preparation statuses (open/preparing/partial/done) with a valid token', async () => {
    const o = await prisma.order.create({ data: { tableNumber: '1', waiterId: waiterNoPermId, eventId, totalCents: 300 } })
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/orders/${o.id}`,
      headers: { authorization: `Bearer ${waiterNoPermToken}` },
      payload: { status: 'preparing' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('preparing')
  })

  it('unauthenticated PATCH on orders → 401 when auth enforced', async () => {
    process.env.AUTH_ENFORCED = 'true'
    const o = await prisma.order.create({ data: { tableNumber: '1', waiterId: waiterNoPermId, eventId, totalCents: 300 } })
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/orders/${o.id}`,
      payload: { status: 'preparing' },
    })
    delete process.env.AUTH_ENFORCED
    expect(res.statusCode).toBe(401)
  })
})