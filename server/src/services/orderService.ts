import { prisma } from '@/db/client'
import type { Prisma } from '@prisma/client'

export interface CreateOrderInput {
  tableNumber: string
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
  const { tableNumber, waiterId, eventId, items } = input

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
    select: { id: true, priceCents: true },
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
        tableNumber,
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
        items: { include: { product: { select: { id: true, name: true, priceCents: true } } } },
      },
    })
  })

  return order
}

/**
 * Lists orders for an event, including items with product info.
 */
export async function listOrdersByEvent(eventId: string) {
  return prisma.order.findMany({
    where: { eventId },
    include: {
      items: { include: { product: { select: { id: true, name: true, priceCents: true } } } },
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
      items: { include: { product: { select: { id: true, name: true, priceCents: true } } } },
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
    return await prisma.order.update({
      where: { id },
      data: { status: status as OrderStatus },
    })
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'P2025') throw new OrderValidationError('Order not found', 404)
    throw err
  }
}

// Type helper for transaction context
export type TxClient = Prisma.TransactionClient
