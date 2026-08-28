import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CashierView from '@/components/CashierView'

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

// Mock session store — logged in with event + token (CashierView reads event/waiter/token)
vi.mock('@/stores/session', () => ({
  useSessionStore: () => ({
    event: { id: 'evt-1', name: 'Testfest', status: 'test' as const, hidePrices: false, tseEnabled: false, lastTearOffNumber: 0, createdAt: '', updatedAt: '' },
    waiter: {
      id: 'w-1', name: 'Alice', logo: null, eventId: 'evt-1', printerId: null, pickupCode: null,
      printsImmediately: true, canCancel: false, canCashOut: false, canStatistics: false,
      canCreateWaiters: false, canTransfer: false, isStationWaiter: false, hidden: false, autoSammelbon: false, active: true,
    },
    token: 'token-1',
    adminToken: null,
    setEvent: vi.fn(), setWaiter: vi.fn(), setToken: vi.fn(), setAdminToken: vi.fn(),
    setSession: vi.fn(), clear: vi.fn(),
    isLoggedIn: () => true,
    isAdminLoggedIn: () => false,
  }),
}))

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
      expect(screen.getByText('2× Bier')).toBeDefined()
    })
    expect(screen.getByText('1× Cola')).toBeDefined()
    // unpaid items show their per-line price in de-DE format
    expect(screen.getByText('6,00 €')).toBeDefined()
    expect(screen.getByText('2,50 €')).toBeDefined()
  })

  it('shows open tables across the event when the table selector is opened', async () => {
    mockGetOpenTables.mockResolvedValue(openTables)
    renderCashier()

    await waitFor(() => {
      expect(screen.getByText('2× Bier')).toBeDefined()
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
      expect(screen.getByText('2× Bier')).toBeDefined()
    })

    // Initially only the item price is shown (sum is 0,00 €)
    expect(screen.getAllByText('6,00 €')).toHaveLength(1)

    // Select Bier → sum becomes 600 ¢ → total now also shows 6,00 €
    fireEvent.click(screen.getByText('2× Bier'))
    expect(screen.getAllByText('6,00 €')).toHaveLength(2)

    // Select Cola too → sum becomes 850 ¢ → 8,50 €
    fireEvent.click(screen.getByText('1× Cola'))
    expect(screen.getByText('8,50 €')).toBeDefined()
    expect(screen.getAllByText('6,00 €')).toHaveLength(1)
  })

  it('collecting payment calls api.payItems with the selected item ids and clears selection', async () => {
    renderCashier()

    await waitFor(() => {
      expect(screen.getByText('2× Bier')).toBeDefined()
    })

    fireEvent.click(screen.getByText('2× Bier'))

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

  it('keeps the selection when payItems rejects (e.g. concurrent double-payment 409)', async () => {
    mockPayItems.mockRejectedValueOnce(new Error('conflict'))
    renderCashier()

    await waitFor(() => {
      expect(screen.getByText('2× Bier')).toBeDefined()
    })

    fireEvent.click(screen.getByText('2× Bier'))
    fireEvent.click(screen.getByText('cashier.pay'))

    // Selection is preserved: sum stays at 6,00 € and the pay button is enabled again
    await waitFor(() => {
      expect((screen.getByText('cashier.pay') as HTMLButtonElement).disabled).toBe(false)
    })
    expect(screen.getAllByText('6,00 €')).toHaveLength(2)
    expect(screen.queryByText('0,00 €')).toBeNull()
  })
})