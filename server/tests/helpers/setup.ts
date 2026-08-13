import type { FastifyInstance } from 'fastify'
import { prisma } from '@/db/client'

export interface TestData {
  event: {
    id: string
    name: string
  }
  station: {
    id: string
    name: string
  }
  products: {
    beer: {
      id: string
      name: string
      price: number
    }
    schnitzel: {
      id: string
      name: string
      price: number
    }
  }
  waiter: {
    id: string
    name: string
    pin: string
  }
}

/**
 * Creates a test event, station, two products (Beer €3, Schnitzel €8) and
 * a waiter, then returns them. The event/station/products are created via
 * Prisma; the waiter is created via the waiters REST route using
 * `server.inject()` so the helper exercises the API as required.
 *
 * Pass a Fastify instance that already has the waiters route registered.
 */
export async function createTestData(server: FastifyInstance): Promise<TestData> {
  const event = await prisma.event.create({
    data: {
      name: `Test Event ${Date.now()}`,
    },
    select: { id: true, name: true },
  })

  const station = await prisma.station.create({
    data: {
      name: 'Main Station',
      eventId: event.id,
    },
    select: { id: true, name: true },
  })

  const beer = await prisma.product.create({
    data: {
      name: 'Beer',
      price: 3,
      stationId: station.id,
    },
    select: { id: true, name: true, price: true },
  })

  const schnitzel = await prisma.product.create({
    data: {
      name: 'Schnitzel',
      price: 8,
      stationId: station.id,
    },
    select: { id: true, name: true, price: true },
  })

  const waiterRes = await server.inject({
    method: 'POST',
    url: `/api/events/${event.id}/waiters`,
    payload: { name: 'Alice', pin: '1234' },
  })

  const waiter = waiterRes.json() as { id: string; name: string; pin: string }

  return {
    event,
    station,
    products: { beer, schnitzel },
    waiter,
  }
}

/** Clean up a TestData set created by {@link createTestData}. */
export async function cleanupTestData(data: TestData): Promise<void> {
  if (data?.event?.id) {
    await prisma.orderItem.deleteMany({ where: { order: { eventId: data.event.id } } }).catch(() => {})
    await prisma.order.deleteMany({ where: { eventId: data.event.id } }).catch(() => {})
    await prisma.waiter.deleteMany({ where: { eventId: data.event.id } }).catch(() => {})
    await prisma.product.deleteMany({ where: { station: { eventId: data.event.id } } }).catch(() => {})
    await prisma.station.deleteMany({ where: { eventId: data.event.id } }).catch(() => {})
    await prisma.event.delete({ where: { id: data.event.id } }).catch(() => {})
  }
}