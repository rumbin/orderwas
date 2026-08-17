import { prisma } from '@/db/client'
import { formatReceipt, type ReceiptData, type PrinterConfig, type ReceiptItem } from '@/printer/escpos'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import * as net from 'net'

interface OrderForPrint {
  id: string
  eventId: string
  tableNumber: string | null
  pickupCode: string | null
  tearOffNumber: number | null
  status: string
  totalCents: number
  items: Array<{
    id: string
    productId: string
    productName: string
    stationId: string
    quantity: number
    status: string
    comment: string | null
    priceCents: number
    options: string | null
  }>
}

interface PrintJob {
  stationName: string
  printerType: string
  printerIp: string | null
  printerName: string
  config: PrinterConfig
  buffer: Buffer
}

const DUMMY_PRINT_DIR = resolve(process.cwd(), 'tmp', 'printer-logs')

/**
 * Dispatch print jobs for a newly created order.
 * Groups items by station, resolves each station's printer, formats receipt,
 * and sends. Print failure never throws — errors are logged.
 *
 * This function is fire-and-forget: called after order commit, not awaited.
 */
export async function dispatchOrderPrints(order: OrderForPrint): Promise<void> {
  try {
    // Fetch event for test mode and hidePrices
    const event = await prisma.event.findUnique({
      where: { id: order.eventId },
      select: { status: true, hidePrices: true },
    })
    if (!event) return

    // Group items by station
    const byStation = new Map<string, typeof order.items>()
    for (const item of order.items) {
      const existing = byStation.get(item.stationId) ?? []
      existing.push(item)
      byStation.set(item.stationId, existing)
    }

    // For each station, resolve printer and dispatch
    const jobs: PrintJob[] = []
    for (const [stationId, items] of byStation) {
      const station = await prisma.station.findUnique({
        where: { id: stationId },
        include: { printer: true },
      })
      if (!station || !station.printer) continue

      const printer = station.printer
      if (printer.type === 'ignore') continue

      const config: PrinterConfig = {
        charsPerLine: printer.charsPerLine,
        font: printer.font,
        paperCut: printer.paperCut as 'full' | 'partial' | 'none',
      }

      const receiptItems: ReceiptItem[] = items.map((item) => ({
        name: item.productName,
        quantity: item.quantity,
        priceCents: item.priceCents,
        comment: item.comment,
        options: item.options ? (JSON.parse(item.options) as ReceiptItem['options']) : null,
      }))

      const receiptData: ReceiptData = {
        stationName: station.name,
        tableNumber: order.tableNumber,
        pickupCode: order.pickupCode,
        tearOffNumber: order.tearOffNumber,
        items: receiptItems,
        totalCents: order.totalCents,
        isTestMode: event.status === 'test',
        hidePrices: event.hidePrices,
      }

      const buffer = formatReceipt(receiptData, config)

      jobs.push({
        stationName: station.name,
        printerType: printer.type,
        printerIp: printer.ip,
        printerName: printer.name,
        config,
        buffer,
      })
    }

    // Execute print jobs (parallel, but each is isolated)
    await Promise.allSettled(jobs.map((job) => executePrintJob(job)))
  } catch (err) {
    // Never throw — print failures must not affect order creation
    console.error('[printer] dispatch error:', err)
  }
}

async function executePrintJob(job: PrintJob): Promise<void> {
  if (job.printerType === 'dummy') {
    // Log to file
    mkdirSync(DUMMY_PRINT_DIR, { recursive: true })
    const filename = `${Date.now()}-${job.stationName}.bin`
    const filepath = resolve(DUMMY_PRINT_DIR, filename)
    writeFileSync(filepath, job.buffer)
    console.log(`[printer] dummy job logged: ${filepath} (${job.buffer.length} bytes)`)
    return
  }

  if (job.printerType === 'network') {
    if (!job.printerIp) {
      console.error(`[printer] network printer ${job.printerName} has no IP`)
      return
    }
    await sendToNetworkPrinter(job.printerIp, 9100, job.buffer)
    return
  }
}

function sendToNetworkPrinter(ip: string, port: number, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    const timeout = 5000

    socket.setTimeout(timeout)
    socket.on('error', (err: Error) => {
      socket.destroy()
      console.error(`[printer] network error ${ip}:${port}:`, err.message)
      resolve() // swallow — don't reject, order still succeeds
    })
    socket.on('timeout', () => {
      socket.destroy()
      console.error(`[printer] network timeout ${ip}:${port}`)
      resolve()
    })
    socket.on('connect', () => {
      socket.write(buffer, () => {
        socket.end()
        resolve()
      })
    })
    socket.connect(port, ip)
  })
}
