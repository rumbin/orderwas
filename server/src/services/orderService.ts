import { prisma } from '@/db/client'
import type { Prisma } from '@prisma/client'
import { orderEvents, type OrderEventPayload } from '@/websocket'
import { dispatchOrderPrints } from '@/printer/dispatch'

export interface CreateOrderInput {
  tableNumber?: string
  pickupCode?: string
  waiterId: string
  eventId: string
  items: Array<{
    productId: string
    quantity: number
    comment?: string
  }>
}

export class OrderValidationError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 400) {
    super(message)
    this.statusCode = statusCode
  }
}

/**
 * Creates an order: validates entities, calculates total in integer cents,
 * atomically assigns a per-event tear-off number, persists order + items,
 * returns the created order with items.
 */
export async function createOrder(input: CreateOrderInput) {
  const { tableNumber, pickupCode, waiterId, eventId, items } = input

  // Validate XOR: exactly one of tableNumber or pickupCode must be present
  if (Boolean(tableNumber) === Boolean(pickupCode)) {
    throw new OrderValidationError('Exactly one of tableNumber or pickupCode must be provided')
  }

  // Validate waiter exists
  const waiter = await prisma.waiter.findUnique({ where: { id: waiterId }, select: { id: true } })
  if (!waiter) throw new OrderValidationError('Waiter does not exist')

  // Validate event exists
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!event) throw new OrderValidationError('Event does not exist')

  // Fetch product prices and validate all product IDs
  const productIds = items.map((i) => i.productId)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, priceCents: true, stationId: true, name: true },
  })
  if (products.length !== new Set(productIds).size) {
    throw new OrderValidationError('One or more products do not exist')
  }

  const priceMap = new Map(products.map((p) => [p.id, p.priceCents] as const))
  const totalCents = items.reduce(
    (sum, item) => sum + (priceMap.get(item.productId) ?? 0) * item.quantity,
    0,
  )

  // Atomically increment the event's tear-off counter and create the order
  const order = await prisma.$transaction(async (tx) => {
    const updatedEvent = await tx.event.update({
      where: { id: eventId },
      data: { lastTearOffNumber: { increment: 1 } },
      select: { lastTearOffNumber: true },
    })

    return tx.order.create({
      data: {
        tableNumber: tableNumber ?? null,
        pickupCode: pickupCode ?? null,
        waiterId,
        eventId,
        totalCents,
        tearOffNumber: updatedEvent.lastTearOffNumber,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            comment: item.comment,
          })),
        },
      },
      include: {
        items: { include: { product: { select: { id: true, name: true, priceCents: true, stationId: true } } } },
      },
    })
  })

  // Emit WebSocket event (post-commit, failure-isolated)
  const payload: OrderEventPayload = {
    order: {
      id: order.id,
      eventId: order.eventId,
      tableNumber: order.tableNumber,
      pickupCode: order.pickupCode,
      tearOffNumber: order.tearOffNumber,
      status: order.status,
      totalCents: order.totalCents,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        stationId: item.product.stationId,
        quantity: item.quantity,
        status: item.status,
        comment: item.comment,
      })),
    },
  }
  orderEvents.emit('order:created', payload)

  // Fire-and-forget: dispatch print jobs (never fails the order)
  dispatchOrderPrints({
    id: order.id,
    eventId: order.eventId,
    tableNumber: order.tableNumber,
    pickupCode: order.pickupCode,
    tearOffNumber: order.tearOffNumber,
    status: order.status,
    totalCents: order.totalCents,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      stationId: item.product.stationId,
      quantity: item.quantity,
      status: item.status,
      comment: item.comment,
      priceCents: item.product.priceCents,
    })),
  }).catch((err) => console.error('[printer] dispatch error:', err))

  return order
}

/**
 * Lists orders for an event, including items with product info.
 */
