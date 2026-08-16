import { prisma } from '@/db/client'

/**
 * Exports an event's configuration as JSON (stations, products, waiters sans pins, printers, layouts).
 * Does NOT export orders, orderItems, or vouchers.
 */
export async function exportEvent(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      stations: { include: { products: true, altPrinters: true }, orderBy: { sortOrder: 'asc' } },
      waiters: { select: { id: true, name: true, logo: true, pickupCode: true, printsImmediately: true, canCancel: true, canCashOut: true, canStatistics: true, canCreateWaiters: true, canTransfer: true, isStationWaiter: true, hidden: true, autoSammelbon: true, active: true } },
      printers: true,
    },
  })
  if (!event) return null

  const layouts = await prisma.appLayout.findMany({ where: { eventId } })

  return {
    schemaVersion: 1,
    event: {
      name: event.name,
      status: event.status,
      hidePrices: event.hidePrices,
      tseEnabled: event.tseEnabled,
    },
    stations: event.stations.map((s) => ({
      name: s.name,
      logo: s.logo,
      kitchenMonitor: s.kitchenMonitor,
      sortOrder: s.sortOrder,
      copyPrint: s.copyPrint,
      printerName: s.printerId ? event.printers.find((p) => p.id === s.printerId)?.name ?? null : null,
      products: s.products.map((p) => ({
        name: p.name,
        shortName: p.shortName,
        priceCents: p.priceCents,
        taxRateBps: p.taxRateBps,
        available: p.available,
        isVoucher: p.isVoucher,
        addable: p.addable,
        stockMode: p.stockMode,
        stockCount: p.stockCount,
        sortOrder: p.sortOrder,
      })),
    })),
    waiters: event.waiters.map((w) => ({
      name: w.name,
      logo: w.logo,
      pickupCode: w.pickupCode,
      printsImmediately: w.printsImmediately,
      canCancel: w.canCancel,
      canCashOut: w.canCashOut,
      canStatistics: w.canStatistics,
      canCreateWaiters: w.canCreateWaiters,
      canTransfer: w.canTransfer,
      isStationWaiter: w.isStationWaiter,
      hidden: w.hidden,
      autoSammelbon: w.autoSammelbon,
      active: w.active,
    })),
    printers: event.printers.map((p) => ({
      name: p.name,
      type: p.type,
      ip: p.ip,
      charsPerLine: p.charsPerLine,
      font: p.font,
      buzzer: p.buzzer,
      paperCut: p.paperCut,
    })),
    layouts: layouts.map((l) => ({
      columns: l.columns,
      rows: l.rows,
      buttons: l.buttons,
    })),
  }
}

export interface ImportData {
  schemaVersion?: number
  event: { name: string; status?: string; hidePrices?: boolean; tseEnabled?: boolean }
  stations: Array<{
    name: string
    logo?: string | null
    kitchenMonitor?: boolean
    sortOrder?: number
    copyPrint?: boolean
    printerName?: string | null
    products: Array<{
      name: string
      shortName?: string | null
      priceCents: number
      taxRateBps?: number
      available?: boolean
      isVoucher?: boolean
      addable?: boolean
      stockMode?: string
      stockCount?: number
      sortOrder?: number
    }>
  }>
  waiters: Array<{
    name: string
    pin?: string
    logo?: string | null
    pickupCode?: string | null
    printsImmediately?: boolean
    canCancel?: boolean
    canCashOut?: boolean
    canStatistics?: boolean
    canCreateWaiters?: boolean
    canTransfer?: boolean
    isStationWaiter?: boolean
    hidden?: boolean
    autoSammelbon?: boolean
    active?: boolean
  }>
  printers?: Array<{
    name: string
    type: string
    ip?: string | null
    charsPerLine?: number
    font?: string
    buzzer?: boolean
    paperCut?: string
  }>
  layouts?: Array<{
    columns: number
    rows: number
    buttons: string
  }>
}

/**
 * Imports an event from JSON. Creates a new event with all configuration.
 * Waiters get a default PIN '0000' if not provided (must be changed after import).
 */
export async function importEvent(data: ImportData) {
  return prisma.$transaction(async (tx) => {
    // Create event
    const event = await tx.event.create({
      data: {
        name: data.event.name,
        status: data.event.status ?? 'test',
        hidePrices: data.event.hidePrices ?? false,
        tseEnabled: data.event.tseEnabled ?? false,
      },
    })

    // Create printers
    const printerMap = new Map<string, string>() // name → id
    if (data.printers) {
      for (const p of data.printers) {
        const printer = await tx.printer.create({
          data: {
            eventId: event.id,
            name: p.name,
            type: p.type,
            ip: p.ip ?? null,
            charsPerLine: p.charsPerLine ?? 42,
            font: p.font ?? 'A',
            buzzer: p.buzzer ?? false,
            paperCut: p.paperCut ?? 'partial',
          },
        })
        printerMap.set(p.name, printer.id)
      }
    }

    // Create stations + products
    for (const s of data.stations) {
      const station = await tx.station.create({
        data: {
          eventId: event.id,
          name: s.name,
          logo: s.logo ?? null,
          kitchenMonitor: s.kitchenMonitor ?? false,
          sortOrder: s.sortOrder ?? 0,
          copyPrint: s.copyPrint ?? false,
          printerId: s.printerName ? printerMap.get(s.printerName) ?? null : null,
        },
      })

      for (const p of s.products) {
        await tx.product.create({
          data: {
            stationId: station.id,
            name: p.name,
            shortName: p.shortName ?? null,
            priceCents: p.priceCents,
            taxRateBps: p.taxRateBps ?? 2000,
            available: p.available ?? true,
            isVoucher: p.isVoucher ?? false,
            addable: p.addable ?? true,
            stockMode: p.stockMode ?? 'none',
            stockCount: p.stockCount ?? 0,
            sortOrder: p.sortOrder ?? 0,
          },
        })
      }
    }

    // Create waiters
    for (const w of data.waiters) {
      await tx.waiter.create({
        data: {
          eventId: event.id,
          name: w.name,
          pin: w.pin ?? '0000',
          logo: w.logo ?? null,
          pickupCode: w.pickupCode ?? null,
          printsImmediately: w.printsImmediately ?? true,
          canCancel: w.canCancel ?? false,
          canCashOut: w.canCashOut ?? false,
          canStatistics: w.canStatistics ?? false,
          canCreateWaiters: w.canCreateWaiters ?? false,
          canTransfer: w.canTransfer ?? false,
          isStationWaiter: w.isStationWaiter ?? false,
          hidden: w.hidden ?? false,
          autoSammelbon: w.autoSammelbon ?? false,
          active: w.active ?? true,
        },
      })
    }

    // Create layouts
    if (data.layouts) {
      for (const l of data.layouts) {
        await tx.appLayout.create({
          data: {
            eventId: event.id,
            columns: l.columns,
            rows: l.rows,
            buttons: l.buttons,
          },
        })
      }
    }

    return event
  })
}
