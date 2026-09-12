import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CashierView from '@/components/CashierView'
import { resetSessionState } from './helpers/session'

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Mock api object
const mockGetUnpaidByTable = vi.hoisted(() => vi.fn())
const mockGetOpenTables = vi.hoisted(() => vi.fn())
const mockGetOrders = vi.hoisted(() => vi.fn())
const mockPayItems = vi.hoisted(() => vi.fn())

vi.mock('@/api/client', () => ({
  api: {
    getUnpaidByTable: mockGetUnpaidByTable,
    getOpenTables: mockGetOpenTables,
    getOrders: mockGetOrders,
    payItems: mockPayItems,
  },
}))

// Mock session store — logged in with event + token (CashierView reads event/waiter/token).
// Identity-stable (see tests/helpers/session.ts).
vi.mock('@/stores/session', async () => {
  const { useSessionStoreMock } = await import('./helpers/session')
  return { useSessionStore: useSessionStoreMock }
})

// Two unpaid items for table 5: 2× Bier (600) + 1× Cola (250) = 850
const unpaidOrders = [
  {
    orderId: 'o-1',
    tearOffNumber: 100,
    waiterName: 'Alice',
    createdAt: '2026-08-29T12:00:00Z',
    items: [
      { id: 'it-1', productName: 'Bier', quantity: 2, status: 'open', comment: null, options: null, lineTotalCents: 600, paidAt: null },
      { id: 'it-2', productName: 'Cola', quantity: 1, status: 'open', comment: null, options: null, lineTotalCents: 250, paidAt: null },
    ],
  },
]

const openTables = [
  { tableNumber: '2', openSumCents: 1200, orderCount: 3 },
  { tableNumber: '5', openSumCents: 850, orderCount: 1 },
]

beforeEach(() => {
  resetSessionState()
  mockGetUnpaidByTable.mockReset()
  mockGetOpenTables.mockReset()
  mockGetOrders.mockReset()
  mockPayItems.mockReset()
  mockGetUnpaidByTable.mockResolvedValue(unpaidOrders)
  mockGetOpenTables.mockResolvedValue([])
  mockGetOrders.mockResolvedValue([])
  mockPayItems.mockResolvedValue({ paidCount: 2, sumCents: 600, updatedOrders: [] })
})

const renderCashier = (initialTable = '5') => render(<CashierView initialTable={initialTable} />)

