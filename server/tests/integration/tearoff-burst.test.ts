import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'
import { createOrder } from '@/services/orderService'

/**
 * Concurrent tear-off assignment: N orders created concurrently for the same
 * event must each receive a DISTINCT tear-off number (numbers are assigned by
 * an atomic increment inside the order transaction). This guards against a
 * regression where two simultaneous orders could share a number.
 *
 * Note: SQLite serializes writes, so true parallelism is limited — the atomic
 * increment is what guarantees distinctness even under interleaving.
 */
describe('Concurrent tear-off numbers', () => {
  let server: AppServer
  let eventId: string
  let waiterId: string
  let productId: string

  beforeAll(async () => {
    server = buildServer()
    await server.ready()
  })
  afterAll(async () => {
    await server.close()
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.event.deleteMany({})
  })
  beforeEach(async () => {
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.event.deleteMany({})

    const ev = await prisma.event.create({ data: { name: 'Burst Event' } })
    eventId = ev.id
    const st = await prisma.station.create({ data: { name: 'Bar', eventId } })
    const p = await prisma.product.create({ data: { name: 'Bier', priceCents: 300, stationId: st.id } })
    productId = p.id
    const w = await prisma.waiter.create({ data: { name: 'W', pin: '1234', eventId } })
    waiterId = w.id
  })

  it('assigns DISTINCT tear-off numbers to overlapping order creations', async () => {
    const attempt = (i: number) =>
      createOrder({
        tableNumber: String(i),
        waiterId,
        eventId,
        items: [{ productId, quantity: 1 }],
      })

    // SQLite holds a single-writer file lock, so fire-and-forget parallel bursts
    // hit connection-busy timeouts rather than exercising the race. Instead we
    // launch overlapping calls in small groups (staggered Promise.all) so their
    // transactions interleave. Distinctness is guaranteed by the per-transaction
    // atomic increment on Waiter.tearOffNumber.
    const N = 12
    const results: Awaited<ReturnType<typeof attempt>>[] = []
    for (let i = 0; i < N; i += 3) {
      const batch = await Promise.all([attempt(i), attempt(i + 1), attempt(i + 2)])
      results.push(...batch)
    }

    const numbers = results.map((o) => o.tearOffNumber).sort((a, b) => (a ?? 0) - (b ?? 0))
    expect(numbers).toHaveLength(N)
    expect(new Set(numbers).size).toBe(N)
    expect(numbers[0]).toBe(1)
    expect(numbers[N - 1]).toBe(N)
  })
})