import { prisma } from '@/db/client'

/**
 * Seeds minimal test data: 1 event, 1 printer, 1 station, 2 products, 1 waiter.
 * Returns the eventId for convenience.
 */
export async function seedTestData(): Promise<{ eventId: string }> {
  const event = await prisma.event.create({
    data: { name: 'Seed Event', status: 'test' },
  })

  const printer = await prisma.printer.create({
    data: {
      eventId: event.id,
      name: 'Seed Printer',
      type: 'dummy',
      charsPerLine: 48,
    },
  })

  const station = await prisma.station.create({
    data: {
      eventId: event.id,
      name: 'Seed Station',
      printerId: printer.id,
      sortOrder: 1,
    },
  })

  await prisma.product.createMany({
    data: [
      { stationId: station.id, name: 'Bier', priceCents: 300, taxRateBps: 2000, sortOrder: 1 },
      { stationId: station.id, name: 'Cola', priceCents: 250, sortOrder: 2 },
    ],
  })

  await prisma.waiter.create({
    data: {
      eventId: event.id,
      name: 'Alice',
      pin: '1234',
    },
  })

  return { eventId: event.id }
}
