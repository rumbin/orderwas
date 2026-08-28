import { prisma } from '@/db/client'
import { orderEvents } from '@/websocket'
import { logAudit } from '@/services/auditService'
import { OrderValidationError } from '@/services/orderService'

// --- Helpers ---

function parseItemOptions(options: string | null): { priceDeltaCents: number }[] {
  if (!options) return []
  try {
    return JSON.parse(options) as { priceDeltaCents: number }[]
  } catch {
    return []
  }
}

function computeLineTotalCents(
  priceCents: number,
  quantity: number,
  options: string | null,
): number {
  const deltas = parseItemOptions(options).reduce((s, o) => s + o.priceDeltaCents, 0)
  return (priceCents + deltas) * quantity
}

// --- payItems: batch-pay a set of order items ---

export interface PayItemsResult {
  paidCount: number
  sumCents: number
  updatedOrders: { id: string; status: string }[]
}

export async function payItems(
  itemIds: string[],
  actorWaiterId: string,
): Promise<PayItemsResult> {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    throw new OrderValidationError('No items selected', 400)
  }

  // De-duplicate
  const uniqueIds = [...new Set(itemIds)]

  // Load items with order + product price
  const items = await prisma.orderItem.findMany({
    where: { id: { in: uniqueIds } },
    include: {
      order: { select: { id: true, eventId: true, tableNumber: true } },
      product: { select: { priceCents: true } },
    },
  })

  if (items.length !== uniqueIds.length) {
    const foundIds = new Set(items.map((i) => i.id))
    const missing = uniqueIds.filter((id) => !foundIds.has(id))
    throw new OrderValidationError(`Items not found: ${missing.join(', ')}`, 404)
  }

  // Validate
  for (const item of items) {
    if (item.status === 'cancelled') {
      throw new OrderValidationError(`Item ${item.id} is cancelled`, 409)
    }
    if (item.paidAt) {
      throw new OrderValidationError(`Item ${item.id} is already paid`, 409)
    }
  }

  // Verify actor waiter exists
  const waiter = await prisma.waiter.findUnique({
    where: { id: actorWaiterId },
    select: { id: true, name: true, eventId: true },
  })
  if (!waiter) {
    throw new OrderValidationError('Waiter not found', 404)
  }

  // Compute total from server-side data (never trust client)
  const sumCents = items.reduce((sum, item) => {
    return sum + computeLineTotalCents(item.product.priceCents, item.quantity, item.options)
  }, 0)

  const eventId = waiter.eventId
  const tableNumber = items[0]?.order.tableNumber ?? null
  const affectedOrderIds = [...new Set(items.map((i) => i.orderId))]

  const now = new Date()

  const result = await prisma.$transaction(async (tx) => {
    // Mark items as paid
    await tx.orderItem.updateMany({
      where: { id: { in: uniqueIds } },
      data: { paidAt: now, paidByWaiterId: actorWaiterId },
    })

    // Check affected orders
    const updatedOrders: { id: string; status: string }[] = []

    for (const orderId of affectedOrderIds) {
      const remaining = await tx.orderItem.count({
        where: {
          orderId,
          paidAt: null,
          status: { not: 'cancelled' },
        },
      })

      let newStatus: string | undefined
      if (remaining === 0) {
        newStatus = 'paid'
      }

      const order = await tx.order.update({
        where: { id: orderId },
        data: newStatus ? { status: newStatus } : {},
        select: { id: true, status: true, eventId: true },
      })

      updatedOrders.push({ id: order.id, status: order.status })

      // Emit WebSocket event
      orderEvents.emit('order:updated', {
        order: {
          id: order.id,
          eventId: order.eventId,
          tableNumber,
          status: order.status,
        },
      })
    }

    return updatedOrders
  })

  // Audit log
  logAudit({
    eventId,
    actorId: actorWaiterId,
    actorName: waiter.name,
    action: 'payment.collected',
    entityType: 'OrderItem',
    entityId: uniqueIds[0],
    afterData: {
      itemIds: uniqueIds,
      sumCents,
      tableNumber,
      actorName: waiter.name,
    },
  })

  return {
    paidCount: uniqueIds.length,
    sumCents,
    updatedOrders: result,
  }
}

// --- listOpenTables: tables with unpaid items + open sum ---

export interface OpenTable {
  tableNumber: string
  openSumCents: number
  orderCount: number
}

export async function listOpenTables(eventId: string): Promise<OpenTable[]> {
  // Find orders that have at least one unpaid, non-cancelled item
  const orders = await prisma.order.findMany({
    where: {
      eventId,
      status: { not: 'cancelled' },
      tableNumber: { not: null },
      items: {
        some: {
          paidAt: null,
          status: { not: 'cancelled' },
        },
      },
    },
    include: {
      items: {
        where: { paidAt: null, status: { not: 'cancelled' } },
        include: { product: { select: { priceCents: true } } },
      },
    },
  })

  // Group by table
  const tableMap = new Map<string, { openSumCents: number; orderCount: number }>()

  for (const order of orders) {
    const table = order.tableNumber!
    const entry = tableMap.get(table) ?? { openSumCents: 0, orderCount: 0 }

    for (const item of order.items) {
      entry.openSumCents += computeLineTotalCents(
        item.product.priceCents,
        item.quantity,
        item.options,
      )
    }
    entry.orderCount += 1
    tableMap.set(table, entry)
  }

  return Array.from(tableMap.entries())
    .map(([tableNumber, data]) => ({ tableNumber, ...data }))
    .sort((a, b) => a.tableNumber.localeCompare(b.tableNumber))
}

// --- listUnpaidByTable: orders of a table with mixed paid/unpaid items ---

export interface TableOrderItem {
  id: string
  productName: string
  quantity: number
  status: string
  comment: string | null
  options: string | null
  lineTotalCents: number
  paidAt: Date | null
}

export interface TableOrder {
  orderId: string
  tearOffNumber: number | null
  waiterName: string
  createdAt: Date
  items: TableOrderItem[]
}

export async function listUnpaidByTable(
  eventId: string,
  tableNumber: string,
): Promise<TableOrder[]> {
  // Find orders at this table that have ≥1 unpaid, non-cancelled item
  const orders = await prisma.order.findMany({
    where: {
      eventId,
      tableNumber,
      status: { not: 'cancelled' },
      items: {
        some: {
          paidAt: null,
          status: { not: 'cancelled' },
        },
      },
    },
    include: {
      items: {
        where: { status: { not: 'cancelled' } },
        include: { product: { select: { priceCents: true, name: true } } },
      },
      waiter: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return orders.map((order) => ({
    orderId: order.id,
    tearOffNumber: order.tearOffNumber,
    waiterName: order.waiter.name,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.product.name,
      quantity: item.quantity,
      status: item.status,
      comment: item.comment,
      options: item.options,
      lineTotalCents: computeLineTotalCents(
        item.product.priceCents,
        item.quantity,
        item.options,
      ),
      paidAt: item.paidAt,
    })),
  }))
}
