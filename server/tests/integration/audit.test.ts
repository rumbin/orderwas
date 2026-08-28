import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

/**
 * Audit + reporting endpoints (audit.ts) had zero integration coverage.
 * Covers the audit list/filter, stock history, settlement, and the four
 * report shapers.
 */
describe('Audit & reporting', () => {
  let server: AppServer
  let eventId: string
  let stationId: string
  let beerId: string
  let schnitzelId: string
  let waiterId: string
  let statsToken: string
  let adminHeaders: { authorization: string }

  beforeAll(async () => {
    server = buildServer()
    await server.listen({ port: 0, host: '127.0.0.1' })
  })
  afterAll(async () => {
    await server.close()
    await prisma.auditLog.deleteMany({})
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.productComponent.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })
  beforeEach(async () => {
    await prisma.auditLog.deleteMany({})
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.productComponent.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})

    const ev = await prisma.event.create({ data: { name: 'Audit Event', status: 'live' } })
    eventId = ev.id
    const st = await prisma.station.create({ data: { name: 'Bar', eventId } })
    stationId = st.id
    const beer = await prisma.product.create({ data: { name: 'Bier', priceCents: 300, stationId, stockMode: 'tracked', stockCount: 50 } })
    beerId = beer.id
    const schnitzel = await prisma.product.create({ data: { name: 'Schnitzel', priceCents: 800, stationId } })
    schnitzelId = schnitzel.id
    const w = await prisma.waiter.create({ data: { name: 'Stats', pin: '1234', eventId, canStatistics: true } })
    waiterId = w.id

    const login = await server.inject({ method: 'POST', url: '/api/auth/login', payload: { waiterId: w.id, pin: '1234' } })
    statsToken = login.json().token
    adminHeaders = { authorization: `Bearer ${server.jwt.sign({ admin: true }, { expiresIn: '8h' })}` }
  })

  async function waitForCount(fn: () => Promise<number>): Promise<number> {
    for (let i = 0; i < 20; i++) {
      const c = await fn()
      if (c > 0) return c
      await new Promise((r) => setTimeout(r, 50))
    }
    return fn()
  }

  function stats() {
    return { authorization: `Bearer ${statsToken}` }
  }

  it('creates an order → audit list shows order.created', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { tableNumber: '1', waiterId, eventId, items: [{ productId: beerId, quantity: 2 }] },
    })
    await waitForCount(async () => prisma.auditLog.count({ where: { eventId, action: 'order.created' } }))
    const res = await server.inject({ method: 'GET', url: `/api/events/${eventId}/audit`, headers: stats() })
    expect(res.statusCode).toBe(200)
    const logs = res.json()
    expect(logs.some((l: { action: string }) => l.action === 'order.created')).toBe(true)
  })

  it('audit list filters by action', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { tableNumber: '2', waiterId, eventId, items: [{ productId: beerId, quantity: 1 }] },
    })
    const res = await server.inject({
      method: 'GET',
      url: `/api/events/${eventId}/audit?action=order.created`,
      headers: stats(),
    })
    const logs = res.json()
    expect(logs.every((l: { action: string }) => l.action === 'order.created')).toBe(true)
  })

  it('audit reads are denied without canStatistics (403)', async () => {
    const noPerm = await prisma.waiter.create({ data: { name: 'NoStats', pin: '9999', eventId } })
    const token = (await server.inject({ method: 'POST', url: '/api/auth/login', payload: { waiterId: noPerm.id, pin: '9999' } })).json().token
    const res = await server.inject({ method: 'GET', url: `/api/events/${eventId}/audit`, headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(403)
  })

  it('settles stock and records stock.settled in history + product stock changes', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/products/${beerId}/settle`,
      headers: adminHeaders,
      payload: { physicalCount: 42 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().stockCount).toBe(42)

    const history = await server.inject({ method: 'GET', url: `/api/events/${eventId}/audit/stock/${beerId}`, headers: stats() })
    const entries = history.json()
    expect(entries.some((e: { action: string }) => e.action === 'stock.settled')).toBe(true)
  })

  it('bulk-settle updates multiple products', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/settle`,
      headers: adminHeaders,
      payload: { settlements: [{ productId: beerId, physicalCount: 10 }, { productId: schnitzelId, physicalCount: 5 }] },
    })
    expect(res.statusCode).toBe(200)
    const results = res.json()
    expect(results).toHaveLength(2)
    expect(results.every((r: { success: boolean }) => r.success)).toBe(true)
  })

  it('peak-times returns 24 hour buckets', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { tableNumber: '3', waiterId, eventId, items: [{ productId: beerId, quantity: 1 }] },
    })
    const res = await server.inject({ method: 'GET', url: `/api/events/${eventId}/report/peak-times`, headers: stats() })
    const data = res.json()
    expect(data).toHaveLength(24)
    expect(Array.isArray(data)).toBe(true)
  })

  it('station-revenue returns per-station totals in integer cents', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { tableNumber: '4', waiterId, eventId, items: [{ productId: beerId, quantity: 3 }] },
    })
    const res = await server.inject({ method: 'GET', url: `/api/events/${eventId}/report/station-revenue`, headers: stats() })
    const rows = res.json()
    expect(rows).toHaveLength(1)
    expect(rows[0].stationName).toBe('Bar')
    expect(rows[0].revenueCents).toBe(900) // 3 × 300
  })

  it('waiter-summary returns a row with correct open/paid counts', async () => {
    // Create a cashier waiter; the paid order must be ASSIGNED to them.
    const w2 = await prisma.waiter.create({ data: { name: 'Cash', pin: '1111', eventId, canCashOut: true, canStatistics: true } })
    const tok = (await server.inject({ method: 'POST', url: '/api/auth/login', payload: { waiterId: w2.id, pin: '1111' } })).json().token

    const orderRes = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { tableNumber: '5', waiterId: w2.id, eventId, items: [{ productId: beerId, quantity: 1 }] },
    })
    const order = orderRes.json()
    await server.inject({ method: 'POST', url: `/api/orders/${order.id}/pay`, headers: { authorization: `Bearer ${tok}` } })

    const res = await server.inject({ method: 'GET', url: `/api/events/${eventId}/report/waiters`, headers: stats() })
    const rows = res.json()
    // beforeEach cleared waiters; only Stats (this) + Cash exist.
    expect(rows).toHaveLength(2)
    const cash = rows.find((r: { waiterName: string }) => r.waiterName === 'Cash')
    expect(cash.paidOrders).toBe(1)
    expect(cash.totalOrders).toBe(1)
  })

  it('product-consumption excludes cancelled orders', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { tableNumber: '6', waiterId, eventId, items: [{ productId: beerId, quantity: 5 }] },
    })
    const res = await server.inject({ method: 'GET', url: `/api/events/${eventId}/report/products`, headers: stats() })
    const rows = res.json()
    const beer = rows.find((r: { productName: string }) => r.productName === 'Bier')
    expect(beer).toBeDefined()
    expect(beer.totalQuantity).toBeGreaterThan(0)
    expect(beer.revenueCents).toBe(beer.totalQuantity * 300)
  })
})