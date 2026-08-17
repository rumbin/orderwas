import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

describe('Order lifecycle: comments, status, cancel, pay', () => {
  let server: AppServer
  let eventId: string
  let barStationId: string
  let beerId: string
  let aliceToken: string // canCancel + canCashOut
  let bobToken: string // no permissions
  let aliceId: string
  let bobId: string

  beforeAll(async () => {
    server = buildServer()
    await server.ready()
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

    const ev = await prisma.event.create({ data: { name: 'Lifecycle Test' } })
    eventId = ev.id
    const station = await prisma.station.create({ data: { name: 'Bar', eventId } })
    barStationId = station.id
    beerId = (await prisma.product.create({ data: { name: 'Bier', priceCents: 300, stationId: station.id } })).id

    const alice = await prisma.waiter.create({
      data: { name: 'Alice', pin: '1234', eventId, canCancel: true, canCashOut: true },
    })
    aliceId = alice.id
    const bob = await prisma.waiter.create({
      data: { name: 'Bob', pin: '5678', eventId },
    })
    bobId = bob.id

    const aliceLogin = await server.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { waiterId: aliceId, pin: '1234' },
    })
    aliceToken = aliceLogin.json().token
    const bobLogin = await server.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { waiterId: bobId, pin: '5678' },
    })
    bobToken = bobLogin.json().token
  })

  async function createOrder(tableNumber = '1', quantity = 2) {
    const res = await server.inject({
      method: 'POST', url: '/api/orders',
      payload: {
        tableNumber,
        waiterId: aliceId,
        eventId,
        items: [{ productId: beerId, quantity }],
      },
    })
    return res.json()
  }

  // --- Item comments (6.1) ---
  it('PATCH /order-items/:id updates comment', async () => {
    const order = await createOrder()
    const itemId = order.items[0].id

    const res = await server.inject({
      method: 'PATCH', url: `/api/order-items/${itemId}`,
      payload: { comment: 'ohne Schaum' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().comment).toBe('ohne Schaum')

    const orderRes = await server.inject({ method: 'GET', url: `/api/orders/${order.id}` })
    expect(orderRes.json().items[0].comment).toBe('ohne Schaum')
  })

  it('PATCH /order-items/:id transitions status open→prepared→delivered', async () => {
    const order = await createOrder()
    const itemId = order.items[0].id

    const r1 = await server.inject({
      method: 'PATCH', url: `/api/order-items/${itemId}`,
      payload: { status: 'prepared' },
    })
    expect(r1.statusCode).toBe(200)
    expect(r1.json().status).toBe('prepared')

    const r2 = await server.inject({
      method: 'PATCH', url: `/api/order-items/${itemId}`,
      payload: { status: 'delivered' },
    })
    expect(r2.statusCode).toBe(200)
    expect(r2.json().status).toBe('delivered')
  })

  it('PATCH /order-items/:id rejects invalid status', async () => {
    const order = await createOrder()
    const res = await server.inject({
      method: 'PATCH', url: `/api/order-items/${order.items[0].id}`,
      payload: { status: 'flying' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('PATCH /order-items/:id returns 404 for missing item', async () => {
    const res = await server.inject({
      method: 'PATCH', url: '/api/order-items/nonexistent',
      payload: { comment: 'x' },
    })
    expect(res.statusCode).toBe(404)
  })

  // --- Cancel flows (6.3) ---
  it('POST /orders/:id/cancel cancels order + all items (with canCancel)', async () => {
    const order = await createOrder()
    const res = await server.inject({
      method: 'POST', url: `/api/orders/${order.id}/cancel`,
      headers: { authorization: `Bearer ${aliceToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('cancelled')

    const orderRes = await server.inject({ method: 'GET', url: `/api/orders/${order.id}` })
    const body = orderRes.json()
    expect(body.status).toBe('cancelled')
    body.items.forEach((i: { status: string }) => expect(i.status).toBe('cancelled'))
  })

  it('POST /orders/:id/cancel returns 403 without canCancel', async () => {
    const order = await createOrder()
    const res = await server.inject({
      method: 'POST', url: `/api/orders/${order.id}/cancel`,
      headers: { authorization: `Bearer ${bobToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST /orders/:id/cancel returns 401 without token', async () => {
    const order = await createOrder()
    const res = await server.inject({ method: 'POST', url: `/api/orders/${order.id}/cancel` })
    expect(res.statusCode).toBe(401)
  })

  it('POST /orders/:id/cancel rejects already-paid order (409)', async () => {
    const order = await createOrder()
    await server.inject({
      method: 'POST', url: `/api/orders/${order.id}/pay`,
      headers: { authorization: `Bearer ${aliceToken}` },
    })
    const res = await server.inject({
      method: 'POST', url: `/api/orders/${order.id}/cancel`,
      headers: { authorization: `Bearer ${aliceToken}` },
    })
    expect(res.statusCode).toBe(409)
  })

  it('POST /order-items/:id/cancel cancels single item, total unchanged', async () => {
    const order = await createOrder('5', 2)
    const itemId = order.items[0].id

    const res = await server.inject({
      method: 'POST', url: `/api/order-items/${itemId}/cancel`,
      headers: { authorization: `Bearer ${aliceToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('cancelled')

    // Total stays as printed (audit trail)
    const orderRes = await server.inject({ method: 'GET', url: `/api/orders/${order.id}` })
    expect(orderRes.json().totalCents).toBe(600)
  })

  it('POST /order-items/:id/cancel returns 403 without canCancel', async () => {
    const order = await createOrder()
    const res = await server.inject({
      method: 'POST', url: `/api/order-items/${order.items[0].id}/cancel`,
      headers: { authorization: `Bearer ${bobToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  // --- Pay / reopen (6.8) ---
  it('POST /orders/:id/pay marks paid (with canCashOut)', async () => {
    const order = await createOrder()
    const res = await server.inject({
      method: 'POST', url: `/api/orders/${order.id}/pay`,
      headers: { authorization: `Bearer ${aliceToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('paid')
  })

  it('POST /orders/:id/pay returns 403 without canCashOut', async () => {
    const order = await createOrder()
    const res = await server.inject({
      method: 'POST', url: `/api/orders/${order.id}/pay`,
      headers: { authorization: `Bearer ${bobToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST /orders/:id/reopen reopens paid order', async () => {
    const order = await createOrder()
    await server.inject({
      method: 'POST', url: `/api/orders/${order.id}/pay`,
      headers: { authorization: `Bearer ${aliceToken}` },
    })
    const res = await server.inject({
      method: 'POST', url: `/api/orders/${order.id}/reopen`,
      headers: { authorization: `Bearer ${aliceToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('open')
  })

  it('POST /orders/:id/reopen rejects non-paid order (409)', async () => {
    const order = await createOrder()
    const res = await server.inject({
      method: 'POST', url: `/api/orders/${order.id}/reopen`,
      headers: { authorization: `Bearer ${aliceToken}` },
    })
    expect(res.statusCode).toBe(409)
  })
})