import { prisma } from '@/db/client'
import type { AppLayout } from '@prisma/client'

export const layoutSelect = {
  id: true,
  eventId: true,
  waiterId: true,
  columns: true,
  rows: true,
  buttons: true,
  createdAt: true,
  updatedAt: true,
} as const

export interface CreateLayoutData {
  waiterId?: string
  columns?: number
  rows?: number
  buttons?: string
}

/**
 * Lists layouts for an event. Returns null if the event does not exist
 * (caller maps to a 404).
 */
export async function listLayoutsByEvent(eventId: string): Promise<AppLayout[] | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!event) return null
  return prisma.appLayout.findMany({ where: { eventId }, select: layoutSelect })
}

/**
 * Creates a layout under an event. Returns null if the event does not exist
 * (caller maps to a 404).
 */
export async function createLayout(eventId: string, data: CreateLayoutData): Promise<AppLayout | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!event) return null

  const { waiterId, columns, rows, buttons } = data
  return prisma.appLayout.create({
    data: {
      eventId,
      waiterId: waiterId ?? null,
      columns: columns ?? 3,
      rows: rows ?? 5,
      buttons: buttons ?? '[]',
    },
    select: layoutSelect,
  })
}

/**
 * Updates a layout. Throws P2025 if the layout does not exist (caller maps to a 404).
 */
export async function updateLayout(id: string, data: Record<string, unknown>) {
  return prisma.appLayout.update({ where: { id }, data, select: layoutSelect })
}

/**
 * Deletes a layout. Throws P2025 if the layout does not exist (caller maps to a 404).
 */
export async function deleteLayout(id: string) {
  await prisma.appLayout.delete({ where: { id } })
}

/**
 * Resolves a waiter's layout with fallbacks:
 *   1. waiter-specific layout
 *   2. event default layout (waiterId null)
 *   3. any layout for the event
 * Returns { found: false } when the waiter does not exist (caller maps to a 404);
 * otherwise { found: true, layout } where layout may be null.
 */
export async function getWaiterLayout(
  waiterId: string,
): Promise<{ found: boolean; layout: AppLayout | null }> {
  const waiter = await prisma.waiter.findUnique({
    where: { id: waiterId },
    select: { id: true, eventId: true },
  })
  if (!waiter) return { found: false, layout: null }

  // Try waiter-specific layout first
  const waiterLayout = await prisma.appLayout.findFirst({
    where: { waiterId, eventId: waiter.eventId },
    select: layoutSelect,
  })
  if (waiterLayout) return { found: true, layout: waiterLayout }

  // Fallback to event default (null waiterId)
  const defaultLayout = await prisma.appLayout.findFirst({
    where: { eventId: waiter.eventId, waiterId: null },
    select: layoutSelect,
  })
  if (defaultLayout) return { found: true, layout: defaultLayout }

  // Fallback to any layout for the event (first one)
  const anyLayout = await prisma.appLayout.findFirst({
    where: { eventId: waiter.eventId },
    select: layoutSelect,
  })
  return { found: true, layout: anyLayout ?? null }
}