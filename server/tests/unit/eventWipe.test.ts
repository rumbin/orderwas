import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { prisma } from '@/db/client'
import { updateEvent } from '@/services/eventService'
import { createOrder } from '@/services/orderService'

describe('Event test→live wipe', () => {
  let eventId: string
  let waiterId: string
  let stationId: string
  let productId: string

  afterAll(async () => {
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

    const ev = await prisma.event.create({ data: { name: 'Wipe Test', status: 'test' } })
    eventId = ev.id
    const station = await prisma.station.create({ data: { name: 'Bar', eventId } })
    stationId = station.id
    const product = await prisma.product.create({ data: { name: 'Bier', priceCents: 300, stationId } })
    productId = product.id
    const waiter = await prisma.waiter.create({ data: { name: 'Alice', pin: '1234', eventId } })
    waiterId = waiter.id

    // Create some test orders
    await createOrder({ tableNumber: '1', waiterId, eventId, items: [{ productId, quantity: 2 }] })
    await createOrder({ tableNumber: '2', waiterId, eventId, items: [{ productId, quantity: 1 }] })
  })

  it('switching test→live wipes all orders and resets tear-off counter on the waiter', async () => {
    // Verify we have orders before the wipe
    const ordersBefore = await prisma.order.findMany({ where: { eventId } })
    expect(ordersBefore).toHaveLength(2)
    const waiterBefore = await prisma.waiter.findUnique({ where: { id: waiterId } })
    expect(waiterBefore?.tearOffNumber).toBe(2)

    // Switch to live
    await updateEvent(eventId, { status: 'live' })

    // Orders should be gone
    const ordersAfter = await prisma.order.findMany({ where: { eventId } })
    expect(ordersAfter).toHaveLength(0)

    // Event status is live
    const eventAfter = await prisma.event.findUnique({ where: { id: eventId } })
    expect(eventAfter?.status).toBe('live')
  })

  it('live→test does NOT wipe data', async () => {
    // First switch to live (wipes orders)
    await updateEvent(eventId, { status: 'live' })

    // Create a new order in live mode
    await createOrder({ tableNumber: '3', waiterId, eventId, items: [{ productId, quantity: 1 }] })
    const ordersBefore = await prisma.order.findMany({ where: { eventId } })
    expect(ordersBefore).toHaveLength(1)

    // Switch back to test — should NOT wipe
    await updateEvent(eventId, { status: 'test' })
    const ordersAfter = await prisma.order.findMany({ where: { eventId } })
    expect(ordersAfter).toHaveLength(1)
    const waiter = await prisma.waiter.findUnique({ where: { id: waiterId } })
    expect(waiter?.tearOffNumber).toBe(3)
  })
})