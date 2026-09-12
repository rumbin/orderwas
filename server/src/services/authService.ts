import { prisma } from '@/db/client'

/**
 * Resolves the current admin PIN: DB setting → env fallback → 'admin'.
 */
export async function getAdminPin(): Promise<string> {
  const dbSetting = await prisma.systemSetting.findUnique({ where: { key: 'admin_pin' } })
  return dbSetting?.value ?? process.env.ADMIN_PIN ?? 'admin'
}

/**
 * Persists the admin PIN in the DB (upsert on the admin_pin key).
 */
export async function setAdminPin(newPin: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'admin_pin' },
    update: { value: newPin },
    create: { key: 'admin_pin', value: newPin },
  })
}

// Login lookup includes `pin` on purpose — it is verified against the submitted
// PIN. The route strips it before returning the waiter to the client.
const loginWaiterSelect = {
  id: true,
  name: true,
  pin: true,
  eventId: true,
  canCancel: true,
  canCashOut: true,
  canStatistics: true,
  canCreateWaiters: true,
  canTransfer: true,
  isStationWaiter: true,
  isCounter: true,
  active: true,
} as const

/**
 * Looks up a waiter for login (includes `pin` for verification).
 */
export async function findWaiterForLogin(waiterId: string) {
  return prisma.waiter.findUnique({ where: { id: waiterId }, select: loginWaiterSelect })
}

// /auth/me returns the caller profile — deliberately no `pin`.
const meWaiterSelect = {
  id: true,
  name: true,
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
  hidden: true,
  autoSammelbon: true,
  active: true,
} as const

/**
 * Gets the current waiter's profile for /auth/me. Returns null if not found.
 * Never selects `pin`.
 */
export async function getMeWaiter(waiterId: string) {
  return prisma.waiter.findUnique({ where: { id: waiterId }, select: meWaiterSelect })
}