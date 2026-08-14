import { prisma } from '@/db/client'

/**
 * Creates a printer for an event.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createPrinter(eventId: string, data: any) {
  return prisma.printer.create({ data: { eventId, ...data } })
}

/**
 * Lists printers for an event.
 */
export async function listPrintersByEvent(eventId: string) {
  return prisma.printer.findMany({ where: { eventId }, orderBy: { name: 'asc' } })
}

/**
 * Gets a single printer.
 */
export async function getPrinter(id: string) {
  return prisma.printer.findUnique({ where: { id } })
}

/**
 * Updates a printer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updatePrinter(id: string, data: any) {
  try {
    return await prisma.printer.update({ where: { id }, data })
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'P2025') return null
    throw err
  }
}

/**
 * Deletes a printer. Returns true if deleted, false if not found.
 * Fails if stations or waiters reference it (FK constraint).
 */
export async function deletePrinter(id: string): Promise<boolean> {
  try {
    await prisma.printer.delete({ where: { id } })
    return true
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'P2025') return false
    throw err
  }
}