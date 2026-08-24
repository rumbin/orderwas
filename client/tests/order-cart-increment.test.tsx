/**
 * Cart increment test — isolated to avoid vitest worker hang.
 * The vitest worker hangs when two tests that both render OrderPage and
 * interact with the zustand cart store run sequentially in the same worker.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OrderPage from '@/pages/Order'
import { useCartStore } from '@/stores/cart'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/stores/session', () => ({
  useSessionStore: (selector?: any) => {
    const state = {
      event: { id: 'evt-1', name: 'Testfest', status: 'test', hidePrices: false, tseEnabled: false, lastTearOffNumber: 0, createdAt: '', updatedAt: '' },
      waiter: { id: 'w-1', name: 'Alice', logo: null, eventId: 'evt-1', printerId: null, pickupCode: null, printsImmediately: true, canCancel: false, canCashOut: false, canStatistics: false, canCreateWaiters: false, canTransfer: false, isStationWaiter: false, hidden: false, autoSammelbon: false, active: true },
      token: 'fake-token', adminToken: null,
      setEvent: vi.fn(), setWaiter: vi.fn(), setToken: vi.fn(),
      setAdminToken: vi.fn(), setSession: vi.fn(), clear: vi.fn(),
      isLoggedIn: () => true, isAdminLoggedIn: () => false,
    }
    return selector ? selector(state) : state
  },
}))

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
