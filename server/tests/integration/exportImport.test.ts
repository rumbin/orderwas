import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'
import { exportEvent, importEvent } from '@/services/configService'

describe('Configuration export/import', () => {
  let server: AppServer
  let eventId: string

  afterAll(async () => {
    await server?.close()
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.stationAltPrinter.deleteMany({})
    await prisma.printer.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.appLayout.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.stationAltPrinter.deleteMany({})
    await prisma.printer.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.appLayout.deleteMany({})
    await prisma.event.deleteMany({})

    // Create a full event via API
    server = buildServer()
    await server.ready()

    const evRes = await server.inject({
      method: 'POST',
      url: '/api/events',
      payload: { name: 'Export Test Event' },
    })
    eventId = evRes.json().id

    // Add printer
    const printerRes = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/printers`,
      payload: { name: 'Bar Drucker', type: 'dummy', charsPerLine: 48 },
    })
    const printerId = printerRes.json().id

    // Add station with printer
    const stationRes = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/stations`,
      payload: { name: 'Bar', printerId, sortOrder: 1, kitchenMonitor: false },
    })
    const stationId = stationRes.json().id

    // Add products
    await server.inject({
      method: 'POST',
      url: `/api/stations/${stationId}/products`,
      payload: { name: 'Bier', priceCents: 300, taxRateBps: 2000, sortOrder: 1 },
    })
    await server.inject({
      method: 'POST',
      url: `/api/stations/${stationId}/products`,
      payload: { name: 'Cola', priceCents: 250, sortOrder: 2 },
    })

    // Add waiter
    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/waiters`,
      payload: { name: 'Alice', pin: '1234', canCancel: true },
    })
  })

  it('GET /events/:id/export returns event configuration', async () => {
    const res = await server.inject({ method: 'GET', url: `/api/events/${eventId}/export` })
    expect(res.statusCode).toBe(200)
    const data = res.json()
    expect(data.event.name).toBe('Export Test Event')
    expect(data.stations).toHaveLength(1)
    expect(data.stations[0].name).toBe('Bar')
    expect(data.stations[0].products).toHaveLength(2)
    expect(data.stations[0].printerName).toBe('Bar Drucker')
    expect(data.waiters).toHaveLength(1)
    expect(data.waiters[0].name).toBe('Alice')
    expect(data.waiters[0].pin).toBeUndefined() // PINs never exported
    expect(data.printers).toHaveLength(1)
    expect(data.printers[0].name).toBe('Bar Drucker')
  })

  it('POST /events/import creates a new event from JSON', async () => {
    // Export
    const exportRes = await server.inject({ method: 'GET', url: `/api/events/${eventId}/export` })
    const exported = exportRes.json()

    // Import
    const importRes = await server.inject({
      method: 'POST',
      url: '/api/events/import',
      payload: exported,
    })
    expect(importRes.statusCode).toBe(201)
    const imported = importRes.json()
    expect(imported.id).not.toBe(eventId)
    expect(imported.name).toBe('Export Test Event')
  })

  it('round-trip: export→import→export is idempotent', async () => {
    // First export
    const export1 = await exportEvent(eventId)
    expect(export1).not.toBeNull()

    // Import to create new event
    const imported = await importEvent(export1!)
    expect(imported.name).toBe('Export Test Event')

    // Export the imported event
    const export2 = await exportEvent(imported.id)
    expect(export2).not.toBeNull()

    // Compare — should be structurally identical (minus IDs)
    expect(export2!.event.name).toBe(export1!.event.name)
    expect(export2!.stations.length).toBe(export1!.stations.length)
    expect(export2!.stations[0].name).toBe(export1!.stations[0].name)
    expect(export2!.stations[0].products.length).toBe(export1!.stations[0].products.length)
    expect(export2!.stations[0].products[0].name).toBe(export1!.stations[0].products[0].name)
    expect(export2!.stations[0].products[0].priceCents).toBe(export1!.stations[0].products[0].priceCents)
    expect(export2!.stations[0].printerName).toBe(export1!.stations[0].printerName)
    expect(export2!.waiters.length).toBe(export1!.waiters.length)
    expect(export2!.waiters[0].name).toBe(export1!.waiters[0].name)
    expect(export2!.printers.length).toBe(export1!.printers.length)
    expect(export2!.printers[0].name).toBe(export1!.printers[0].name)
    expect(export2!.printers[0].charsPerLine).toBe(export1!.printers[0].charsPerLine)
  })

  it('imported waiters get default PIN 0000', async () => {
    const export1 = await exportEvent(eventId)
    const imported = await importEvent(export1!)

    // Login with default PIN should work
    const waiters = await prisma.waiter.findMany({ where: { eventId: imported.id } })
    expect(waiters).toHaveLength(1)
    expect(waiters[0].pin).toBe('0000')
  })

  it('POST /events/import returns 400 for missing event name', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/events/import',
      payload: { stations: [] },
    })
    expect(res.statusCode).toBe(400)
  })
})
