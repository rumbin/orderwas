import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

/**
 * Comprehensive integration tests for the full order flow:
 *  - Seed data → create order → verify totalCents → verify stock → verify items
 *  - Price snapshot: changing product price after order doesn't affect existing orders
 *  - Product deletion guard: products referenced by order items return 409
 */

describe('Order flow integration', () => {
  let server: AppServer
  let eventId: string
  let stationId: string
  let beerId: string
  let colaId: string
  let schnitzelId: string
  let waiterId: string

  beforeAll(async () => {
    server = buildServer()
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
    // FK-safe cleanup
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    // FK-safe cleanup between tests
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})

    // Seed: event
    const event = await prisma.event.create({
      data: { name: 'Flow Test Event', status: 'test' },
    })
    eventId = event.id

    // Seed: station
    const station = await prisma.station.create({
      data: { name: 'Bar', eventId },
    })
    stationId = station.id

    // Seed: products with tracked stock
    const beer = await prisma.product.create({
      data: { name: 'Bier', priceCents: 300, stationId, stockMode: 'tracked', stockCount: 50 },
    })
    beerId = beer.id

    const cola = await prisma.product.create({
      data: { name: 'Cola', priceCents: 250, stationId, stockMode: 'tracked', stockCount: 30 },
    })
    colaId = cola.id

    const schnitzel = await prisma.product.create({
      data: { name: 'Schnitzel', priceCents: 800, stationId, stockMode: 'none' },
    })
    schnitzelId = schnitzel.id

    // Seed: waiter
    const waiter = await prisma.waiter.create({
      data: { name: 'Alice', pin: '1234', eventId },
    })
    waiterId = waiter.id
  })

  // --- Helpers ---

  async function createOrderAndWaiter(
    items: { productId: string; quantity: number }[],
    opts?: { tableNumber?: string; pickupCode?: string },
  ) {
    const payload: Record<string, unknown> = {
      tableNumber: opts?.tableNumber ?? '1',
      waiterId,
      eventId,
      items,
    }
    if (opts?.pickupCode) {
      payload.pickupCode = opts.pickupCode
      delete payload.tableNumber
    }
    const res = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload,
    })
    return { status: res.statusCode, body: res.json() as Record<string, unknown> }
  }

  // --- Tests: Order creation + totalCents ---

  it('creates an order with correct totalCents from product prices × quantities', async () => {
    const { status, body } = await createOrderAndWaiter([
      { productId: beerId, quantity: 2 },
      { productId: schnitzelId, quantity: 1 },
    ])

    expect(status).toBe(201)
    // 2 × 300 + 1 × 800 = 1400
    expect(body.totalCents).toBe(1400)
    expect(body.status).toBe('open')
    expect(body.waiterId).toBe(waiterId)
    expect(body.eventId).toBe(eventId)
    expect(body.id).toBeDefined()
  })

  it('creates an order with correct totalCents for non-trivial cent amounts', async () => {
    const { status, body } = await createOrderAndWaiter([
      { productId: colaId, quantity: 3 }, // 3 × 250 = 750
      { productId: schnitzelId, quantity: 1 }, // 1 × 800 = 800
    ])

    expect(status).toBe(201)
    expect(body.totalCents).toBe(1550)
  })

  // --- Tests: Order items ---

  it('order items have correct productId and quantity', async () => {
    const { body } = await createOrderAndWaiter([
      { productId: beerId, quantity: 3 },
      { productId: colaId, quantity: 1 },
      { productId: schnitzelId, quantity: 2 },
    ])

    const items = body.items as Array<{
      productId: string
      quantity: number
    }>
    expect(items.length).toBe(3)

    const beerItem = items.find((i) => i.productId === beerId)
    expect(beerItem).toBeDefined()
    expect(beerItem!.quantity).toBe(3)

    const colaItem = items.find((i) => i.productId === colaId)
    expect(colaItem).toBeDefined()
    expect(colaItem!.quantity).toBe(1)

    const schnitzelItem = items.find((i) => i.productId === schnitzelId)
    expect(schnitzelItem).toBeDefined()
    expect(schnitzelItem!.quantity).toBe(2)
  })

  // --- Tests: Stock decrement ---

  it('decrements tracked stock when order is created', async () => {
    // Beer starts at 50, Cola at 30
    const beforeBeer = await prisma.product.findUnique({ where: { id: beerId }, select: { stockCount: true } })
    const beforeCola = await prisma.product.findUnique({ where: { id: colaId }, select: { stockCount: true } })
    expect(beforeBeer!.stockCount).toBe(50)
    expect(beforeCola!.stockCount).toBe(30)

    await createOrderAndWaiter([
      { productId: beerId, quantity: 5 },
      { productId: colaId, quantity: 2 },
    ])

    const afterBeer = await prisma.product.findUnique({ where: { id: beerId }, select: { stockCount: true } })
    const afterCola = await prisma.product.findUnique({ where: { id: colaId }, select: { stockCount: true } })
    expect(afterBeer!.stockCount).toBe(45) // 50 - 5
    expect(afterCola!.stockCount).toBe(28) // 30 - 2
  })

  it('does not decrement stock for products with stockMode none', async () => {
    const before = await prisma.product.findUnique({ where: { id: schnitzelId }, select: { stockCount: true } })
    expect(before!.stockCount).toBe(0) // default

    await createOrderAndWaiter([{ productId: schnitzelId, quantity: 3 }])

    const after = await prisma.product.findUnique({ where: { id: schnitzelId }, select: { stockCount: true } })
    expect(after!.stockCount).toBe(0) // unchanged
  })

  it('decrements stock for multiple orders cumulatively', async () => {
    await createOrderAndWaiter([{ productId: beerId, quantity: 10 }])
    await createOrderAndWaiter([{ productId: beerId, quantity: 5 }])
    await createOrderAndWaiter([{ productId: beerId, quantity: 3 }])

    const after = await prisma.product.findUnique({ where: { id: beerId }, select: { stockCount: true } })
    expect(after!.stockCount).toBe(32) // 50 - 10 - 5 - 3
  })

  it('rejects order when stock is insufficient', async () => {
    // Set beer stock to 2
    await prisma.product.update({ where: { id: beerId }, data: { stockCount: 2 } })

    const { status } = await createOrderAndWaiter([{ productId: beerId, quantity: 5 }])
    expect(status).toBe(409) // Insufficient stock

    // Stock should remain unchanged
    const after = await prisma.product.findUnique({ where: { id: beerId }, select: { stockCount: true } })
    expect(after!.stockCount).toBe(2)
  })

  // --- Tests: Price snapshot ---

  it('changing product price after order does not affect existing order total', async () => {
    // Create order at Beer = 300 cents
    const { body: order } = await createOrderAndWaiter([
      { productId: beerId, quantity: 2 },
    ])
    expect(order.totalCents).toBe(600) // 2 × 300

    // Change product price to 500 cents
    await prisma.product.update({ where: { id: beerId }, data: { priceCents: 500 } })

    // Fetch the existing order — totalCents must still be 600
    const getRes = await server.inject({ method: 'GET', url: `/api/orders/${order.id}` })
    const fetched = getRes.json() as Record<string, unknown>
    expect(fetched.totalCents).toBe(600) // unchanged — price snapshot

    // The order item's product shows the NEW price (product is live), but totalCents is frozen
    const items = fetched.items as Array<{ product: { priceCents: number } }>
    expect(items[0].product.priceCents).toBe(500) // product updated
  })

  it('new orders use the updated price while old orders keep the snapshot', async () => {
    // Order 1 at Beer = 300
    const { body: order1 } = await createOrderAndWaiter([{ productId: beerId, quantity: 1 }])
    expect(order1.totalCents).toBe(300)

    // Change price to 500
    await prisma.product.update({ where: { id: beerId }, data: { priceCents: 500 } })

    // Order 2 uses new price
    const { body: order2 } = await createOrderAndWaiter([{ productId: beerId, quantity: 1 }])
    expect(order2.totalCents).toBe(500)

    // Order 1 still has old total
    const getRes = await server.inject({ method: 'GET', url: `/api/orders/${order1.id}` })
    expect((getRes.json() as Record<string, unknown>).totalCents).toBe(300)
  })

  // --- Tests: Product deletion guard ---

  it('returns 409 when deleting a product referenced by order items', async () => {
    await createOrderAndWaiter([{ productId: beerId, quantity: 1 }])

    const res = await server.inject({
      method: 'DELETE',
      url: `/api/products/${beerId}`,
    })

    expect(res.statusCode).toBe(409)
    const body = res.json() as Record<string, unknown>
    expect(body.error).toBeDefined()

    // Product still exists
    const stillExists = await prisma.product.findUnique({ where: { id: beerId } })
    expect(stillExists).not.toBeNull()
  })

  it('returns 204 when deleting a product that has no orders', async () => {
    // colaId has no orders
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/products/${colaId}`,
    })

    expect(res.statusCode).toBe(204)
    const gone = await prisma.product.findUnique({ where: { id: colaId } })
    expect(gone).toBeNull()
  })

  it('returns 404 when deleting a non-existent product', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: '/api/products/nonexistent-id',
    })
    expect(res.statusCode).toBe(404)
  })

  // --- Tests: Order via pickupCode (no tableNumber) ---

  it('creates an order with pickupCode instead of tableNumber', async () => {
    const { status, body } = await createOrderAndWaiter(
      [{ productId: beerId, quantity: 1 }],
      { pickupCode: 'ABC' },
    )

    expect(status).toBe(201)
    expect(body.pickupCode).toBe('ABC')
    expect(body.tableNumber).toBeNull()
    expect(body.totalCents).toBe(300)
  })

  it('rejects order with both tableNumber and pickupCode', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '1',
        pickupCode: 'ABC',
        waiterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('rejects order with neither tableNumber nor pickupCode', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        waiterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      },
    })

    expect(res.statusCode).toBe(400)
  })

  // --- Tests: Tear-off numbering ---

  it('assigns sequential tear-off numbers per event', async () => {
    const { body: order1 } = await createOrderAndWaiter([{ productId: beerId, quantity: 1 }])
    const { body: order2 } = await createOrderAndWaiter([{ productId: beerId, quantity: 1 }])
    const { body: order3 } = await createOrderAndWaiter([{ productId: beerId, quantity: 1 }])

    expect(order1.tearOffNumber).toBe(1)
    expect(order2.tearOffNumber).toBe(2)
    expect(order3.tearOffNumber).toBe(3)
  })
})