describe('CashierView', () => {
  it('lists the unpaid items for the current table', async () => {
    renderCashier()

    await waitFor(() => {
      expect(screen.getByText('Bier')).toBeDefined()
    })
    expect(screen.getByText('Cola')).toBeDefined()
    // unpaid items show their per-line price in de-DE format
    expect(screen.getByText('6,00 €')).toBeDefined()
    expect(screen.getByText('2,50 €')).toBeDefined()
  })

  it('shows open tables across the event when the table selector is opened', async () => {
    mockGetOpenTables.mockResolvedValue(openTables)
    renderCashier()

    await waitFor(() => {
      expect(screen.getByText('Bier')).toBeDefined()
    })

    // Header shows current table; clicking it opens the table switcher modal
    expect(screen.getByText('Tisch 5')).toBeDefined()
    fireEvent.click(screen.getByText('Tisch 5'))

    await waitFor(() => {
      expect(screen.getByText('cashier.tables')).toBeDefined()
    })
    expect(screen.getByText('Tisch 2')).toBeDefined()
    expect(screen.getByText('3 cashier.unpaidItems')).toBeDefined()
    expect(screen.getByText('12,00 €')).toBeDefined()
    // current table appears in both header and modal
    expect(screen.getAllByText('Tisch 5')).toHaveLength(2)
  })

  it('selecting items accumulates an integer-cents de-DE sum', async () => {
    renderCashier()

    await waitFor(() => {
      expect(screen.getByText('Bier')).toBeDefined()
    })

    // Initially only the item price is shown (sum is 0,00 €)
    expect(screen.getAllByText('6,00 €')).toHaveLength(1)

    // Select Bier → sum becomes 600 ¢ → total now also shows 6,00 €
    fireEvent.click(screen.getByText('Bier'))
    expect(screen.getAllByText('6,00 €')).toHaveLength(2)

    // Select Cola too → sum becomes 850 ¢ → 8,50 €
    fireEvent.click(screen.getByText('Cola'))
    expect(screen.getByText('8,50 €')).toBeDefined()
    expect(screen.getAllByText('6,00 €')).toHaveLength(1)
  })

  it('collecting payment calls api.payItems with the selected item ids and clears selection', async () => {
    renderCashier()

    await waitFor(() => {
      expect(screen.getByText('Bier')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Bier'))

    const paySubmit = screen.getByText('cashier.pay')
    fireEvent.click(paySubmit)

    await waitFor(() => {
      expect(mockPayItems).toHaveBeenCalledWith(['it-1'])
    })

    // Success toast shows paid count + sum
    await waitFor(() => {
      expect(screen.getByText(/cashier.paymentSuccess/)).toBeDefined()
    })

    // Selection cleared after payment → sum back to 0,00 €
    await waitFor(() => {
      expect(screen.getByText('0,00 €')).toBeDefined()
    })
  })

  it('keeps the selection AND surfaces an error when payItems rejects (e.g. concurrent 409)', async () => {
    mockPayItems.mockRejectedValueOnce(new Error('conflict'))
    renderCashier()

    await waitFor(() => {
      expect(screen.getByText('Bier')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Bier'))
    fireEvent.click(screen.getByText('cashier.pay'))

    // Error message is shown to the cashier (not silent)
    await waitFor(() => {
      expect(screen.getByText(/cashier.payFailed/)).toBeDefined()
    })

    // Selection is preserved: sum stays at 6,00 € and the pay button is enabled again
    expect(screen.getAllByText('6,00 €')).toHaveLength(2)
    expect((screen.getByText('cashier.pay') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText('0,00 €')).toBeNull()
  })

  describe('order grouping and item flattening (regression)', () => {
    it('groups items by order with order ID and waiter name', async () => {
      // Two orders for the same table
      mockGetUnpaidByTable.mockResolvedValue([
        {
          orderId: 'o-101',
          tearOffNumber: 101,
          waiterName: 'Alice',
          createdAt: '2026-08-29T12:00:00Z',
          items: [
            { id: 'it-10', productName: 'Bier', quantity: 1, status: 'open', comment: null, options: null, lineTotalCents: 300, paidAt: null },
          ],
        },
        {
          orderId: 'o-102',
          tearOffNumber: 102,
          waiterName: 'Bob',
          createdAt: '2026-08-29T12:05:00Z',
          items: [
            { id: 'it-20', productName: 'Cola', quantity: 1, status: 'open', comment: null, options: null, lineTotalCents: 250, paidAt: null },
          ],
        },
      ])

      renderCashier()

      await waitFor(() => {
        expect(screen.getByText('Bier')).toBeDefined()
      })

      // Both order sections are visible with waiter names
      expect(screen.getByText(/Alice/)).toBeDefined()
      expect(screen.getByText(/Bob/)).toBeDefined()
      // Both items are visible
      expect(screen.getByText('Bier')).toBeDefined()
      expect(screen.getByText('Cola')).toBeDefined()
    })

    it('flattens items: each row is quantity 1, no quantity multiplier shown', async () => {
      // Single order with 2 items (each quantity=1 in flattened view)
      mockGetUnpaidByTable.mockResolvedValue([
        {
          orderId: 'o-201',
          tearOffNumber: 201,
          waiterName: 'Alice',
          createdAt: '2026-08-29T12:00:00Z',
          items: [
            { id: 'it-30', productName: 'Bier', quantity: 1, status: 'open', comment: null, options: null, lineTotalCents: 300, paidAt: null },
            { id: 'it-31', productName: 'Bier', quantity: 1, status: 'open', comment: null, options: null, lineTotalCents: 300, paidAt: null },
          ],
        },
      ])

      renderCashier()

      await waitFor(() => {
        expect(screen.getAllByText('Bier')).toHaveLength(2)
      })

      // Two separate rows for Bier (not aggregated as "2× Bier")
      const bierElements = screen.getAllByText('Bier')
      expect(bierElements).toHaveLength(2)
    })

    it('shows paid items with checkmark but still displays them', async () => {
      mockGetUnpaidByTable.mockResolvedValue([
        {
          orderId: 'o-301',
          tearOffNumber: 301,
          waiterName: 'Alice',
          createdAt: '2026-08-29T12:00:00Z',
          items: [
            { id: 'it-40', productName: 'Bier', quantity: 1, status: 'open', comment: null, options: null, lineTotalCents: 300, paidAt: null },
            { id: 'it-41', productName: 'Cola', quantity: 1, status: 'open', comment: null, options: null, lineTotalCents: 250, paidAt: '2026-08-29T12:01:00Z' },
          ],
        },
      ])

      renderCashier()

      await waitFor(() => {
        expect(screen.getByText('Bier')).toBeDefined()
      })

      // Both items visible
      expect(screen.getByText('Bier')).toBeDefined()
      expect(screen.getByText('Cola')).toBeDefined()
      // Paid item shows checkmark
      expect(screen.getByText(/cashier.itemPaid/)).toBeDefined()
    })

    it('hides order only when ALL items are paid', async () => {
      // First order: all items paid → should NOT appear
      // Second order: has unpaid items → should appear
      mockGetUnpaidByTable.mockResolvedValue([
        {
          orderId: 'o-401',
          tearOffNumber: 401,
          waiterName: 'Alice',
          createdAt: '2026-08-29T12:00:00Z',
          items: [
            { id: 'it-50', productName: 'Bier', quantity: 1, status: 'open', comment: null, options: null, lineTotalCents: 300, paidAt: '2026-08-29T12:01:00Z' },
            { id: 'it-51', productName: 'Cola', quantity: 1, status: 'open', comment: null, options: null, lineTotalCents: 250, paidAt: '2026-08-29T12:01:00Z' },
          ],
        },
        {
          orderId: 'o-402',
          tearOffNumber: 402,
          waiterName: 'Bob',
          createdAt: '2026-08-29T12:05:00Z',
          items: [
            { id: 'it-60', productName: 'Fanta', quantity: 1, status: 'open', comment: null, options: null, lineTotalCents: 250, paidAt: null },
          ],
        },
      ])

      renderCashier()

      await waitFor(() => {
        expect(screen.getByText('Fanta')).toBeDefined()
      })

      // First order (o-401) should NOT appear (all items paid)
      expect(screen.queryByText(/#401/)).toBeNull()
      // Second order (o-402) SHOULD appear
      expect(screen.getByText(/#402/)).toBeDefined()
      expect(screen.getByText('Fanta')).toBeDefined()
    })
  })
})