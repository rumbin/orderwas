import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

/**
 * Payment model unification:
 * - an order is 'paid' ⇔ all its non-cancelled items have paidAt set;
 * - order-level pay (POST /orders/:id/pay) and item-level pay
 *   (POST /orders/pay-items) must agree;
 * - money-relevant actions write audit logs.
 */
describe('Payment model', () => {
  let server: AppServer
  let eventId: string
  let stationId: string
  let beerId: string
  let cashierId: string
  let cashierToken: string

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
    await prisma.auditLog.deleteMany({})
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})

    const ev = await prisma.event.create({ data: { name: 'Pay Event' } })
    eventId = ev.id
    const st = await prisma.station.create({ data: { name: 'Bar', eventId } })
    stationId = st.id
    const beer = await prisma.product.create({ data: { name: 'Bier', priceCents: 300, stationId } })
    beerId = beer.id
    const cashier = await prisma.waiter.create({ data: { name: 'Kas', pin: '1234', eventId, canCashOut: true } })
    cashierId = cashier.id
    const login = await server.inject({ method: 'POST', url: '/api/auth/login', payload: { waiterId: cashier.id, pin: '1234' } })
    cashierToken = login.json().token
  })

  async function createOrder(tableNumber = '1', qty = 2): Promise<{ id: string; itemId: string }> {
    const res = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber,
        waiterId: cashierId,
        eventId,
        items: [{ productId: beerId, quantity: qty }],
      },
    })
    const body = res.json()
    return { id: body.id, itemId: body.items[0].id }
  }

  function auth() {
    return { authorization: `Bearer ${cashierToken}` }
  }

  async function waitForAudit(action: string): Promise<number> {
    // audit writes are fire-and-forget; poll briefly for the entry
    for (let i = 0; i < 20; i++) {
      const count = await prisma.auditLog.count({ where: { eventId, action } })
      if (count > 0) return count
      await new Promise((r) => setTimeout(r, 50))
    }
    return prisma.auditLog.count({ where: { eventId, action } })
  }

  it('order-level pay sets paidAt on all items (paid ⇔ all items paid)', async () => {
    const { id } = await createOrder()
    const res = await server.inject({ method: 'POST', url: `/api/orders/${id}/pay`, headers: auth() })
    expect(res.statusCode).toBe(200)

    const items = await prisma.orderItem.findMany({ where: { orderId: id } })
    expect(items.length).toBe(1)
    expect(items[0].paidAt).not.toBeNull()
    expect(items[0].paidByWaiterId).toBe(cashierId)
  })

  it('paid order disappears from open tables (listOpenTables)', async () => {
    const { id } = await createOrder('7')
    await server.inject({ method: 'POST', url: `/api/orders/${id}/pay`, headers: auth() })

    const res = await server.inject({ method: 'GET', url: `/api/events/${eventId}/tables/open`, headers: auth() })
    expect(res.statusCode).toBe(200)
    const tables = res.json()
    expect(tables.find((t: { tableNumber: string }) => t.tableNumber === '7')).toBeUndefined()
  })

  it('reopen clears paidAt / paidByWaiterId so the item is cashier-visible again', async () => {
    const { id } = await createOrder('9')
    await server.inject({ method: 'POST', url: `/api/orders/${id}/pay`, headers: auth() })
    await server.inject({ method: 'POST', url: `/api/orders/${id}/reopen`, headers: auth() })

    const items = await prisma.orderItem.findMany({ where: { orderId: id } })
    expect(items[0].paidAt).toBeNull()
    expect(items[0].paidByWaiterId).toBeNull()

    const tables = await (await server.inject({ method: 'GET', url: `/api/events/${eventId}/tables/open`, headers: auth() })).json()
    expect(tables.find((t: { tableNumber: string }) => t.tableNumber === '9')).toBeDefined()
  })

  it('order-level pay writes an audit log entry', async () => {
    const { id } = await createOrder()
    await server.inject({ method: 'POST', url: `/api/orders/${id}/pay`, headers: auth() })
    expect(await waitForAudit('order.paid')).toBe(1)
    const logs = await prisma.auditLog.findMany({ where: { eventId, action: 'order.paid' } })
    expect(logs[0].entityId).toBe(id)
  })

  it('reopen writes an audit log entry', async () => {
    const { id } = await createOrder()
    await server.inject({ method: 'POST', url: `/api/orders/${id}/pay`, headers: auth() })
    await server.inject({ method: 'POST', url: `/api/orders/${id}/reopen`, headers: auth() })
    expect(await waitForAudit('order.reopened')).toBe(1)
  })

  it('generic PATCH status change writes an audit log entry', async () => {
    const { id } = await createOrder()
    await server.inject({ method: 'PATCH', url: `/api/orders/${id}`, headers: auth(), payload: { status: 'preparing' } })
    expect(await waitForAudit('order.statusChanged')).toBe(1)
    const logs = await prisma.auditLog.findMany({ where: { eventId, action: 'order.statusChanged' } })
    expect(logs[0].afterData).toContain('preparing')
  })

  it('payItems computes sum including option price deltas (server-side math)', async () => {
    // Product with an extra option (+50 cents) on the Schnitzel-style item.
    const extraProd = await prisma.product.create({
      data: { name: 'Snitz', priceCents: 800, stationId },
    })
    const extra = await prisma.productExtra.create({ data: { name: 'Top', productId: extraProd.id } })
    const opt = await prisma.productExtraOption.create({ data: { name: 'mit', extraId: extra.id, priceDeltaCents: 50 } })

    // Create order with an option selection via the API.
    const res = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '3',
        waiterId: cashierId,
        eventId,
        items: [
          { productId: beerId, quantity: 1 },
          { productId: extraProd.id, quantity: 2, optionSelections: [{ extraId: extra.id, optionId: opt.id }] },
        ],
      },
    })
    const order = res.json()
    const itemIds = order.items.map((i: { id: string }) => i.id)
    // beer 300 + snitz (800+50)*2 = 300 + 1700 = 2000
    expect(order.totalCents).toBe(2000)

    const payRes = await server.inject({
      method: 'POST',
      url: '/api/orders/pay-items',
      headers: auth(),
      payload: { itemIds },
    })
    expect(payRes.statusCode).toBe(200)
    const body = payRes.json()
    expect(body.sumCents).toBe(2000)
    expect(body.paidCount).toBe(2)
  })

  it('payItems refuses items from another event (event ownership)', async () => {
    const otherEv = await prisma.event.create({ data: { name: 'Other Event' } })
    const otherSt = await prisma.station.create({ data: { name: 'Other', eventId: otherEv.id } })
    const otherProd = await prisma.product.create({ data: { name: 'P', priceCents: 100, stationId: otherSt.id } })
    const otherWaiter = await prisma.waiter.create({ data: { name: 'OW', pin: '2222', eventId: otherEv.id } })

    const res = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '1',
        waiterId: otherWaiter.id,
        eventId: otherEv.id,
        items: [{ productId: otherProd.id, quantity: 1 }],
      },
    })
    const otherOrder = res.json()
    const otherItemId = otherOrder.items[0].id

    // cashier from eventId tries to pay an item owned by otherEv
    const payRes = await server.inject({
      method: 'POST',
      url: '/api/orders/pay-items',
      headers: auth(),
      payload: { itemIds: [otherItemId] },
    })
    expect([403, 404, 409]).toContain(payRes.statusCode)
  })

  it('concurrent payItems for the same item lets exactly one succeed', async () => {
    const { itemId } = await createOrder('5', 1)
    const results = await Promise.all([
      server.inject({ method: 'POST', url: '/api/orders/pay-items', headers: auth(), payload: { itemIds: [itemId] } }),
      server.inject({ method: 'POST', url: '/api/orders/pay-items', headers: auth(), payload: { itemIds: [itemId] } }),
    ])
    const codes = results.map((r) => r.statusCode).sort()
    expect(codes.filter((c) => c === 200).length).toBe(1)
    expect(codes.some((c) => c === 409)).toBe(true)
  })
})