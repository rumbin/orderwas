import { prisma } from '@/db/client'
import { createOrder, OrderValidationError } from '@/services/orderService'

/**
 * Guest QR ordering. The client sends an opaque token that encodes
 * `eventId:tableNumber`. Orders are attributed to a dedicated per-event ghost
 * waiter (hidden, so it never appears in the waiter list/logins), never to an
 * arbitrary active waiter.
 */

/** Name used for the auto-provisioned ghost waiter that holds guest orders. */
const GUEST_WAITER_NAME = 'Gast'

export interface GuestOrderInput {
  token: string
  items: Array<{
    productId: string
    quantity: number
    comment?: string
  }>
}

export interface GuestOrderResult {
  orderId: string
  tearOffNumber: number | null
  totalCents: number
}

export async function guestOrder(params: GuestOrderInput): Promise<GuestOrderResult> {
  // Decode token → eventId + tableNumber
  let eventId: string
  let tableNumber: string
  try {
    const decoded = Buffer.from(params.token, 'base64url').toString()
    const [eid, table] = decoded.split(':')
    if (!eid || !table) throw new Error()
    eventId = eid
    tableNumber = table
  } catch {
    throw new OrderValidationError('Invalid token', 400)
  }

  // Verify event exists
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, status: true } })
  if (!event) throw new OrderValidationError('Event not found', 404)

  // Provision (or reuse) the hidden ghost waiter for this event.
  const ghost = await getGhostWaiter(eventId)

  try {
    const order = await createOrder({
      tableNumber,
      waiterId: ghost.id,
      eventId,
      items: params.items,
    })
    return {
      orderId: order.id,
      tearOffNumber: order.tearOffNumber,
      totalCents: order.totalCents,
    }
  } catch (err) {
    if (err instanceof OrderValidationError) throw err
    throw new OrderValidationError((err as Error).message, 400)
  }
}

/** Finds or creates the hidden ghost waiter that owns guest orders. */
async function getGhostWaiter(eventId: string) {
  const existing = await prisma.waiter.findFirst({
    where: { eventId, name: GUEST_WAITER_NAME },
    select: { id: true },
  })
  if (existing) return existing

  return prisma.waiter.create({
    data: {
      name: GUEST_WAITER_NAME,
      pin: '0000', // ghost waiter never logs in; PIN is inert
      eventId,
      hidden: true,
      active: true,
    },
    select: { id: true },
  })
}

export { GUEST_WAITER_NAME }