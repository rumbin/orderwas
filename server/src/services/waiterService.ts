import { prisma } from '@/db/client'

// Fields returned to clients. PIN is NEVER included. This is the CANONICAL
// select (AGENTS.md rule 3) — add new fields here, never add `pin`.
export const waiterSelect = {
  id: true,
  name: true,
  logo: true,
  eventId: true,
  printerId: true,
  pickupCode: true,
  printsImmediately: true,
  canCancel: true,
  canCashOut: true,
  canStatistics: true,
  canCreateWaiters: true,
  canTransfer: true,
  isStationWaiter: true,
  isCounter: true,
  tearOffNumber: true,
  hidden: true,
  autoSammelbon: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const

export interface CreateWaiterData {
  name: string
  pin: string
  printerId?: string
  pickupCode?: string
  canCancel?: boolean
  canCashOut?: boolean
  canStatistics?: boolean
}

/**
 * Creates a waiter under an event. Returns null if the event does not exist
 * (caller maps to a 404). Never selects `pin` into the response.
 */
export async function createWaiter(eventId: string, data: CreateWaiterData) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!event) return null

  const { name, pin, printerId, pickupCode, canCancel, canCashOut, canStatistics } = data
  return prisma.waiter.create({
    data: { name, pin, printerId, pickupCode, canCancel, canCashOut, canStatistics, eventId },
    select: waiterSelect,
  })
}

/**
 * Lists waiters for an event. Never selects `pin`.
 */
export async function listWaitersByEvent(eventId: string) {
  return prisma.waiter.findMany({ where: { eventId }, select: waiterSelect })
}

/**
 * Gets a single waiter. Returns null if not found. Never selects `pin`.
 */
export async function getWaiter(id: string) {
  return prisma.waiter.findUnique({ where: { id }, select: waiterSelect })
}

/**
 * Updates a waiter. Throws P2025 if the waiter does not exist (caller maps to a
 * 404). Never selects `pin`.
 */
export async function updateWaiter(id: string, data: Record<string, unknown>) {
  return prisma.waiter.update({ where: { id }, data, select: waiterSelect })
}

/**
 * Deletes a waiter. Throws P2025 if the waiter does not exist (caller maps to a 404).
 */
export async function deleteWaiter(id: string) {
  await prisma.waiter.delete({ where: { id } })
}

/**
 * Toggles a waiter's active flag. Throws P2025 if the waiter does not exist
 * (caller maps to a 404). Never selects `pin`.
 */
export async function toggleWaiterActive(id: string, active: boolean) {
  return prisma.waiter.update({ where: { id }, data: { active }, select: waiterSelect })
}