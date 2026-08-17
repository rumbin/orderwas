import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'
import { createOrder, cancelOrder, OrderValidationError } from '@/services/orderService'

describe('orderService.createOrder', () => {
  let server: AppServer
  let eventId: string
  let stationId: string
  let waiterId: string
  let beerId: string
  let schnitzelId: string

  beforeAll(async () => {
    server = buildServer()
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.productComponent.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.productComponent.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})

    const ev = await prisma.event.create({ data: { name: 'Test Event' } })
    eventId = ev.id
    const station = await prisma.station.create({ data: { name: 'Bar', eventId } })
    stationId = station.id
    const beer = await prisma.product.create({ data: { name: 'Beer', priceCents: 300, stationId } })
    beerId = beer.id
    const schnitzel = await prisma.product.create({ data: { name: 'Schnitzel', priceCents: 800, stationId } })
    schnitzelId = schnitzel.id
    const waiter = await prisma.waiter.create({ data: { name: 'Alice', pin: '1234', eventId } })
    waiterId = waiter.id
  })

  it('creates an order with correct total in cents', async () => {
    const order = await createOrder({
      tableNumber: '5',
      waiterId,
      eventId,
      items: [
        { productId: beerId, quantity: 2 },
        { productId: schnitzelId, quantity: 1 },
      ],
    })
    expect(order.id).toBeDefined()
    expect(order.tableNumber).toBe('5')
    expect(order.totalCents).toBe(1400) // 2×300 + 1×800
    expect(order.items).toHaveLength(2)
  })

  it('calculates total correctly with non-trivial cent prices', async () => {
    const product = await prisma.product.create({
      data: { name: 'Special', priceCents: 350, stationId },
    })
    const order = await createOrder({
      tableNumber: '1',
      waiterId,
      eventId,
      items: [{ productId: product.id, quantity: 3 }],
    })
    expect(order.totalCents).toBe(1050) // 3 × 350 = 1050 exactly
  })

  it('rejects order with non-existent waiter', async () => {
    await expect(
      createOrder({
        tableNumber: '1',
        waiterId: 'nonexistent',
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      }),
    ).rejects.toThrow(OrderValidationError)
  })

  it('rejects order with non-existent event', async () => {
    await expect(
      createOrder({
        tableNumber: '1',
        waiterId,
        eventId: 'nonexistent',
        items: [{ productId: beerId, quantity: 1 }],
      }),
    ).rejects.toThrow(OrderValidationError)
  })

  it('rejects order with non-existent product', async () => {
    await expect(
      createOrder({
        tableNumber: '1',
        waiterId,
        eventId,
        items: [{ productId: 'nonexistent', quantity: 1 }],
      }),
    ).rejects.toThrow('One or more products do not exist')
  })

  it('assigns auto-incrementing tear-off numbers per event', async () => {
    const order1 = await createOrder({
      tableNumber: '1',
      waiterId,
      eventId,
      items: [{ productId: beerId, quantity: 1 }],
    })
    expect(order1.tearOffNumber).toBe(1)

    const order2 = await createOrder({
      tableNumber: '2',
      waiterId,
      eventId,
      items: [{ productId: beerId, quantity: 1 }],
    })
    expect(order2.tearOffNumber).toBe(2)
  })

  it('has independent tear-off sequences per event', async () => {
    const event2 = await prisma.event.create({ data: { name: 'Event 2' } })
    const waiter2 = await prisma.waiter.create({ data: { name: 'Bob', pin: '5678', eventId: event2.id } })

    const order1 = await createOrder({
      tableNumber: '1',
      waiterId,
      eventId,
      items: [{ productId: beerId, quantity: 1 }],
    })
    expect(order1.tearOffNumber).toBe(1)

    const order2 = await createOrder({
      tableNumber: '1',
      waiterId: waiter2.id,
      eventId: event2.id,
      items: [{ productId: beerId, quantity: 1 }],
    })
    expect(order2.tearOffNumber).toBe(1) // independent sequence

    const order3 = await createOrder({
      tableNumber: '2',
      waiterId,
      eventId,
      items: [{ productId: beerId, quantity: 1 }],
    })
    expect(order3.tearOffNumber).toBe(2)
  })

  // Pickup code orders (Task 2.5)
  it('creates an order with pickupCode instead of tableNumber', async () => {
    const order = await createOrder({
      pickupCode: 'A',
      waiterId,
      eventId,
      items: [{ productId: beerId, quantity: 2 }],
    })
    expect(order.tableNumber).toBeNull()
    expect(order.pickupCode).toBe('A')
    expect(order.tearOffNumber).toBe(1)
    expect(order.totalCents).toBe(600)
  })

  it('rejects order with neither tableNumber nor pickupCode', async () => {
    await expect(
      createOrder({
        waiterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      }),
    ).rejects.toThrow()
  })

  it('rejects order with both tableNumber and pickupCode', async () => {
    await expect(
      createOrder({
        tableNumber: '5',
        pickupCode: 'A',
        waiterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      }),
    ).rejects.toThrow()
  })

  it('assigns distinct tear-off numbers to rapid sequential orders', async () => {
    // SQLite serializes write transactions, so we test rapid sequential creation
    // rather than true parallelism. The atomic increment guarantees correctness.
    const numbers: number[] = []
    for (let i = 0; i < 5; i++) {
      const order = await createOrder({
        tableNumber: `${i}`,
        waiterId,
        eventId,
        items: [{ productId: beerId, quantity: 1 }],
      })
      numbers.push(order.tearOffNumber!)
    }
    expect(numbers).toEqual([1, 2, 3, 4, 5])
  })

  // --- Stock management integration ---

  it('tracked product: decrements stock on order creation', async () => {
    // Create a tracked product
    const tracked = await prisma.product.create({
      data: { name: 'Cola', priceCents: 250, stationId, stockMode: 'tracked', stockCount: 20 },
    })

    await createOrder({
      tableNumber: '1',
      waiterId,
      eventId,
      items: [{ productId: tracked.id, quantity: 5 }],
    })

    const after = await prisma.product.findUnique({ where: { id: tracked.id } })
    expect(after!.stockCount).toBe(15)
  })

  it('tracked product: rejects order when stock insufficient', async () => {
    const tracked = await prisma.product.create({
      data: { name: 'Cola', priceCents: 250, stationId, stockMode: 'tracked', stockCount: 3 },
    })

    await expect(
      createOrder({
        tableNumber: '2',
        waiterId,
        eventId,
        items: [{ productId: tracked.id, quantity: 5 }],
      }),
    ).rejects.toThrow(OrderValidationError)
  })

  it('composite product: decrements ingredient stocks', async () => {
    // Create ingredients
    const schnitzel = await prisma.product.create({
      data: { name: 'Schnitzel', priceCents: 0, stationId, stockMode: 'tracked', stockCount: 10 },
    })
    const pommes = await prisma.product.create({
      data: { name: 'Pommes', priceCents: 0, stationId, stockMode: 'tracked', stockCount: 15 },
    })
    // Create composite
    const composite = await prisma.product.create({
      data: { name: 'Schni+Pommes', priceCents: 1200, stationId, stockMode: 'composite' },
    })
    await prisma.productComponent.create({
      data: { compositeId: composite.id, ingredientId: schnitzel.id, quantity: 1 },
    })
    await prisma.productComponent.create({
      data: { compositeId: composite.id, ingredientId: pommes.id, quantity: 1 },
    })

    await createOrder({
      tableNumber: '3',
      waiterId,
      eventId,
      items: [{ productId: composite.id, quantity: 3 }],
    })

    const s = await prisma.product.findUnique({ where: { id: schnitzel.id } })
    const p = await prisma.product.findUnique({ where: { id: pommes.id } })
    expect(s!.stockCount).toBe(7) // 10 - 3
    expect(p!.stockCount).toBe(12) // 15 - 3
  })

  it('noStock product: no stock check performed', async () => {
    const noStock = await prisma.product.create({
      data: { name: 'Wasser', priceCents: 100, stationId, stockMode: 'none' },
    })

    const order = await createOrder({
      tableNumber: '4',
      waiterId,
      eventId,
      items: [{ productId: noStock.id, quantity: 999 }],
    })
    expect(order.id).toBeDefined()
  })

  it('stock is restored when order is cancelled', async () => {
    const tracked = await prisma.product.create({
      data: { name: 'Fanta', priceCents: 250, stationId, stockMode: 'tracked', stockCount: 20 },
    })

    const order = await createOrder({
      tableNumber: '5',
      waiterId,
      eventId,
      items: [{ productId: tracked.id, quantity: 8 }],
    })

    // Stock should be 12 after order
    let product = await prisma.product.findUnique({ where: { id: tracked.id } })
    expect(product!.stockCount).toBe(12)

    // Cancel the order
    await cancelOrder(order.id)

    // Stock should be restored to 20
    product = await prisma.product.findUnique({ where: { id: tracked.id } })
    expect(product!.stockCount).toBe(20)
  })
})
