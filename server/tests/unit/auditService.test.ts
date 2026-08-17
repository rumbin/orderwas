import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { prisma } from '@/db/client'
import {
  logAudit,
  listAuditLogs,
  settleStock,
  getStockHistory,
  getPeakTimes,
  getStationRevenue,
  getWaiterSummary,
  getProductConsumption,
} from '@/services/auditService'

describe('Audit service', () => {
  let eventId: string
  let stationId: string
  let waiterId: string
  let productId: string

  afterAll(async () => {
    await prisma.auditLog.deleteMany({})
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

    const ev = await prisma.event.create({ data: { name: 'Audit Test' } })
    eventId = ev.id
    const station = await prisma.station.create({ data: { name: 'Bar', eventId } })
    stationId = station.id
    const product = await prisma.product.create({
      data: { name: 'Bier', priceCents: 300, stationId, stockMode: 'tracked', stockCount: 50 },
    })
    productId = product.id
    const waiter = await prisma.waiter.create({ data: { name: 'Alice', pin: '1234', eventId } })
    waiterId = waiter.id
  })

  // --- logAudit ---

  it('writes an audit log entry', async () => {
    await logAudit({
      eventId,
      actorId: waiterId,
      actorName: 'Alice',
      action: 'order.created',
      entityType: 'Order',
      entityId: 'order-123',
      afterData: { tableNumber: '5', totalCents: 600 },
    })

    const logs = await listAuditLogs(eventId)
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('order.created')
    expect(logs[0].actorName).toBe('Alice')
    expect(logs[0].entityId).toBe('order-123')
    expect(JSON.parse(logs[0].afterData!)).toEqual({ tableNumber: '5', totalCents: 600 })
  })

  it('logs with null actor for system actions', async () => {
    await logAudit({
      eventId,
      action: 'stock.decremented',
      entityType: 'Product',
      entityId: productId,
      quantity: -3,
    })

    const logs = await listAuditLogs(eventId)
    expect(logs[0].actorId).toBeNull()
    expect(logs[0].quantity).toBe(-3)
  })

  // --- listAuditLogs filtering ---

  it('filters by action', async () => {
    await logAudit({ eventId, action: 'order.created', entityType: 'Order' })
    await logAudit({ eventId, action: 'order.cancelled', entityType: 'Order' })
    await logAudit({ eventId, action: 'stock.adjusted', entityType: 'Product' })

    const orderLogs = await listAuditLogs(eventId, { action: 'order.created' })
    expect(orderLogs).toHaveLength(1)
  })

  it('filters by entityType', async () => {
    await logAudit({ eventId, action: 'order.created', entityType: 'Order' })
    await logAudit({ eventId, action: 'stock.adjusted', entityType: 'Product' })

    const productLogs = await listAuditLogs(eventId, { entityType: 'Product' })
    expect(productLogs).toHaveLength(1)
  })

  // --- settleStock ---

  it('settleStock updates stock and logs the settlement', async () => {
    const updated = await settleStock(eventId, productId, 42, waiterId, 'Alice')
    expect(updated.stockCount).toBe(42)

    const logs = await listAuditLogs(eventId, { action: 'stock.settled' })
    expect(logs).toHaveLength(1)
    expect(logs[0].quantity).toBe(-8) // 42 - 50 = -8
    expect(JSON.parse(logs[0].beforeData!).stockCount).toBe(50)
    expect(JSON.parse(logs[0].afterData!).stockCount).toBe(42)
  })

  it('settleStock can increase stock', async () => {
    await settleStock(eventId, productId, 60)
    const logs = await listAuditLogs(eventId, { action: 'stock.settled' })
    expect(logs[0].quantity).toBe(10) // 60 - 50 = +10
  })

  it('settleStock throws for non-existent product', async () => {
    await expect(settleStock(eventId, 'nonexistent', 10)).rejects.toThrow('Product not found')
  })

  // --- getStockHistory ---

  it('getStockHistory returns settlement history for a product', async () => {
    await settleStock(eventId, productId, 40, waiterId, 'Alice')
    await settleStock(eventId, productId, 35)

    const history = await getStockHistory(eventId, productId)
    expect(history).toHaveLength(2)
    expect(history[0].quantity).toBe(-5) // 35 - 40
    expect(history[1].quantity).toBe(-10) // 40 - 50
  })

  // --- getPeakTimes ---

  it('getPeakTimes groups orders by hour', async () => {
    // Create orders at different times
    const baseTime = new Date('2026-08-17T10:00:00Z')
    for (let i = 0; i < 3; i++) {
      const orderTime = new Date(baseTime.getTime() + i * 3600000) // 10:00, 11:00, 12:00
      await prisma.order.create({
        data: {
          tableNumber: `${i}`,
          waiterId,
          eventId,
          totalCents: 300,
          createdAt: orderTime,
          items: { create: [{ productId, quantity: 1 }] },
        },
      })
    }

    const peakTimes = await getPeakTimes(eventId)
    expect(peakTimes).toHaveLength(24)
    // Orders at 10, 11, 12 UTC — but depends on timezone
    const totalOrders = peakTimes.reduce((sum, h) => sum + h.count, 0)
    expect(totalOrders).toBe(3)
  })

  // --- getStationRevenue ---

  it('getStationRevenue calculates per-station totals', async () => {
    await prisma.order.create({
      data: {
        tableNumber: '1',
        waiterId,
        eventId,
        totalCents: 600,
        items: { create: [{ productId, quantity: 2 }] },
      },
    })

    const revenue = await getStationRevenue(eventId)
    expect(revenue).toHaveLength(1)
    expect(revenue[0].stationName).toBe('Bar')
    expect(revenue[0].totalItems).toBe(2)
    expect(revenue[0].revenueCents).toBe(600) // 2 × 300
  })

  // --- getWaiterSummary ---

  it('getWaiterSummary returns per-waiter stats', async () => {
    await prisma.order.create({
      data: {
        tableNumber: '1',
        waiterId,
        eventId,
        totalCents: 300,
        items: { create: [{ productId, quantity: 1 }] },
      },
    })

    const summary = await getWaiterSummary(eventId)
    expect(summary).toHaveLength(1)
    expect(summary[0].waiterName).toBe('Alice')
    expect(summary[0].totalOrders).toBe(1)
    expect(summary[0].totalRevenueCents).toBe(300)
  })

  // --- getProductConsumption ---

  it('getProductConsumption returns sorted product stats', async () => {
    await prisma.order.create({
      data: {
        tableNumber: '1',
        waiterId,
        eventId,
        totalCents: 900,
        items: { create: [{ productId, quantity: 3 }] },
      },
    })

    const consumption = await getProductConsumption(eventId)
    expect(consumption).toHaveLength(1)
    expect(consumption[0].productName).toBe('Bier')
    expect(consumption[0].totalQuantity).toBe(3)
    expect(consumption[0].revenueCents).toBe(900)
  })
})
