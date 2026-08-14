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
 */
export async function updateEvent(id: string, data: Record<string, unknown>) {
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