export async function listOrdersByEvent(eventId: string) {
  return prisma.order.findMany({
    where: { eventId },
    include: {
      items: { include: { product: { select: { id: true, name: true, priceCents: true, stationId: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Gets a single order with items.
 */
export async function getOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { id: true, name: true, priceCents: true, stationId: true } } } },
    },
  })
}

const VALID_STATUSES = ['open', 'preparing', 'partial', 'paid', 'cancelled'] as const
type OrderStatus = (typeof VALID_STATUSES)[number]

/**
 * Updates order status. Throws OrderValidationError for invalid status or missing order.
 */
export async function updateOrderStatus(id: string, status: string) {
  if (!VALID_STATUSES.includes(status as OrderStatus)) {
    throw new OrderValidationError('Invalid status', 400)
  }

  try {
    const order = await prisma.order.update({
      where: { id },
      data: { status: status as OrderStatus },
    })
    // Emit WebSocket event
    orderEvents.emit('order:updated', {
      order: {
        id: order.id,
        eventId: order.eventId,
        tableNumber: order.tableNumber,
        pickupCode: order.pickupCode,
        tearOffNumber: order.tearOffNumber,
        status: order.status,
        totalCents: order.totalCents,
        items: [],
      },
    })
    return order
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'P2025') throw new OrderValidationError('Order not found', 404)
    throw err
  }
}

// Type helper for transaction context
export type TxClient = Prisma.TransactionClient

/**
 * Cancels a full order: status → cancelled and all items cancelled.
 * Only open/preparing/partial orders can be cancelled.
 */
export async function cancelOrder(id: string) {
  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true, status: true, eventId: true },
  })
  if (!existing) throw new OrderValidationError('Order not found', 404)
  if (!['open', 'preparing', 'partial'].includes(existing.status)) {
    throw new OrderValidationError(`Cannot cancel order in status '${existing.status}'`, 409)
  }

  const order = await prisma.$transaction(async (tx) => {
    await tx.orderItem.updateMany({
      where: { orderId: id, status: { not: 'cancelled' } },
      data: { status: 'cancelled' },
    })
    return tx.order.update({ where: { id }, data: { status: 'cancelled' } })
  })

  orderEvents.emit('order:updated', {
    order: {
      id: order.id,
      eventId: order.eventId,
      tableNumber: order.tableNumber,
      pickupCode: order.pickupCode,
      tearOffNumber: order.tearOffNumber,
      status: order.status,
      totalCents: order.totalCents,
      items: [],
    },
  })
  return order
}

/**
 * Marks an order paid (cash-out). Only open/preparing/partial → paid.
 */
export async function markPaid(id: string) {
  const existing = await prisma.order.findUnique({
    where: { id },
    select: { status: true },
  })
  if (!existing) throw new OrderValidationError('Order not found', 404)
  if (!['open', 'preparing', 'partial'].includes(existing.status)) {
    throw new OrderValidationError(`Cannot pay order in status '${existing.status}'`, 409)
  }

  const order = await prisma.order.update({ where: { id }, data: { status: 'paid' } })

  orderEvents.emit('order:updated', {
    order: {
      id: order.id,
      eventId: order.eventId,
      tableNumber: order.tableNumber,
      pickupCode: order.pickupCode,
      tearOffNumber: order.tearOffNumber,
      status: order.status,
      totalCents: order.totalCents,
      items: [],
    },
  })
  return order
}

/**
 * Reopens a paid order (e.g. payment mistake). Only paid → open.
 */
export async function reopenOrder(id: string) {
  const existing = await prisma.order.findUnique({
    where: { id },
    select: { status: true },
  })
  if (!existing) throw new OrderValidationError('Order not found', 404)
  if (existing.status !== 'paid') {
    throw new OrderValidationError(`Cannot reopen order in status '${existing.status}'`, 409)
  }

  const order = await prisma.order.update({ where: { id }, data: { status: 'open' } })

  orderEvents.emit('order:updated', {
    order: {
      id: order.id,
      eventId: order.eventId,
      tableNumber: order.tableNumber,
      pickupCode: order.pickupCode,
      tearOffNumber: order.tearOffNumber,
      status: order.status,
      totalCents: order.totalCents,
      items: [],
    },
  })
  return order
}
