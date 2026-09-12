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
  actorEventId?: string,
): Promise<PayItemsResult> {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    throw new OrderValidationError('No items selected', 400)
  }

  // De-duplicate
  const uniqueIds = [...new Set(itemIds)]

  // Verify actor waiter exists (and belongs to actorEventId if provided)
  const waiter = await prisma.waiter.findUnique({
    where: { id: actorWaiterId },
    select: { id: true, name: true, eventId: true },
  })
  if (!waiter) {
    throw new OrderValidationError('Waiter not found', 404)
  }
  const eventId = actorEventId ?? waiter.eventId

  // Validate + compute + persist atomically. All of it inside the transaction
  // so two concurrent payItems calls for the same item cannot both pass the
  // "still unpaid" check (double payment). The conditional updateMany only
  // matches rows that are still paidAt: null.
  const now = new Date()
  const result = await prisma.$transaction(async (tx) => {
    // Load items with order (for event ownership) + product (for price math).
    const items = await tx.orderItem.findMany({
      where: { id: { in: uniqueIds } },
      include: {
        order: { select: { id: true, eventId: true, tableNumber: true, status: true } },
        product: { select: { priceCents: true } },
      },
    })

    if (items.length !== uniqueIds.length) {
      const foundIds = new Set(items.map((i) => i.id))
      const missing = uniqueIds.filter((id) => !foundIds.has(id))
      throw new OrderValidationError(`Items not found: ${missing.join(', ')}`, 404)
    }

    // Event ownership: a waiter may only pay items belonging to their own event.
    for (const item of items) {
      if (item.order.eventId !== eventId) {
        throw new OrderValidationError('Item belongs to another event', 403)
      }
      if (item.status === 'cancelled') {
        throw new OrderValidationError(`Item ${item.id} is cancelled`, 409)
      }
      if (item.paidAt) {
        throw new OrderValidationError(`Item ${item.id} is already paid`, 409)
      }
    }

    // Compute total from server-side data (never trust client)
    const sumCents = items.reduce(
      (sum, item) => sum + computeLineTotalCents(item.product.priceCents, item.quantity, item.options),
      0,
    )

    // Race-safe: only rows that are still unpaid match. If another request paid
    // one of them first, count < uniqueIds.length and we reject (409).
    const updated = await tx.orderItem.updateMany({
      where: { id: { in: uniqueIds }, paidAt: null },
      data: { paidAt: now, paidByWaiterId: actorWaiterId },
    })
    if (updated.count !== uniqueIds.length) {
      throw new OrderValidationError('One or more items were already paid (concurrent payment)', 409)
    }

    // Recompute order statuses for the affected orders.
    const affectedOrderIds = [...new Set(items.map((i) => i.order.id))]
    const updatedOrders: { id: string; status: string }[] = []

    for (const orderId of affectedOrderIds) {
      const remaining = await tx.orderItem.count({
        where: { orderId, paidAt: null, status: { not: 'cancelled' } },
      })

      let newStatus: string | undefined
      if (remaining === 0) newStatus = 'paid'

      const order = await tx.order.update({
        where: { id: orderId },
        data: newStatus ? { status: newStatus } : {},
        select: { id: true, status: true, eventId: true, tableNumber: true },
      })

      updatedOrders.push({ id: order.id, status: order.status })

      // Emit AFTER commit (post-commit broadcast) — done below.
      void order
    }

    return { sumCents, updatedOrders }
  })

  // Rebuild a tableNumber for the audit/events (from the first order of the set).
  // We emit post-commit so clients never observe a payment that then rolls back.
  const firstOrder = await prisma.order.findUnique({
    where: { id: result.updatedOrders[0]?.id ?? '' },
    select: { id: true, eventId: true, tableNumber: true, status: true },
  })
  if (firstOrder) {
    orderEvents.emit('order:updated', {
      order: {
        id: firstOrder.id,
        eventId: firstOrder.eventId,
        tableNumber: firstOrder.tableNumber,
        pickupCode: null,
        tearOffNumber: null,
        status: firstOrder.status,
        totalCents: 0,
        items: [],
      },
    })
  }

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
      sumCents: result.sumCents,
      tableNumber: firstOrder?.tableNumber ?? null,
      actorName: waiter.name,
    },
  }).catch((err) => console.error('[audit] log error:', err))

  return {
    paidCount: uniqueIds.length,
    sumCents: result.sumCents,
    updatedOrders: result.updatedOrders,
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
  waiterIsCounter: boolean
  createdAt: Date
  items: TableOrderItem[]
}

/** Shape shared by the unpaid-order queries below (structural subset). */
interface UnpaidOrderRow {
  id: string
  tearOffNumber: number | null
  createdAt: Date
  waiter: { name: string; isCounter: boolean }
  items: Array<{
    id: string
    quantity: number
    status: string
    comment: string | null
    options: string | null
    paidAt: Date | null
    product: { priceCents: number; name: string }
  }>
}

/** Maps raw orders to the cashier view model. */
function mapToTableOrders(orders: UnpaidOrderRow[]): TableOrder[] {
  return orders.map((order) => ({
    orderId: order.id,
    tearOffNumber: order.tearOffNumber,
    waiterName: order.waiter.name,
    waiterIsCounter: order.waiter.isCounter,
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
      waiter: { select: { name: true, isCounter: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return mapToTableOrders(orders)
}

/**
 * The counter (Theke) cashes out one Bon at a time, so the cashier screen
 * always works on the most recent unpaid counter order — no table or Bon
 * selection. Returns an empty array when nothing is open.
 */
export async function listUnpaidForCounter(eventId: string): Promise<TableOrder[]> {
  const counterWaiters = await prisma.waiter.findMany({
    where: { eventId, isCounter: true },
    select: { id: true },
  })
  if (counterWaiters.length === 0) return []

  const orders = await prisma.order.findMany({
    where: {
      eventId,
      waiterId: { in: counterWaiters.map((w) => w.id) },
      status: { notIn: ['paid', 'cancelled'] },
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
      waiter: { select: { name: true, isCounter: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  })

  return mapToTableOrders(orders)
}
