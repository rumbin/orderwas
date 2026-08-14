import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { waitersRoutes } from '@/routes/waiters'
import { ordersRoutes } from '@/routes/orders'
import { prisma } from '@/db/client'
import { createTestData, cleanupTestData, type TestData } from '../helpers/setup'

let server: AppServer

beforeAll(async () => {
  server = buildServer()
  server.register(waitersRoutes)
  server.register(ordersRoutes)
  await server.ready()
})

afterAll(async () => {
  await server.close()
})

/**
 * Each test gets its own fresh event, station, products and waiter so that
 * destructive `deleteMany({})` calls in other test suites (which run
 * concurrently) can't wipe data mid-test.  We track created sets for cleanup.
 */
const created: TestData[] = []

afterEach(async () => {
  for (const data of created.splice(0)) {
    await cleanupTestData(data)
  }
})

async function setup(): Promise<TestData> {
  const data = await createTestData(server)
  created.push(data)
  return data
}

describe('Orders API - POST /api/orders', () => {
  it('creates an order, calculates total from product prices × quantities', async () => {
    const data = await setup()
    const { beer, schnitzel } = data.products
    const { waiter, event } = data

    const res = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '5',
        waiterId: waiter.id,
        eventId: event.id,
        items: [
          { productId: beer.id, quantity: 2 },
          { productId: schnitzel.id, quantity: 1 },
        ],
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as Record<string, unknown>
    expect(body.id).toBeDefined()
    expect(body.tableNumber).toBe('5')
    expect(body.waiterId).toBe(waiter.id)
    expect(body.eventId).toBe(event.id)
    expect(body.status).toBe('open')
    expect(body.totalCents).toBe(1400) // 2×300 + 1×800
    const items = body.items as unknown[]
    expect(items.length).toBe(2)
  })

  it('calculates total correctly with non-trivial cent prices (no rounding)', async () => {
    const data = await setup()
    const { waiter, event } = data
    // Create a product with €3.50 = 350 cents
    const product = await prisma.product.create({
      data: { name: 'Special', priceCents: 350, stationId: data.station.id },
    })

    const res = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '42',
        waiterId: waiter.id,
        eventId: event.id,
        items: [{ productId: product.id, quantity: 3 }],
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as Record<string, unknown>
    expect(body.totalCents).toBe(1050) // 3 × 350 = 1050 exactly, no float error
  })

  it('rejects an order without items (400 validation error)', async () => {
    const data = await setup()
    const { waiter, event } = data
    const res = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '6',
        waiterId: waiter.id,
        eventId: event.id,
        items: [],
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects an order with a non-existent waiter (error)', async () => {
    const data = await setup()
    const { beer } = data.products
    const { event } = data
    const res = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '7',
        waiterId: 'nonexistent-waiter',
        eventId: event.id,
        items: [{ productId: beer.id, quantity: 1 }],
      },
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })
})

describe('Orders API - GET /api/events/:eventId/orders', () => {
  it('lists orders for an event including items with product names', async () => {
    const data = await setup()
    const { beer, schnitzel } = data.products
    const { waiter, event } = data

    // create an order in this event first
    await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '10',
        waiterId: waiter.id,
        eventId: event.id,
        items: [
          { productId: beer.id, quantity: 1 },
          { productId: schnitzel.id, quantity: 1 },
        ],
      },
    })

    const res = await server.inject({ method: 'GET', url: `/api/events/${event.id}/orders` })
    expect(res.statusCode).toBe(200)
    const list = res.json() as Array<Record<string, unknown>>
    expect(list.length).toBeGreaterThan(0)
    const order = list[list.length - 1]
    const items = order.items as Array<Record<string, unknown>>
    expect(items.length).toBeGreaterThanOrEqual(2)
    items.forEach((item) => {
      const product = item.product as Record<string, unknown>
      expect(product).toBeDefined()
      expect(typeof product.name).toBe('string')
    })
  })
})

describe('Orders API - GET /api/orders/:id', () => {
  it('fetches a single order with items', async () => {
    const data = await setup()
    const { beer } = data.products
    const { waiter, event } = data

    const created = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '20',
        waiterId: waiter.id,
        eventId: event.id,
        items: [{ productId: beer.id, quantity: 3 }],
      },
    })
    const id = (created.json() as Record<string, unknown>).id as string

    const res = await server.inject({ method: 'GET', url: `/api/orders/${id}` })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, unknown>
    expect(body.id).toBe(id)
    expect(body.tableNumber).toBe('20')
    expect(body.totalCents).toBe(900) // 3×300
    expect((body.items as unknown[]).length).toBe(1)
  })
})

describe('Orders API - PATCH /api/orders/:id', () => {
  it('updates order status to paid', async () => {
    const data = await setup()
    const { beer } = data.products
    const { waiter, event } = data

    const created = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '30',
        waiterId: waiter.id,
        eventId: event.id,
        items: [{ productId: beer.id, quantity: 1 }],
      },
    })
    const id = (created.json() as Record<string, unknown>).id as string

    const res = await server.inject({
      method: 'PATCH',
      url: `/api/orders/${id}`,
      payload: { status: 'paid' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, unknown>
    expect(body.status).toBe('paid')

    // Verify it persisted
    const getRes = await server.inject({ method: 'GET', url: `/api/orders/${id}` })
    expect((getRes.json() as Record<string, unknown>).status).toBe('paid')
  })

  it('rejects an invalid status (400)', async () => {
    const data = await setup()
    const { beer } = data.products
    const { waiter, event } = data

    const created = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '31',
        waiterId: waiter.id,
        eventId: event.id,
        items: [{ productId: beer.id, quantity: 1 }],
      },
    })
    const id = (created.json() as Record<string, unknown>).id as string

    const res = await server.inject({
      method: 'PATCH',
      url: `/api/orders/${id}`,
      payload: { status: 'bogus-status' },
    })
    expect(res.statusCode).toBe(400)
  })
})