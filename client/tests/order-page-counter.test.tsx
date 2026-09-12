import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OrderPage from '@/pages/Order'
import { useCartStore } from '@/stores/cart'
import { makeCounterWaiter, makeEvent, resetSessionState } from './helpers/session'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Counter login, identity-stable store mock (see tests/helpers/session.ts).
vi.mock('@/stores/session', async () => {
  const { useSessionStoreMock } = await import('./helpers/session')
  return { useSessionStore: useSessionStoreMock }
})

const mockGetStations = vi.hoisted(() => vi.fn())
const mockGetProducts = vi.hoisted(() => vi.fn())
const mockCreateOrder = vi.hoisted(() => vi.fn())
const mockGetOrders = vi.hoisted(() => vi.fn())
const mockGetCounterUnpaid = vi.hoisted(() => vi.fn())
const mockGetEvent = vi.hoisted(() => vi.fn())

vi.mock('@/api/client', () => ({
  api: {
    getStations: mockGetStations,
    getProducts: mockGetProducts,
    createOrder: mockCreateOrder,
    getOrders: mockGetOrders,
    getCounterUnpaid: mockGetCounterUnpaid,
    getEvent: mockGetEvent,
    cancelOrder: vi.fn(),
    getUnpaidByTable: vi.fn(),
    getOpenTables: vi.fn().mockResolvedValue([]),
    payItems: vi.fn(),
    login: vi.fn(),
  },
}))

const stations = [
  { id: 'st-1', name: 'Bar', logo: null, printerId: null, kitchenMonitor: false, sortOrder: 0, copyPrint: false, eventId: 'evt-1' },
]
const barProducts = [
  { id: 'p-1', name: 'Bier', shortName: null, priceCents: 300, taxRateBps: 2000, stationId: 'st-1', available: true, isVoucher: false, addable: true, stockMode: 'none', stockCount: 0, sortOrder: 0, color: null },
]

const openBon = [
  { orderId: 'o-1', tearOffNumber: 5, waiterName: 'Theke', waiterIsCounter: true, createdAt: '2026-09-12T12:00:00Z', items: [] },
]

beforeEach(() => {
  useCartStore.getState().clear()
  resetSessionState({
    waiter: makeCounterWaiter(),
    event: makeEvent({ counterEnabled: true, lastTearOffNumber: 5 }),
  })
  mockGetStations.mockReset().mockResolvedValue(stations)
  mockGetProducts.mockReset().mockResolvedValue(barProducts)
  mockGetCounterUnpaid.mockReset().mockResolvedValue([])
  mockGetOrders.mockReset().mockResolvedValue([])
  mockGetEvent.mockReset().mockResolvedValue({
    id: 'evt-1', name: 'Testfest', status: 'test', hidePrices: false, tseEnabled: false,
    counterEnabled: true, lastTearOffNumber: 6, createdAt: '', updatedAt: '',
  })
  mockCreateOrder.mockReset()
})

describe('OrderPage in counter mode', () => {
  const navigate = vi.fn()

  it('pre-fills the Bon input with the next tear-off number', async () => {
    render(<OrderPage navigate={navigate} />)

    await waitFor(() => {
      expect((screen.getByTestId('bon-number-input') as HTMLInputElement).value).toBe('6')
    })
    // The counter never sees a table number field.
    expect(screen.queryByTestId('table-number-input')).toBeNull()
  })

  it('opens the cashier screen while a Bon is still unpaid', async () => {
    mockGetCounterUnpaid.mockResolvedValue(openBon)
    render(<OrderPage navigate={navigate} />)

    await waitFor(() => {
      expect(screen.getByTestId('counter-cashier-header')).toBeDefined()
    })
  })

  it('blocks new orders while the previous Bon is unpaid, with a cashier shortcut', async () => {
    mockGetCounterUnpaid.mockResolvedValue(openBon)
    render(<OrderPage navigate={navigate} />)

    await waitFor(() => {
      expect(screen.getByTestId('counter-cashier-header')).toBeDefined()
    })

    // Back to order taking: the blocking reason is shown and the shortcut
    // returns to the cashier screen.
    fireEvent.click(screen.getByText('order.tabNew'))
    await waitFor(() => {
      expect(screen.getByTestId('counter-blocked-hint')).toBeDefined()
    })

    fireEvent.click(screen.getByTestId('counter-blocked-action'))
    await waitFor(() => {
      expect(screen.getByTestId('counter-cashier-header')).toBeDefined()
    })
  })
})
