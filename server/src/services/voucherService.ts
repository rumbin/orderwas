import { prisma } from '@/db/client'
import { logAudit } from '@/services/auditService'

export class VoucherError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 400) {
    super(message)
    this.statusCode = statusCode
  }
}

/**
 * Creates a voucher for an event.
 */
export async function createVoucher(eventId: string, code: string, valueCents: number) {
  // Check uniqueness
  const existing = await prisma.voucher.findUnique({
    where: { eventId_code: { eventId, code } },
  })
  if (existing) throw new VoucherError('Voucher code already exists for this event')

  const voucher = await prisma.voucher.create({
    data: { eventId, code, valueCents },
  })

  logAudit({
    eventId,
    action: 'voucher.created',
    entityType: 'Voucher',
    entityId: voucher.id,
    afterData: { code, valueCents, status: 'active' },
  }).catch((err) => console.error('[audit] log error:', err))

  return voucher
}

/**
 * Redeems a voucher code against an event.
 * Returns the voucher if valid, throws if not.
 */
export async function redeemVoucher(eventId: string, code: string, orderId: string) {
  const voucher = await prisma.voucher.findUnique({
    where: { eventId_code: { eventId, code } },
  })

  if (!voucher) throw new VoucherError('Voucher not found', 404)
  if (voucher.status !== 'active') throw new VoucherError(`Voucher is ${voucher.status}`)
  if (voucher.valueCents <= 0) throw new VoucherError('Voucher has no value')

  const updated = await prisma.voucher.update({
    where: { id: voucher.id },
    data: {
      status: 'redeemed',
      redeemedOrderId: orderId,
      redeemedAt: new Date(),
    },
  })

  logAudit({
    eventId,
    action: 'voucher.redeemed',
    entityType: 'Voucher',
    entityId: voucher.id,
    beforeData: { code: voucher.code, valueCents: voucher.valueCents, status: 'active' },
    afterData: { code: updated.code, valueCents: updated.valueCents, status: 'redeemed', redeemedOrderId: orderId },
    quantity: -voucher.valueCents,
  }).catch((err) => console.error('[audit] log error:', err))

  return updated
}

/**
 * Lists vouchers for an event with optional status filter.
 */
export async function listVouchers(eventId: string, status?: string) {
  return prisma.voucher.findMany({
    where: {
      eventId,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Bulk-creates vouchers for an event.
 */
export async function bulkCreateVouchers(
  eventId: string,
  prefix: string,
  valueCents: number,
  count: number,
  startNumber = 1,
) {
  const vouchers = []
  for (let i = 0; i < count; i++) {
    const code = `${prefix}${String(startNumber + i).padStart(4, '0')}`
    try {
      const v = await createVoucher(eventId, code, valueCents)
      vouchers.push(v)
    } catch {
      // Skip duplicate codes
    }
  }
  return vouchers
}

/**
 * Invalidates (expires) a voucher.
 */
export async function expireVoucher(eventId: string, code: string) {
  const voucher = await prisma.voucher.findUnique({
    where: { eventId_code: { eventId, code } },
  })
  if (!voucher) throw new VoucherError('Voucher not found', 404)
  if (voucher.status !== 'active') throw new VoucherError(`Voucher is already ${voucher.status}`)

  return prisma.voucher.update({
    where: { id: voucher.id },
    data: { status: 'expired' },
  })
}
