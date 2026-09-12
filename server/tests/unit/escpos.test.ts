import { describe, it, expect } from 'vitest'
import { formatReceipt, formatTestPage, wrapText, type ReceiptData, type PrinterConfig } from '@/printer/escpos'

const defaultConfig: PrinterConfig = {
  charsPerLine: 42,
  font: 'A',
  paperCut: 'partial',
}

const defaultReceipt: ReceiptData = {
  stationName: 'Bar',
  tableNumber: '12',
  pickupCode: null,
  tearOffNumber: 5,
  items: [
    { name: 'Bier Helles', quantity: 2, priceCents: 300 },
    { name: 'Cola', quantity: 1, priceCents: 250 },
  ],
  totalCents: 850,
  isTestMode: false,
  hidePrices: false,
}

describe('wrapText', () => {
  it('returns single line when within limit', () => {
    expect(wrapText('short text', 42)).toEqual(['short text'])
  })

  it('wraps at word boundary', () => {
    const result = wrapText('Schnitzel mit Pommes und Salat', 20)
    expect(result.length).toBeGreaterThan(1)
    result.forEach((line) => expect(line.length).toBeLessThanOrEqual(20))
  })

  it('hard-breaks words longer than line width', () => {
    const result = wrapText('VeryLongProductNameThatExceedsLine', 10)
    result.forEach((line) => expect(line.length).toBeLessThanOrEqual(10))
  })
})

describe('formatReceipt', () => {
  it('contains station name as header', () => {
    const buf = formatReceipt(defaultReceipt, defaultConfig)
    const str = buf.toString('latin1')
    expect(str).toContain('Bar')
  })

  it('contains table number', () => {
    const buf = formatReceipt(defaultReceipt, defaultConfig)
    const str = buf.toString('latin1')
    expect(str).toContain('Tisch: 12')
  })

  it('contains tear-off number', () => {
    const buf = formatReceipt(defaultReceipt, defaultConfig)
    const str = buf.toString('latin1')
    expect(str).toContain('Bon-Nr: 5')
  })

  it('contains item names with quantities', () => {
    const buf = formatReceipt(defaultReceipt, defaultConfig)
    const str = buf.toString('latin1')
    expect(str).toContain('2× Bier Helles')
    expect(str).toContain('1× Cola')
  })

  it('contains total when hidePrices is false', () => {
    const buf = formatReceipt(defaultReceipt, defaultConfig)
    const str = buf.toString('latin1')
    expect(str).toContain('Summe:')
    expect(str).toContain('8,50') // 850 cents = €8.50 in de-DE
  })

  it('hides total when hidePrices is true', () => {
    const buf = formatReceipt({ ...defaultReceipt, hidePrices: true }, defaultConfig)
    const str = buf.toString('latin1')
    expect(str).not.toContain('Summe:')
  })

  it('shows TEST watermark in test mode', () => {
    const buf = formatReceipt({ ...defaultReceipt, isTestMode: true }, defaultConfig)
    const str = buf.toString('latin1')
    expect(str).toContain('T E S T')
  })

  it('omits TEST watermark in live mode', () => {
    const buf = formatReceipt({ ...defaultReceipt, isTestMode: false }, defaultConfig)
    const str = buf.toString('latin1')
    expect(str).not.toContain('T E S T')
  })

  it('uses pickup code when tableNumber is null', () => {
    const buf = formatReceipt({ ...defaultReceipt, tableNumber: null, pickupCode: 'A' }, defaultConfig)
    const str = buf.toString('latin1')
    expect(str).toContain('Abholcode: A')
    expect(str).not.toContain('Tisch:')
  })

  it('includes item comments', () => {
    const buf = formatReceipt({
      ...defaultReceipt,
      items: [{ name: 'Bier', quantity: 1, comment: 'ohne Schaum' }],
    }, defaultConfig)
    const str = buf.toString('latin1')
    expect(str).toContain('ohne Schaum')
  })

  it('wraps long product names at charsPerLine', () => {
    const longName = 'Schnitzel Wiener Art mit Pommes Frites und Krautsalat'
    const buf = formatReceipt({
      ...defaultReceipt,
      items: [{ name: longName, quantity: 1 }],
    }, { ...defaultConfig, charsPerLine: 20 })
    const str = buf.toString('latin1')
    // Every line should be within 20 chars (except ESC/POS control chars)
    const lines = str.split('\n').filter((l) => l.length > 0 && !l.includes('Tisch') && !l.includes('Bar') && !l.includes('TEST') && !l.includes('Bon') && !l.includes('Summe') && !l.includes('─'))
    lines.forEach((line) => {
      // Remove control characters for length check
      const clean = line.replace(/[^\x20-\x7e]/g, '')
      // The wrap function should keep lines ≤ 20
      expect(clean.length).toBeLessThanOrEqual(21) // +1 for tolerance with qty prefix
    })
  })

  it('includes paper cut command at the end', () => {
    const buf = formatReceipt(defaultReceipt, { ...defaultConfig, paperCut: 'full' })
    // GS V 0 = full cut
    const last3 = buf.subarray(buf.length - 3)
    expect(last3[0]).toBe(0x1d) // GS
    expect(last3[1]).toBe(0x56) // V
    expect(last3[2]).toBe(0x00) // 0 = full cut
  })

  it('includes partial cut command', () => {
    const buf = formatReceipt(defaultReceipt, { ...defaultConfig, paperCut: 'partial' })
    const last3 = buf.subarray(buf.length - 3)
    expect(last3[0]).toBe(0x1d)
    expect(last3[1]).toBe(0x56)
    expect(last3[2]).toBe(0x01) // 1 = partial cut
  })

  it('omits cut command when paperCut is none', () => {
    const buf = formatReceipt(defaultReceipt, { ...defaultConfig, paperCut: 'none' })
    // Last bytes should NOT be a cut command
    if (buf.length >= 3) {
      const last3 = buf.subarray(buf.length - 3)
      // Should not match GS V pattern
      expect(!(last3[0] === 0x1d && last3[1] === 0x56)).toBe(true)
    }
  })
})

