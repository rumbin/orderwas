import { prisma } from '@/db/client'
import type { Station } from '@prisma/client'

export interface ReorderStationItem {
  id: string
  sortOrder: number
}

export interface CreateStationData {
  name: string
  printerId?: string
  kitchenMonitor?: boolean
  sortOrder?: number
  copyPrint?: boolean
}

/**
 * Bulk-updates sortOrder for a list of stations within a transaction.
 */
export async function reorderStations(items: ReorderStationItem[]) {
  await prisma.$transaction(
    items.map(({ id, sortOrder }) => prisma.station.update({ where: { id }, data: { sortOrder } })),
  )
}

/**
 * Creates a station under an event. Returns null if the event does not exist
 * (caller maps to a 404).
 */
export async function createStation(eventId: string, data: CreateStationData): Promise<Station | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!event) return null

  return prisma.station.create({
    data: {
      name: data.name,
      eventId,
      ...('printerId' in data ? { printerId: data.printerId } : {}),
      ...('kitchenMonitor' in data ? { kitchenMonitor: data.kitchenMonitor } : {}),
      ...('sortOrder' in data ? { sortOrder: data.sortOrder } : {}),
      ...('copyPrint' in data ? { copyPrint: data.copyPrint } : {}),
    },
    include: { printer: true },
  })
}

/**
 * Lists stations for an event ordered by sortOrder. Returns null if the event
 * does not exist (caller maps to a 404).
 */
export async function listStationsByEvent(eventId: string): Promise<Station[] | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!event) return null
  return prisma.station.findMany({
    where: { eventId },
    orderBy: { sortOrder: 'asc' },
    include: { printer: true },
  })
}

/**
 * Gets a single station (with printer). Returns null if not found.
 */
export async function getStation(id: string) {
  return prisma.station.findUnique({ where: { id }, include: { printer: true } })
}

/**
 * Updates a station (with printer). Returns null if the station does not exist
 * (caller maps to a 404).
 */
export async function updateStation(id: string, data: Record<string, unknown>) {
  const station = await prisma.station.findUnique({ where: { id } })
  if (!station) return null
  return prisma.station.update({ where: { id }, data, include: { printer: true } })
}

/**
 * Deletes a station. Returns false if the station does not exist (no-op);
 * otherwise deletes and returns true.
 */
export async function deleteStation(id: string): Promise<boolean> {
  const station = await prisma.station.findUnique({ where: { id } })
  if (!station) return false
  await prisma.station.delete({ where: { id } })
  return true
}