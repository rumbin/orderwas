/**
 * Cart increment + decrement.
 *
 * These two cases used to live in two separate files purely because the vitest
 * worker hung when both ran in the same worker. The real cause was the
 * session-store mock handing out a fresh `event` object on every render, which
 * re-triggered every `[event]`-keyed effect in OrderPage (see
 * tests/helpers/session.ts). With an identity-stable mock both cases run
 * together safely.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OrderPage from '@/pages/Order'
import { useCartStore } from '@/stores/cart'
import { makeEvent, makeWaiter, resetSessionState } from './helpers/session'

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

vi.mock('@/api/client', () => ({
  api: {
    getStations: mockGetStations,
    getProducts: mockGetProducts,
    createOrder: mockCreateOrder,
    getOrders: vi.fn().mockResolvedValue([]),
    cancelOrder: vi.fn(),
    getEvents: vi.fn().mockResolvedValue([]),
    getWaiters: vi.fn().mockResolvedValue([]),
    login: vi.fn(),
  },
}))

const mockStations = [
  { id: 'st-1', name: 'Bar', logo: null, printerId: null, kitchenMonitor: false, sortOrder: 0, copyPrint: false, eventId: 'evt-1' },
  { id: 'st-2', name: 'Kitchen', logo: null, printerId: null, kitchenMonitor: false, sortOrder: 1, copyPrint: false, eventId: 'evt-1' },
]
const mockBarProducts = [
  { id: 'p-1', name: 'Bier', shortName: null, priceCents: 300, taxRateBps: 2000, stationId: 'st-1', available: true, isVoucher: false, addable: true, stockMode: 'none', stockCount: 0, sortOrder: 0, color: null },
]
const mockKitchenProducts = [
  { id: 'p-3', name: 'Schnitzel', shortName: null, priceCents: 800, taxRateBps: 2000, stationId: 'st-2', available: true, isVoucher: false, addable: true, stockMode: 'none', stockCount: 0, sortOrder: 0, color: null },
]

beforeEach(() => {
  useCartStore.getState().clear()
  resetSessionState({ waiter: makeWaiter(), event: makeEvent() })
  mockGetStations.mockReset()
  mockGetProducts.mockReset()
  mockCreateOrder.mockReset()
  mockGetStations.mockResolvedValue(mockStations)
  mockGetProducts.mockImplementation((stationId: string) => {
    if (stationId === 'st-1') return Promise.resolve(mockBarProducts)
    if (stationId === 'st-2') return Promise.resolve(mockKitchenProducts)
    return Promise.resolve([])
  })
  mockCreateOrder.mockResolvedValue({ tearOffNumber: 1 })
})

describe('Cart increment', () => {
  it('clicking + increments cart count', async () => {
    render(<OrderPage navigate={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('product-Bier')).toBeDefined()
    })

    const incrementBtn = screen.getByTestId('increment-Bier')
    fireEvent.click(incrementBtn)

    const cartItems = screen.getAllByTestId('cart-item')
    expect(cartItems.length).toBe(1)
    expect(cartItems[0].textContent).toContain('Bier')

    fireEvent.click(incrementBtn)
    const cartItems2 = screen.getAllByTestId('cart-item')
    expect(cartItems2.length).toBe(1)
    expect(cartItems2[0].textContent).toContain('2×')
  })
})

describe('Cart decrement', () => {
  it('clicking - decrements cart count and removes at zero', async () => {
    render(<OrderPage navigate={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('product-Bier')).toBeDefined()
    })

    const incrementBtn = screen.getByTestId('increment-Bier')
    const decrementBtn = screen.getByTestId('decrement-Bier')

    fireEvent.click(incrementBtn)
    fireEvent.click(incrementBtn)
    let cartItems = screen.getAllByTestId('cart-item')
    expect(cartItems[0].textContent).toContain('2×')

    fireEvent.click(decrementBtn)
    cartItems = screen.getAllByTestId('cart-item')
    expect(cartItems[0].textContent).toContain('Bier')

    fireEvent.click(decrementBtn)
    expect(screen.queryAllByTestId('cart-item').length).toBe(0)
  })
})
