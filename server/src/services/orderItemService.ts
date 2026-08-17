import { prisma } from '@/db/client'
import { orderEvents } from '@/websocket'

export class OrderItemValidationError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 400) {
    super(message)
    this.statusCode = statusCode
  }
}

const VALID_ITEM_STATUSES = ['open', 'prepared', 'delivered', 'cancelled'] as const
type ItemStatus = (typeof VALID_ITEM_STATUSES)[number]

/**
 * Updates an order item's comment and/or status.
 * Emits `orderItem:status` when the status changes.
 */
export async function updateItem(
  itemId: string,
  data: { comment?: string; status?: string },
) {
  if (data.status !== undefined && !VALID_ITEM_STATUSES.includes(data.status as ItemStatus)) {
    throw new OrderItemValidationError('Invalid item status')
  }

  const existing = await prisma.orderItem.findUnique({
    where: { id: itemId },
    include: { order: { select: { id: true, eventId: true } }, product: { select: { stationId: true } } },
  })
  if (!existing) throw new OrderItemValidationError('Order item not found', 404)

  const updated = await prisma.orderItem.update({
    where: { id: itemId },
    data: {
      ...(data.comment !== undefined ? { comment: data.comment } : {}),
      ...(data.status !== undefined ? { status: data.status as ItemStatus } : {}),
    },
    include: { product: { select: { id: true, name: true, stationId: true } } },
  })

  // Emit WS event when status changed
  if (data.status !== undefined && data.status !== existing.status) {
    orderEvents.emit('orderItem:status', {
      orderId: existing.order.id,
      eventId: existing.order.eventId,
      itemId: updated.id,
      status: updated.status,
      stationId: updated.product.stationId,
    })
  }

  return updated
}

/**
 * Cancels a single order item. Order total is NOT recomputed — the printed
 * receipt is the audit trail; cancelled items are marked, not erased.
 * Emits `orderItem:status`.
 */
export async function cancelItem(itemId: string) {
  return updateItem(itemId, { status: 'cancelled' })
}
