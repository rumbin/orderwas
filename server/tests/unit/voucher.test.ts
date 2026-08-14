import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { prisma } from '@/db/client'

describe('Voucher entity', () => {
  let eventId: string

  afterAll(async () => {
    await prisma.voucher.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    await prisma.voucher.deleteMany({})
    await prisma.event.deleteMany({})
    const ev = await prisma.event.create({ data: { name: 'Voucher Test' } })
    eventId = ev.id
  })

  it('creates a voucher with active status and integer cents', async () => {
    const voucher = await prisma.voucher.create({
      data: { eventId, code: 'ABC123', valueCents: 500 },
    })
    expect(voucher.id).toBeDefined()
    expect(voucher.code).toBe('ABC123')
    expect(voucher.valueCents).toBe(500)
    expect(voucher.status).toBe('active')
    expect(voucher.redeemedOrderId).toBeNull()
    expect(voucher.redeemedAt).toBeNull()
  })

  it('enforces unique (eventId, code) constraint', async () => {
    await prisma.voucher.create({ data: { eventId, code: 'DUPLICATE', valueCents: 100 } })
    await expect(
      prisma.voucher.create({ data: { eventId, code: 'DUPLICATE', valueCents: 200 } }),
    ).rejects.toThrow()
  })

  it('allows same code in different events', async () => {
    const event2 = await prisma.event.create({ data: { name: 'Event 2' } })
    await prisma.voucher.create({ data: { eventId, code: 'SHARED', valueCents: 100 } })
    const v2 = await prisma.voucher.create({ data: { eventId: event2.id, code: 'SHARED', valueCents: 100 } })
    expect(v2.code).toBe('SHARED')
  })

  it('transitions status from active to redeemed', async () => {
    const voucher = await prisma.voucher.create({ data: { eventId, code: 'REDEEM', valueCents: 500 } })
    expect(voucher.status).toBe('active')

    const redeemed = await prisma.voucher.update({
      where: { id: voucher.id },
      data: { status: 'redeemed', redeemedAt: new Date(), redeemedOrderId: null },
    })
    expect(redeemed.status).toBe('redeemed')
    expect(redeemed.redeemedAt).not.toBeNull()
  })

  it('cascades on event deletion', async () => {
    await prisma.voucher.create({ data: { eventId, code: 'CASCADE', valueCents: 100 } })
    await prisma.event.delete({ where: { id: eventId } })
    const remaining = await prisma.voucher.findMany({ where: { eventId } })
    expect(remaining).toHaveLength(0)
  })
})