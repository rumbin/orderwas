/**
 * ESC/POS receipt formatting.
 * Generates raw ESC/POS byte buffers for thermal printers.
 * Pure functions — no I/O, no printer connection.
 */

export interface ReceiptItem {
  name: string
  quantity: number
  priceCents?: number
  comment?: string | null
}

export interface ReceiptData {
  stationName: string
  tableNumber: string | null
  pickupCode: string | null
  tearOffNumber: number | null
  items: ReceiptItem[]
  totalCents?: number
  isTestMode: boolean
  hidePrices: boolean
}

export interface PrinterConfig {
  charsPerLine: number
  font: string // 'A' or 'B'
  paperCut: 'full' | 'partial' | 'none'
}

// ESC/POS commands
const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

// Initialize printer
const INIT = Buffer.from([ESC, 0x40])
// Bold on/off
const BOLD_ON = Buffer.from([ESC, 0x45, 0x01])
const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00])
// Double width/height on/off
const DOUBLE_ON = Buffer.from([GS, 0x21, 0x11])
const DOUBLE_OFF = Buffer.from([GS, 0x21, 0x00])
// Center align
const CENTER = Buffer.from([ESC, 0x61, 0x01])
// Left align
const LEFT = Buffer.from([ESC, 0x61, 0x00])
// Paper cut
const CUT_PARTIAL = Buffer.from([GS, 0x56, 0x01])
const CUT_FULL = Buffer.from([GS, 0x56, 0x00])

function text(str: string): Buffer {
  return Buffer.from(str, 'latin1')
}

function lf(n = 1): Buffer {
  return Buffer.from(Array(n).fill(LF))
}

/**
 * Wraps text to fit within charsPerLine, breaking at word boundaries.
 */
export function wrapText(str: string, charsPerLine: number): string[] {
  if (str.length <= charsPerLine) return [str]
  const words = str.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (current.length + word.length + 1 > charsPerLine) {
      if (current) lines.push(current)
      // If single word is longer than line, hard-break it
      if (word.length > charsPerLine) {
        for (let i = 0; i < word.length; i += charsPerLine) {
          lines.push(word.slice(i, i + charsPerLine))
        }
        current = ''
      } else {
        current = word
      }
    } else {
      current = current ? current + ' ' + word : word
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * Pads an item line: "2× Schnitzel mit Pommes" + right-aligned price.
 */
function formatItemLine(name: string, quantity: number, priceCents: number | undefined, hidePrices: boolean, charsPerLine: number): string[] {
  const qtyPrefix = `${quantity}× `
  const fullLine = `${qtyPrefix}${name}`
  const lines = wrapText(fullLine, charsPerLine)
  return lines
}

/**
 * Formats a receipt as an ESC/POS buffer.
 */
export function formatReceipt(data: ReceiptData, config: PrinterConfig): Buffer {
  const { charsPerLine } = config
  const parts: Buffer[] = []

  // Init
  parts.push(INIT)

  // Station name (centered, bold, double size)
  parts.push(CENTER)
  parts.push(BOLD_ON)
  parts.push(DOUBLE_ON)
  parts.push(text(data.stationName))
  parts.push(DOUBLE_OFF)
  parts.push(BOLD_OFF)
  parts.push(lf(2))

  // TEST watermark
  if (data.isTestMode) {
    parts.push(BOLD_ON)
    parts.push(text('* * * T E S T * * *'))
    parts.push(BOLD_OFF)
    parts.push(lf())
  }

  // Table / pickup code + tear-off number
  parts.push(LEFT)
  const identifier = data.tableNumber
    ? `Tisch: ${data.tableNumber}`
    : `Abholcode: ${data.pickupCode}`
  parts.push(text(identifier))
  if (data.tearOffNumber !== null) {
    parts.push(text(`   Bon-Nr: ${data.tearOffNumber}`))
  }
  parts.push(lf(2))

  // Separator line
  parts.push(text('─'.repeat(charsPerLine)))
  parts.push(lf())

  // Items
  for (const item of data.items) {
    const itemLines = formatItemLine(item.name, item.quantity, item.priceCents, data.hidePrices, charsPerLine)
    for (const line of itemLines) {
      parts.push(text(line))
      parts.push(lf())
    }
    if (item.comment) {
      parts.push(text(`  » ${item.comment}`))
      parts.push(lf())
    }
  }

  // Separator
  parts.push(text('─'.repeat(charsPerLine)))
  parts.push(lf())

  // Total (unless hidePrices)
  if (!data.hidePrices && data.totalCents !== undefined) {
    parts.push(BOLD_ON)
    const totalStr = formatCents(data.totalCents)
    const label = 'Summe:'
    const padding = Math.max(1, charsPerLine - label.length - totalStr.length)
    parts.push(text(label + ' '.repeat(padding) + totalStr))
    parts.push(BOLD_OFF)
    parts.push(lf(2))
  }

  // Paper cut
  if (config.paperCut === 'full') {
    parts.push(CUT_FULL)
  } else if (config.paperCut === 'partial') {
    parts.push(CUT_PARTIAL)
  }

  return Buffer.concat(parts)
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

/**
 * Formats a test page for printer verification.
 */
export function formatTestPage(printerName: string, config: PrinterConfig): Buffer {
  const { charsPerLine } = config
  const parts: Buffer[] = []

  parts.push(INIT)
  parts.push(CENTER)
  parts.push(BOLD_ON)
  parts.push(DOUBLE_ON)
  parts.push(text('TESTDRUCK'))
  parts.push(DOUBLE_OFF)
  parts.push(BOLD_OFF)
  parts.push(lf(2))

  parts.push(LEFT)
  parts.push(text(`Drucker: ${printerName}`))
  parts.push(lf())
  parts.push(text(`Font: ${config.font}`))
  parts.push(lf())
  parts.push(text(`Zeichen/Zeile: ${charsPerLine}`))
  parts.push(lf(2))

  // Ruler showing character width
  parts.push(text('0123456789'.repeat(Math.ceil(charsPerLine / 10)).slice(0, charsPerLine)))
  parts.push(lf(2))

  if (config.paperCut === 'full') {
    parts.push(CUT_FULL)
  } else if (config.paperCut === 'partial') {
    parts.push(CUT_PARTIAL)
  }

  return Buffer.concat(parts)
}
