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
 * and resets the tear-off counter (wiki §14 business rule).
 */
export async function updateEvent(id: string, data: Record<string, unknown>) {
  // Check for test→live transition
  if (data.status === 'live') {
    const event = await prisma.event.findUnique({ where: { id }, select: { status: true } })
    if (event && event.status === 'test') {
      // Wipe all orders for this event and reset tear-off counter
      await prisma.$transaction([
        prisma.orderItem.deleteMany({ where: { order: { eventId: id } } }),
        prisma.order.deleteMany({ where: { eventId: id } }),
        prisma.event.update({ where: { id }, data: { lastTearOffNumber: 0 } }),
      ])
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
