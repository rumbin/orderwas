import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { prisma } from '@/db/client'
import { createOrder } from '@/services/orderService'
import { existsSync, readdirSync, rmSync } from 'fs'
import { resolve } from 'path'

const PRINT_DIR = resolve(process.cwd(), 'tmp', 'printer-logs')

describe('Print dispatch on order creation', () => {
  let eventId: string
  let waiterId: string
  let barStationId: string
  let kitchenStationId: string
  let beerId: string
  let schnitzelId: string

  afterAll(async () => {
    // Clean up print logs
    if (existsSync(PRINT_DIR)) {
      rmSync(PRINT_DIR, { recursive: true, force: true })
    }
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.printer.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    // Clean print logs before each test
    if (existsSync(PRINT_DIR)) {
      for (const f of readdirSync(PRINT_DIR)) {
        rmSync(resolve(PRINT_DIR, f))
      }
    }

    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.printer.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})

    const event = await prisma.event.create({ data: { name: 'Print Test', status: 'test' } })
    eventId = event.id

    // Bar station with dummy printer
    const barPrinter = await prisma.printer.create({
      data: { name: 'Bar Drucker', type: 'dummy', eventId },
    })
    const bar = await prisma.station.create({
      data: { name: 'Bar', eventId, printerId: barPrinter.id },
    })
    barStationId = bar.id

    // Kitchen station with dummy printer
    const kitchenPrinter = await prisma.printer.create({
      data: { name: 'Küche Drucker', type: 'dummy', eventId },
    })
    const kitchen = await prisma.station.create({
      data: { name: 'Küche', eventId, printerId: kitchenPrinter.id },
    })
    kitchenStationId = kitchen.id

    // Products
    beerId = (await prisma.product.create({ data: { name: 'Bier', priceCents: 300, stationId: bar.id } })).id
    schnitzelId = (await prisma.product.create({ data: { name: 'Schnitzel', priceCents: 1200, stationId: kitchen.id } })).id

    // Waiter
    waiterId = (await prisma.waiter.create({ data: { name: 'Alice', pin: '1234', eventId } })).id
  })

  it('drinks order → job to bar printer only', async () => {
    await createOrder({
      tableNumber: '1',
      waiterId,
      eventId,
      items: [{ productId: beerId, quantity: 2 }],
    })

    // Wait for async print dispatch
    await new Promise((r) => setTimeout(r, 500))

    const files = readdirSync(PRINT_DIR)
    expect(files.length).toBe(1)
    expect(files[0]).toContain('Bar')
  })

  it('mixed order → jobs to bar + kitchen, each with its items', async () => {
    await createOrder({
      tableNumber: '2',
      waiterId,
      eventId,
      items: [
        { productId: beerId, quantity: 1 },
        { productId: schnitzelId, quantity: 1 },
      ],
    })

    await new Promise((r) => setTimeout(r, 500))

    const files = readdirSync(PRINT_DIR)
    expect(files.length).toBe(2)
    const stationNames = files.map((f) => {
      // filename: {timestamp}-{stationName}.bin
      const parts = f.split('-')
      return parts.slice(1).join('-').replace('.bin', '')
    })
    expect(stationNames).toContain('Bar')
    expect(stationNames).toContain('Küche')
  })

  it('station with ignore printer → no print job', async () => {
    // Create a station with an "ignore" printer
    const ignorePrinter = await prisma.printer.create({
      data: { name: 'Ignore', type: 'ignore', eventId },
    })
    const cafe = await prisma.station.create({
      data: { name: 'Cafe', eventId, printerId: ignorePrinter.id },
    })
    const coffeeId = (await prisma.product.create({ data: { name: 'Kaffee', priceCents: 200, stationId: cafe.id } })).id

    await createOrder({
      tableNumber: '3',
      waiterId,
      eventId,
      items: [{ productId: coffeeId, quantity: 1 }],
    })

    await new Promise((r) => setTimeout(r, 500))

    const files = readdirSync(PRINT_DIR)
    // Cafe should NOT generate a print (ignore printer)
    const cafeFiles = files.filter((f) => f.includes('Cafe'))
    expect(cafeFiles.length).toBe(0)
  })

  it('station with no printer → no print job', async () => {
    // Create a station without a printer
    const dessert = await prisma.station.create({
      data: { name: 'Dessert', eventId },
    })
    const cakeId = (await prisma.product.create({ data: { name: 'Kuchen', priceCents: 250, stationId: dessert.id } })).id

    await createOrder({
      tableNumber: '4',
      waiterId,
      eventId,
      items: [{ productId: cakeId, quantity: 1 }],
    })

    await new Promise((r) => setTimeout(r, 500))

    const files = readdirSync(PRINT_DIR)
    const dessertFiles = files.filter((f) => f.includes('Dessert'))
    expect(dessertFiles.length).toBe(0)
  })

  it('network printer failure does not fail the order', async () => {
    // Create a station with a network printer pointing to a dead IP
    const netPrinter = await prisma.printer.create({
      data: { name: 'Dead Printer', type: 'network', ip: '192.168.99.99', eventId },
    })
    const grill = await prisma.station.create({
      data: { name: 'Grill', eventId, printerId: netPrinter.id },
    })
    const sausageId = (await prisma.product.create({ data: { name: 'Bratwurst', priceCents: 400, stationId: grill.id } })).id

    // The order should succeed even though the printer is unreachable
    const order = await createOrder({
      tableNumber: '5',
      waiterId,
      eventId,
      items: [{ productId: sausageId, quantity: 1 }],
    })

    expect(order.id).toBeDefined()
    expect(order.status).toBe('open')
    // No print file for Grill (network printer, not dummy)
    await new Promise((r) => setTimeout(r, 1000))
    const files = readdirSync(PRINT_DIR)
    const grillFiles = files.filter((f) => f.includes('Grill'))
    expect(grillFiles.length).toBe(0)
  })
})