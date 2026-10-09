import { prisma } from '@/db/client'

/**
 * Creates an event.
 */
export async function createEvent(data: { name: string; status?: string }) {
  return prisma.event.create({
    data: {
      name: data.name,
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
  })
}

/**
 * Lists all events ordered by creation time.
 */
export async function listEvents() {
  return prisma.event.findMany({ orderBy: { createdAt: 'asc' } })
}

/**
 * Gets a single event by ID.
 */
export async function getEvent(id: string) {
  return prisma.event.findUnique({ where: { id } })
}

/**
 * Updates an event.
 * Special rule: switching status from "test" to "live" wipes all orders
 * (wiki §14 business rule). The Theke's Bon numbering follows the orders
 * registered at that counter, so wiping restarts it at 1 automatically —
 * there is no separate counter to reset.
 * Special rule: toggling `counterEnabled` syncs the "Theke" counter waiter.
 */
export async function updateEvent(id: string, data: Record<string, unknown>) {
  // Check for test→live transition
  if (data.status === 'live') {
    const event = await prisma.event.findUnique({ where: { id }, select: { status: true } })
    if (event && event.status === 'test') {
      // Wipe all orders for this event. Tear-off/Bon numbering is derived from
      // the orders themselves (last order at the counter + 1), so the Theke
      // restarts at Bon 1 with no explicit counter reset.
      await prisma.$transaction([
        prisma.orderItem.deleteMany({ where: { order: { eventId: id } } }),
        prisma.order.deleteMany({ where: { eventId: id } }),
      ])
    }
  }

  // Sync the counter login identity with the counterEnabled flag.
  const counterEnabled = data.counterEnabled
  if (typeof counterEnabled === 'boolean') {
    const event = await prisma.event.findUnique({ where: { id }, select: { counterEnabled: true } })
    if (event && event.counterEnabled !== counterEnabled) {
      await syncCounterWaiter(id, counterEnabled)
    }
  }

  try {
    return await prisma.event.update({ where: { id }, data })
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'P2025') return null
    throw err
  }
}

/**
 * The "Theke" counter is a login identity: a waiter flagged `isCounter` that
 * sells with Bon (tear-off) numbers instead of table numbers.
 *
 * - enable:  revive the existing counter waiter (hidden ones included) or
 *            create it — idempotent, so toggling twice never duplicates.
 * - disable: delete it while it has no orders; otherwise keep the row (orders
 *            reference it) and just hide it from the login list.
 *
 * Exported for tests.
 */
export async function syncCounterWaiter(eventId: string, enabled: boolean): Promise<void> {
  const existing = await prisma.waiter.findMany({ where: { eventId, isCounter: true } })

  if (enabled) {
    if (existing.length > 0) {
      await prisma.waiter.updateMany({
        where: { eventId, isCounter: true },
        data: { hidden: false, active: true },
      })
      return
    }
    await prisma.waiter.create({
      data: {
        name: 'Theke',
        pin: '0000',
        eventId,
        isCounter: true,
        canCashOut: true,
        canCancel: true,
        hidden: false,
      },
    })
    return
  }

  for (const waiter of existing) {
    const orderCount = await prisma.order.count({ where: { waiterId: waiter.id } })
    if (orderCount === 0) {
      await prisma.waiter.delete({ where: { id: waiter.id } })
    } else {
      await prisma.waiter.update({ where: { id: waiter.id }, data: { hidden: true } })
    }
  }
}

/**
 * Deletes an event. Returns true if deleted, false if not found.
 */
export async function deleteEvent(id: string): Promise<boolean> {
  try {
    await prisma.event.delete({ where: { id } })
    return true
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'P2025') return false
    throw err
  }
}