describe('formatReceipt — counter (Theke) orders', () => {
  const counterReceipt: ReceiptData = {
    stationName: 'Bar',
    tableNumber: null,
    pickupCode: null,
    tearOffNumber: 7,
    items: [{ name: 'Bier Helles', quantity: 2, priceCents: 300 }],
    totalCents: 600,
    isTestMode: false,
    hidePrices: false,
  }

  it('prints the Bon as the identifier instead of a table', () => {
    const str = formatReceipt(counterReceipt, defaultConfig).toString('latin1')
    expect(str).toContain('Bon: 7')
    expect(str).not.toContain('Tisch:')
    expect(str).not.toContain('Abholcode')
  })

  it('does not repeat the Bon in a second Bon-Nr line', () => {
    const str = formatReceipt(counterReceipt, defaultConfig).toString('latin1')
    expect(str).not.toContain('Bon-Nr:')
  })

  it('leaves waiter receipts with Tisch + Bon-Nr', () => {
    const str = formatReceipt(defaultReceipt, defaultConfig).toString('latin1')
    expect(str).toContain('Tisch: 12')
    expect(str).toContain('Bon-Nr: 5')
  })

  it('leaves pickup receipts with Abholcode + Bon-Nr', () => {
    const str = formatReceipt(
      { ...defaultReceipt, tableNumber: null, pickupCode: 'A7' },
      defaultConfig,
    ).toString('latin1')
    expect(str).toContain('Abholcode: A7')
    expect(str).toContain('Bon-Nr: 5')
  })
})

describe('formatTestPage', () => {
  it('contains printer name', () => {
    const buf = formatTestPage('Bar Drucker', defaultConfig)
    const str = buf.toString('latin1')
    expect(str).toContain('Bar Drucker')
  })

  it('contains chars per line ruler', () => {
    const buf = formatTestPage('Test', { ...defaultConfig, charsPerLine: 42 })
    const str = buf.toString('latin1')
    expect(str).toContain('0123456789')
  })

  it('contains font info', () => {
    const buf = formatTestPage('Test', { ...defaultConfig, font: 'B' })
    const str = buf.toString('latin1')
    expect(str).toContain('Font: B')
  })
})
