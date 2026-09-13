import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

/**
 * Theke (counter) feature — backend suite.
 *
 * Covers:
 *  - Theke waiter lifecycle driven by Event.counterEnabled (Task A2)
 *  - Counter order creation with Bon (tear-off) numbers (Task A3)
 *  - Unpaid-counter-order endpoint for the cashier screen (Task A4)
 */
describe('Theke / counter', () => {
  let server: AppServer
  let adminToken: string
  let eventId: string
  let stationId: string
  let beerId: string
  let counterId: string
  let counterToken: string
  let waiterId: string

  const wipe = async () => {
    await prisma.auditLog.deleteMany({})
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  }

  const putEvent = (body: Record<string, unknown>) =>
    server.inject({
      method: 'PUT',
      url: `/api/events/${eventId}`,
      payload: body,
      headers: { authorization: `Bearer ${adminToken}` },
    })

  const postOrder = (payload: Record<string, unknown>) =>
    server.inject({ method: 'POST', url: '/api/orders', payload })

  const getCounterUnpaid = () =>
    server.inject({ method: 'GET', url: `/api/events/${eventId}/counter/unpaid` })

  beforeAll(async () => {
    server = buildServer()
    await server.listen({ port: 0, host: '127.0.0.1' })
    adminToken = server.jwt.sign({ admin: true }, { expiresIn: '8h' })
  })

  afterAll(async () => {
    await server.close()
    await wipe()
  })

  beforeEach(async () => {
    await wipe()

    const event = await prisma.event.create({ data: { name: 'Theke Testfest', status: 'test' } })
    eventId = event.id
    const station = await prisma.station.create({ data: { name: 'Bar', eventId } })
    stationId = station.id
    const beer = await prisma.product.create({ data: { name: 'Bier', priceCents: 300, stationId } })
    beerId = beer.id
    const waiter = await prisma.waiter.create({ data: { name: 'Alice', pin: '1234', eventId } })
    waiterId = waiter.id

    // Enable the counter -> creates the Theke waiter, then log in as it.
    await putEvent({ counterEnabled: true })
    const counter = await prisma.waiter.findFirstOrThrow({ where: { eventId, isCounter: true } })
    counterId = counter.id
    const login = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { waiterId: counter.id, pin: '0000' },
    })
    counterToken = login.json().token
  })

  // --- Task A2: Theke waiter lifecycle -------------------------------------

  describe('counterEnabled lifecycle', () => {
    it('enabling the counter creates a Theke waiter with cashier permissions', async () => {
      const theke = await prisma.waiter.findMany({ where: { eventId, isCounter: true } })
      expect(theke).toHaveLength(1)
      expect(theke[0].name).toBe('Theke')
      expect(theke[0].canCashOut).toBe(true)
      expect(theke[0].canCancel).toBe(true)
      expect(theke[0].hidden).toBe(false)
    })

    it('enabling twice does not create a second Theke waiter', async () => {
      await putEvent({ counterEnabled: true })
      await putEvent({ counterEnabled: true })

      const theke = await prisma.waiter.count({ where: { eventId, isCounter: true } })
      expect(theke).toBe(1)
    })

    it('re-enabling after a disable provides exactly one working Theke waiter', async () => {
      await putEvent({ counterEnabled: false })
      await putEvent({ counterEnabled: true })

      const theke = await prisma.waiter.findMany({ where: { eventId, isCounter: true } })
      expect(theke).toHaveLength(1)
      expect(theke[0].name).toBe('Theke')
      expect(theke[0].hidden).toBe(false)
      expect(theke[0].active).toBe(true)
    })

    it('disabling deletes the Theke waiter when it has no orders', async () => {
      await putEvent({ counterEnabled: false })

      const count = await prisma.waiter.count({ where: { eventId, isCounter: true } })
      expect(count).toBe(0)
    })

    it('disabling hides (not deletes) the Theke waiter when it has orders', async () => {
      await prisma.order.create({ data: { eventId, waiterId: counterId, status: 'open', totalCents: 0 } })

      await putEvent({ counterEnabled: false })

      const after = await prisma.waiter.findMany({ where: { eventId, isCounter: true } })
      expect(after).toHaveLength(1)
      expect(after[0].hidden).toBe(true)
    })

    it('does not touch the Theke waiter when counterEnabled is not part of the update', async () => {
      await putEvent({ name: 'Renamed' })

      const theke = await prisma.waiter.findMany({ where: { eventId, isCounter: true } })
      expect(theke).toHaveLength(1)
      expect(theke[0].hidden).toBe(false)
    })

    it('exposes isCounter through the waiter list and the login response', async () => {
      const list = await server.inject({
        method: 'GET',
        url: `/api/events/${eventId}/waiters`,
      })
      const thekeInList = list.json().find((w: { id: string }) => w.id === counterId)
      expect(thekeInList.isCounter).toBe(true)
      expect(thekeInList.pin).toBeUndefined()

      const login = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { waiterId: counterId, pin: '0000' },
      })
      expect(login.json().waiter.isCounter).toBe(true)
    })
  })

  // --- Task A3: counter order creation ------------------------------------

  describe('counter order creation', () => {
    it('creates a counter order carrying the submitted Bon as tear-off number', async () => {
      const res = await postOrder({
        tearOffNumber: 7,
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 2 }],
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.tearOffNumber).toBe(7)
      expect(body.tableNumber).toBeNull()
      expect(body.pickupCode).toBeNull()
      expect(body.totalCents).toBe(600)
      expect(body.waiterId).toBe(counterId)
    })

    it('auto-assigns the next Bon when the counter submits none', async () => {
      await prisma.waiter.update({ where: { id: counterId }, data: { tearOffNumber: 4 } })

      const res = await postOrder({
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().tearOffNumber).toBe(5)
    })

    it('bumps the waiter counter when a manually entered Bon is ahead of it', async () => {
      const res = await postOrder({
        tearOffNumber: 20,
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      expect(res.statusCode).toBe(201)

      const waiter = await prisma.waiter.findUniqueOrThrow({ where: { id: counterId } })
      expect(waiter.tearOffNumber).toBe(20)

      // The next auto-assigned Bon continues after the manual one.
      await prisma.orderItem.updateMany({ data: { paidAt: new Date() } })
      await prisma.order.updateMany({ data: { status: 'paid' } })
      const next = await postOrder({ waiterId: counterId, eventId, items: [{ productId: beerId, quantity: 1 }] })
      expect(next.json().tearOffNumber).toBe(21)
    })

    it('rejects a Bon number that is already in use', async () => {
      const first = await postOrder({
        tearOffNumber: 3,
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      expect(first.statusCode).toBe(201)

      // Pay the first order so only the duplicate-Bon rule can reject the second.
      await prisma.orderItem.updateMany({ data: { paidAt: new Date() } })
      await prisma.order.updateMany({ data: { status: 'paid' } })

      const duplicate = await postOrder({
        tearOffNumber: 3,
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      expect(duplicate.statusCode).toBe(409)
    })

    it('rejects a Bon number that is not a positive integer', async () => {
      const res = await postOrder({
        tearOffNumber: -1,
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      expect(res.statusCode).toBe(400)
    })

    it('rejects an order with neither table nor pickup code from a regular waiter', async () => {
      const res = await postOrder({
        waiterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      expect(res.statusCode).toBe(400)
    })

    it('rejects a manual Bon from a regular waiter', async () => {
      const res = await postOrder({
        tableNumber: '5',
        tearOffNumber: 9,
        waiterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      expect(res.statusCode).toBe(400)
    })

    it('keeps accepting regular table orders alongside the counter', async () => {
      const res = await postOrder({
        tableNumber: '5',
        waiterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().tableNumber).toBe('5')
    })

    it('blocks a second counter order while the previous one is unpaid', async () => {
      const first = await postOrder({
        tearOffNumber: 1,
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      expect(first.statusCode).toBe(201)

      const second = await postOrder({
        tearOffNumber: 2,
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      expect(second.statusCode).toBe(409)
    })

    it('allows the next counter order once the previous one is fully paid', async () => {
      const first = await postOrder({
        tearOffNumber: 1,
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      const itemIds = (first.json().items as { id: string }[]).map((i) => i.id)

      const pay = await server.inject({
        method: 'POST',
        url: '/api/orders/pay-items',
        payload: { itemIds },
        headers: { authorization: `Bearer ${counterToken}` },
      })
      expect(pay.statusCode).toBe(200)

      const second = await postOrder({
        tearOffNumber: 2,
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      expect(second.statusCode).toBe(201)
    })

    it('does not let a partially paid counter order block the counter (item-level payment)', async () => {
      const first = await postOrder({
        tearOffNumber: 1,
        waiterId: counterId,
        eventId,
        items: [
          { productId: beerId, quantity: 1 },
          { productId: beerId, quantity: 1 },
        ],
      })
      const firstItem = (first.json().items as { id: string }[])[0].id

      await server.inject({
        method: 'POST',
        url: '/api/orders/pay-items',
        payload: { itemIds: [firstItem] },
        headers: { authorization: `Bearer ${counterToken}` },
      })

      const second = await postOrder({
        tearOffNumber: 2,
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      // One item is still unpaid -> the counter stays blocked.
      expect(second.statusCode).toBe(409)
    })

    it('does not let a cancelled counter order block the counter', async () => {
      const first = await postOrder({
        tearOffNumber: 1,
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      const orderId = first.json().id

      await server.inject({
        method: 'POST',
        url: `/api/orders/${orderId}/cancel`,
        headers: { authorization: `Bearer ${counterToken}` },
      })

      const second = await postOrder({
        tearOffNumber: 2,
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      expect(second.statusCode).toBe(201)
    })
  })

  // --- Task A4: unpaid counter order endpoint -----------------------------

  describe('GET /events/:eventId/counter/unpaid', () => {
    it('returns no order when the counter has nothing open', async () => {
      const res = await getCounterUnpaid()
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })

    it('returns the submitted counter order with its Bon and unpaid items', async () => {
      await postOrder({
        tearOffNumber: 11,
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 2 }],
      })

      const res = await getCounterUnpaid()
      expect(res.statusCode).toBe(200)
      const orders = res.json()
      expect(orders).toHaveLength(1)
      expect(orders[0].tearOffNumber).toBe(11)
      expect(orders[0].waiterName).toBe('Theke')
      expect(orders[0].waiterIsCounter).toBe(true)
      expect(orders[0].items).toHaveLength(1)
      expect(orders[0].items[0].lineTotalCents).toBe(600)
      expect(orders[0].items[0].paidAt).toBeNull()
    })

    it('ignores regular waiter orders', async () => {
      await postOrder({
        tableNumber: '5',
        waiterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })

      const res = await getCounterUnpaid()
      expect(res.json()).toEqual([])
    })

    it('returns nothing once the counter order is fully paid', async () => {
      const created = await postOrder({
        tearOffNumber: 12,
        waiterId: counterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      const itemIds = (created.json().items as { id: string }[]).map((i) => i.id)

      await server.inject({
        method: 'POST',
        url: '/api/orders/pay-items',
        payload: { itemIds },
        headers: { authorization: `Bearer ${counterToken}` },
      })

      const res = await getCounterUnpaid()
      expect(res.json()).toEqual([])
    })
  })
})
