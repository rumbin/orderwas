import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'
import { createOrder, OrderValidationError } from '@/services/orderService'

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
})
