import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OrderPage from '@/pages/Order'
import { useCartStore } from '@/stores/cart'
import { makeCounterWaiter, makeEvent, resetSessionState } from './helpers/session'

/**
 * Counter submit path. Kept in its own file: rendering OrderPage *and*
 * mutating the cart in more than one test in the same worker hangs vitest 2.1.9
 * (see the repo's test-splitting convention), so this file holds a single
 * cart-driven test.
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Identity-stable store mock (see tests/helpers/session.ts).
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

beforeEach(() => {
  useCartStore.getState().clear()
  resetSessionState({
    waiter: makeCounterWaiter({ tearOffNumber: 5 }),
    event: makeEvent({ counterEnabled: true }),
  })
  mockGetStations.mockReset().mockResolvedValue(stations)
  mockGetProducts.mockReset().mockResolvedValue(barProducts)
  mockGetCounterUnpaid.mockReset().mockResolvedValue([])
  mockGetOrders.mockReset().mockResolvedValue([])
  mockGetEvent.mockReset().mockResolvedValue({
    id: 'evt-1', name: 'Testfest', status: 'test', hidePrices: false, tseEnabled: false,
    counterEnabled: true, createdAt: '', updatedAt: '',
  })
  mockCreateOrder.mockReset().mockResolvedValue({ id: 'o-new', tearOffNumber: 6, tableNumber: null, items: [{ id: 'it-new' }] })
})

describe('OrderPage counter submit', () => {
  it('submits the Bon as tear-off number and no table', async () => {
    render(<OrderPage navigate={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('product-Bier')).toBeDefined()
    })
    fireEvent.click(screen.getByTestId('increment-Bier'))
    fireEvent.click(screen.getByTestId('submit-order'))

    await waitFor(() => {
      expect(mockCreateOrder).toHaveBeenCalled()
    })
    const payload = mockCreateOrder.mock.calls[0][0]
    expect(payload.tearOffNumber).toBe(6)
    expect(payload.tableNumber).toBeUndefined()
    expect(payload.waiterId).toBe('w-theke')
    expect(payload.items).toHaveLength(1)
  })
})
