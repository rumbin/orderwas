import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '@/db/client'
import { exportEvent, importEvent } from '@/services/configService'
import { seedTestData } from '../helpers/seed'

describe('Export/Import Roundtrip', () => {
  let eventId: string

  beforeEach(async () => {
    // Clean database (FK-safe order)
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.voucher.deleteMany({})
    await prisma.auditLog.deleteMany({})
    await prisma.appLayout.deleteMany({})
    await prisma.productComponent.deleteMany({})
    await prisma.productExtraOption.deleteMany({})
    await prisma.productExtra.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.stationAltPrinter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.printer.deleteMany({})
    await prisma.event.deleteMany({})

    const data = await seedTestData()
    eventId = data.eventId
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('export → import → re-export produces equivalent config', async () => {
    // First export
    const exported1 = await exportEvent(eventId)
    expect(exported1).not.toBeNull()
    expect(exported1!.stations.length).toBeGreaterThan(0)

    // Import into a new event
    const newEvent = await importEvent(exported1!)
    expect(newEvent.name).toBe(exported1!.event.name)

    // Second export
    const exported2 = await exportEvent(newEvent.id)
    expect(exported2).not.toBeNull()

    // Compare structure (ignoring event IDs)
    expect(exported2!.event.name).toBe(exported1!.event.name)
    expect(exported2!.event.status).toBe(exported1!.event.status)
    expect(exported2!.stations.length).toBe(exported1!.stations.length)
    expect(exported2!.waiters.length).toBe(exported1!.waiters.length)
    expect(exported2!.printers.length).toBe(exported1!.printers.length)

    // Compare station details
    for (let i = 0; i < exported1!.stations.length; i++) {
      const s1 = exported1!.stations[i]
      const s2 = exported2!.stations[i]
      expect(s2.name).toBe(s1.name)
      expect(s2.products.length).toBe(s1.products.length)
      for (let j = 0; j < s1.products.length; j++) {
        expect(s2.products[j].name).toBe(s1.products[j].name)
        expect(s2.products[j].priceCents).toBe(s1.products[j].priceCents)
      }
    }

    // Compare waiters
    for (let i = 0; i < exported1!.waiters.length; i++) {
      expect(exported2!.waiters[i].name).toBe(exported1!.waiters[i].name)
    }

    // Clean up imported event
    await prisma.orderItem.deleteMany({ where: { order: { eventId: newEvent.id } } })
    await prisma.order.deleteMany({ where: { eventId: newEvent.id } })
    await prisma.product.deleteMany({ where: { station: { eventId: newEvent.id } } })
    await prisma.station.deleteMany({ where: { eventId: newEvent.id } })
    await prisma.waiter.deleteMany({ where: { eventId: newEvent.id } })
    await prisma.printer.deleteMany({ where: { eventId: newEvent.id } })
    await prisma.event.deleteMany({ where: { id: newEvent.id } })
  })
})
