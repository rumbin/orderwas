import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding development database...')

  // Wipe existing data (dev only — fresh start each seed)
  // Use catch to handle fresh databases where tables might not exist yet
  // FK-safe order: OrderItem → Order → Product → Waiter → StationAltPrinter → Printer → Station → Voucher → AppLayout → Event
  await prisma.orderItem.deleteMany({}).catch(() => {})
  await prisma.order.deleteMany({}).catch(() => {})
  await prisma.product.deleteMany({}).catch(() => {})
  await prisma.waiter.deleteMany({}).catch(() => {})
  await prisma.stationAltPrinter.deleteMany({}).catch(() => {})
  await prisma.printer.deleteMany({}).catch(() => {})
  await prisma.station.deleteMany({}).catch(() => {})
  await prisma.voucher.deleteMany({}).catch(() => {})
  await prisma.appLayout.deleteMany({}).catch(() => {})
  await prisma.event.deleteMany({}).catch(() => {})

  // Event
  const event = await prisma.event.create({
    data: { name: 'Testfest', status: 'test' },
  })
  console.log(`  ✓ Event: ${event.name} (${event.id})`)

  // Printers
  const barPrinter = await prisma.printer.create({
    data: { name: 'Bar Drucker', type: 'dummy', eventId: event.id, charsPerLine: 42 },
  })
  const kuechePrinter = await prisma.printer.create({
    data: { name: 'Küche Drucker', type: 'dummy', eventId: event.id, charsPerLine: 42 },
  })
  console.log(`  ✓ Printers: Bar Drucker (dummy), Küche Drucker (dummy)`)

  // Stations
  const bar = await prisma.station.create({
    data: { name: 'Bar', eventId: event.id, sortOrder: 1, kitchenMonitor: false, printerId: barPrinter.id },
  })
  const kueche = await prisma.station.create({
    data: { name: 'Küche', eventId: event.id, sortOrder: 2, kitchenMonitor: true, printerId: kuechePrinter.id },
  })
  const kaffee = await prisma.station.create({
    data: { name: 'Kaffee', eventId: event.id, sortOrder: 3, kitchenMonitor: false },
  })
  console.log(`  ✓ Stations: Bar, Küche, Kaffee`)

  // Products — Bar (prices in cents!)
  const barProducts = [
    { name: 'Bier (Helles)', shortName: 'Bier', priceCents: 300, taxRateBps: 2000, sortOrder: 1, color: 'amber-500' },
    { name: 'Bier (Radler)', shortName: 'Radler', priceCents: 350, taxRateBps: 2000, sortOrder: 2, color: 'amber-500' },
    { name: 'Weißwein', shortName: 'Weiß', priceCents: 400, taxRateBps: 2000, sortOrder: 3, color: 'violet-500' },
    { name: 'Rotwein', shortName: 'Rot', priceCents: 400, taxRateBps: 2000, sortOrder: 4, color: 'red-500' },
    { name: 'Cola', shortName: null, priceCents: 250, taxRateBps: 2000, sortOrder: 5, color: 'rose-500' },
    { name: 'Wasser', shortName: null, priceCents: 200, taxRateBps: 2000, sortOrder: 6, color: 'sky-500' },
  ]
  for (const p of barProducts) {
    await prisma.product.create({ data: { ...p, stationId: bar.id } })
  }

  // Products — Küche
  const kuecheProducts = [
    { name: 'Schnitzel mit Pommes', shortName: 'Schnitzel', priceCents: 1200, taxRateBps: 1000, sortOrder: 1, color: 'orange-500' },
    { name: 'Bratwurst', shortName: 'Bratwurscht', priceCents: 450, taxRateBps: 1000, sortOrder: 2, color: 'red-500' },
    { name: 'Pommes', shortName: null, priceCents: 300, taxRateBps: 1000, sortOrder: 3, color: 'yellow-500' },
    { name: 'Käsebrot', shortName: null, priceCents: 250, taxRateBps: 1000, sortOrder: 4, color: 'green-500' },
    { name: 'Gulasch', shortName: null, priceCents: 900, taxRateBps: 1000, sortOrder: 5, color: 'red-500' },
  ]
  for (const p of kuecheProducts) {
    await prisma.product.create({ data: { ...p, stationId: kueche.id } })
  }
  // Extras for Bratwurst: sauce choice + toppings
  const bratwurst = await prisma.product.findFirstOrThrow({ where: { name: 'Bratwurst', stationId: kueche.id } })
  await prisma.productExtra.create({
    data: {
      productId: bratwurst.id,
      name: 'Soße',
      multiSelect: false,
      sortOrder: 1,
      options: {
        create: [
          { name: 'Ohne Senf', priceDeltaCents: 0, sortOrder: 1 },
          { name: 'Mit Senf', priceDeltaCents: 0, sortOrder: 2 },
          { name: 'Mit Ketchup', priceDeltaCents: 50, sortOrder: 3 },
        ],
      },
    },
  })
  await prisma.productExtra.create({
    data: {
      productId: bratwurst.id,
      name: 'Extras',
      multiSelect: true,
      sortOrder: 2,
      options: {
        create: [
          { name: 'Curry', priceDeltaCents: 10, sortOrder: 1 },
          { name: 'Röstzwiebeln', priceDeltaCents: 30, sortOrder: 2 },
        ],
      },
    },
  })

  // Products — Kaffee
  const kaffeeProducts = [
    { name: 'Kaffee', shortName: null, priceCents: 200, taxRateBps: 2000, sortOrder: 1, color: 'amber-500' },
    { name: 'Cappuccino', shortName: 'Cappu', priceCents: 250, taxRateBps: 2000, sortOrder: 2, color: 'orange-500' },
    { name: 'Kuchen', shortName: null, priceCents: 250, taxRateBps: 1000, sortOrder: 3, color: 'pink-500' },
    { name: 'Tee', shortName: null, priceCents: 200, taxRateBps: 2000, sortOrder: 4, color: 'teal-500' },
  ]
  for (const p of kaffeeProducts) {
    await prisma.product.create({ data: { ...p, stationId: kaffee.id } })
  }
  console.log(`  ✓ Products: ${barProducts.length + kuecheProducts.length + kaffeeProducts.length} across 3 stations`)

  // Waiters
  const alice = await prisma.waiter.create({
    data: {
      name: 'Alice',
      pin: '1234',
      eventId: event.id,
      canCancel: true,
      canCashOut: true,
    },
  })
  const bob = await prisma.waiter.create({
    data: {
      name: 'Bob',
      pin: '5678',
      eventId: event.id,
      canStatistics: true,
      isStationWaiter: true,
    },
  })
  console.log(`  ✓ Waiters: Alice (1234), Bob (5678)`)

  // AppLayouts
  await prisma.appLayout.create({
    data: {
      eventId: event.id,
      waiterId: alice.id,
      columns: 3,
      rows: 5,
      buttons: JSON.stringify([
        { name: 'Bier', color: 'amber', productId: barProducts[0].shortName, row: 0, col: 0 },
        { name: 'Radler', color: 'amber', productId: barProducts[1].shortName, row: 0, col: 1 },
        { name: 'Cola', color: 'gray', productId: barProducts[4].shortName, row: 0, col: 2 },
      ]),
    },
  })
  await prisma.appLayout.create({
    data: {
      eventId: event.id,
      waiterId: bob.id,
      columns: 3,
      rows: 5,
      buttons: JSON.stringify([
        { name: 'Schnitzel', color: 'red', productId: kuecheProducts[0].shortName, row: 0, col: 0 },
        { name: 'Bratwurst', color: 'red', productId: kuecheProducts[1].shortName, row: 0, col: 1 },
        { name: 'Pommes', color: 'yellow', productId: kuecheProducts[2].shortName, row: 0, col: 2 },
      ]),
    },
  })
  console.log(`  ✓ AppLayouts: 2 (one per waiter)`)

  console.log(`\n✅ Seed complete! Event: ${event.name} (${event.id})`)
  console.log(`   Login as Alice (PIN 1234) or Bob (PIN 5678)`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
