import { prisma } from '@/db/client'

export interface AuditLogEntry {
  eventId: string
  actorId?: string
  actorName?: string
  action: string
  entityType: string
  entityId?: string
  beforeData?: Record<string, unknown> | null
  afterData?: Record<string, unknown> | null
  quantity?: number
}

/**
 * Writes an audit log entry. Fire-and-forget pattern — failures are logged but never block the caller.
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        eventId: entry.eventId,
        actorId: entry.actorId ?? null,
        actorName: entry.actorName ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        beforeData: entry.beforeData ? JSON.stringify(entry.beforeData) : null,
        afterData: entry.afterData ? JSON.stringify(entry.afterData) : null,
        quantity: entry.quantity ?? null,
      },
    })
  } catch (err) {
    console.error('[audit] failed to write log:', err)
  }
}

/**
 * Lists audit logs for an event, optionally filtered by action or entity type.
 */
export async function listAuditLogs(
  eventId: string,
  opts?: { action?: string; entityType?: string; limit?: number; offset?: number },
) {
  const where: Record<string, unknown> = { eventId }
  if (opts?.action) where.action = opts.action
  if (opts?.entityType) where.entityType = opts.entityType

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: opts?.limit ?? 100,
    skip: opts?.offset ?? 0,
  })
}

/**
 * Returns stock settlement history for a specific product.
 */
export async function getStockHistory(eventId: string, productId: string) {
  return prisma.auditLog.findMany({
    where: {
      eventId,
      entityType: 'Product',
      entityId: productId,
      action: { in: ['stock.adjusted', 'stock.settled', 'stock.decremented', 'stock.restored'] },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Performs a stock settlement: records the physical count, calculates delta, logs it.
 * Returns the updated product.
 */
export async function settleStock(
  eventId: string,
  productId: string,
  physicalCount: number,
  actorId?: string,
  actorName?: string,
) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw new Error('Product not found')

  const beforeStock = product.stockCount
  const delta = physicalCount - beforeStock

  // Update stock and log atomically
  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.product.update({
      where: { id: productId },
      data: { stockCount: physicalCount },
    })

    await tx.auditLog.create({
      data: {
        eventId,
        actorId: actorId ?? null,
        actorName: actorName ?? null,
        action: 'stock.settled',
        entityType: 'Product',
        entityId: productId,
        beforeData: JSON.stringify({ stockCount: beforeStock, stockMode: product.stockMode }),
        afterData: JSON.stringify({ stockCount: physicalCount, stockMode: product.stockMode }),
        quantity: delta,
      },
    })

    return p
  })

  return updated
}

/**
 * Returns peak-time data: order counts grouped by hour of day for an event.
 */
export async function getPeakTimes(eventId: string) {
  const orders = await prisma.order.findMany({
    where: { eventId },
    select: { createdAt: true },
  })

  // Group by hour
  const byHour = new Map<number, number>()
  for (let h = 0; h < 24; h++) byHour.set(h, 0)

  for (const order of orders) {
    const hour = new Date(order.createdAt).getHours()
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1)
  }

  return Array.from(byHour.entries()).map(([hour, count]) => ({ hour, count }))
}

/**
 * Returns per-station revenue summary for an event.
 */
export async function getStationRevenue(eventId: string) {
  const stations = await prisma.station.findMany({
    where: { eventId },
    include: {
      products: {
        include: {
          orderItems: {
            where: { order: { eventId, status: { not: 'cancelled' } } },
            select: { quantity: true, order: { select: { totalCents: true } } },
          },
        },
      },
    },
  })

  return stations.map((station) => {
    let totalItems = 0
    let stationRevenue = 0

    for (const product of station.products) {
      for (const item of product.orderItems) {
        totalItems += item.quantity
        // Approximate station revenue: distribute order total proportionally
        // (simplified — in reality we'd split by item price)
        stationRevenue += product.priceCents * item.quantity
      }
    }

    return {
      stationId: station.id,
      stationName: station.name,
      totalItems,
      revenueCents: stationRevenue,
    }
  })
}

/**
 * Returns per-waiter summary for an event.
 */
export async function getWaiterSummary(eventId: string) {
  const waiters = await prisma.waiter.findMany({
    where: { eventId },
    include: {
      orders: {
        where: { eventId },
        select: {
          totalCents: true,
          status: true,
          items: { select: { quantity: true } },
        },
      },
    },
  })

  return waiters.map((waiter) => {
    const openOrders = waiter.orders.filter((o) => ['open', 'preparing', 'partial'].includes(o.status))
    const paidOrders = waiter.orders.filter((o) => o.status === 'paid')
    const cancelledOrders = waiter.orders.filter((o) => o.status === 'cancelled')

    const totalRevenue = waiter.orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.totalCents, 0)

    const totalItems = waiter.orders.reduce(
      (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0),
      0,
    )

    return {
      waiterId: waiter.id,
      waiterName: waiter.name,
      totalOrders: waiter.orders.length,
      openOrders: openOrders.length,
      paidOrders: paidOrders.length,
      cancelledOrders: cancelledOrders.length,
      totalRevenueCents: totalRevenue,
      totalItems,
    }
  })
}

/**
 * Returns product consumption summary for an event.
 */
export async function getProductConsumption(eventId: string) {
  const products = await prisma.product.findMany({
    where: { station: { eventId } },
    include: {
      orderItems: {
        where: { order: { eventId, status: { not: 'cancelled' } } },
        select: { quantity: true },
      },
    },
  })

  return products
    .map((product) => ({
      productId: product.id,
      productName: product.name,
      stationId: product.stationId,
      totalQuantity: product.orderItems.reduce((sum, i) => sum + i.quantity, 0),
      revenueCents: product.priceCents * product.orderItems.reduce((sum, i) => sum + i.quantity, 0),
      stockMode: product.stockMode,
      initialStock: product.stockMode === 'tracked' ? product.stockCount : null, // current, not initial
    }))
    .filter((p) => p.totalQuantity > 0)
    .sort((a, b) => b.totalQuantity - a.totalQuantity)
}
