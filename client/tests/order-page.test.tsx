import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OrderPage from '@/pages/Order'

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Mock session store — logged in with event + waiter
vi.mock('@/stores/session', () => ({
  useSessionStore: (selector?: any) => {
    const state = {
      event: { id: 'evt-1', name: 'Testfest', status: 'test', hidePrices: false, tseEnabled: false, lastTearOffNumber: 0, createdAt: '', updatedAt: '' },
      waiter: { id: 'w-1', name: 'Alice', logo: null, eventId: 'evt-1', printerId: null, pickupCode: null, printsImmediately: true, canCancel: false, canCashOut: false, canStatistics: false, canCreateWaiters: false, canTransfer: false, isStationWaiter: false, hidden: false, autoSammelbon: false, active: true },
      token: 'fake-token',
      adminToken: null,
      setEvent: vi.fn(),
      setWaiter: vi.fn(),
      setToken: vi.fn(),
      setAdminToken: vi.fn(),
      setSession: vi.fn(),
      clear: vi.fn(),
      isLoggedIn: () => true,
      isAdminLoggedIn: () => false,
    }
    return selector ? selector(state) : state
  },
}))

// Use vi.hoisted to define mock functions that survive vi.mock hoisting
const mockGetStations = vi.hoisted(() => vi.fn())
const mockGetProducts = vi.hoisted(() => vi.fn())
const mockCreateOrder = vi.hoisted(() => vi.fn())
const mockGetOrders = vi.hoisted(() => vi.fn())
const mockCancelOrder = vi.hoisted(() => vi.fn())

vi.mock('@/api/client', () => ({
  api: {
    getStations: mockGetStations,
    getProducts: mockGetProducts,
    createOrder: mockCreateOrder,
    getOrders: mockGetOrders,
    cancelOrder: mockCancelOrder,
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
  { id: 'p-1', name: 'Bier', shortName: null, priceCents: 300, taxRateBps: 2000, stationId: 'st-1', available: true, isVoucher: false, addable: true, stockMode: 'none', stockCount: 0, sortOrder: 0 },
  { id: 'p-2', name: 'Cola', shortName: null, priceCents: 250, taxRateBps: 2000, stationId: 'st-1', available: true, isVoucher: false, addable: true, stockMode: 'none', stockCount: 0, sortOrder: 1 },
]

const mockKitchenProducts = [
  { id: 'p-3', name: 'Schnitzel', shortName: null, priceCents: 800, taxRateBps: 2000, stationId: 'st-2', available: true, isVoucher: false, addable: true, stockMode: 'none', stockCount: 0, sortOrder: 0 },
]

const mockOutOfStockProduct = {
  id: 'p-4', name: 'Fanta', shortName: null, priceCents: 250, taxRateBps: 2000, stationId: 'st-1', available: true, isVoucher: false, addable: true, stockMode: 'tracked', stockCount: 0, sortOrder: 2,
}

// Reset cart store between tests
beforeEach(async () => {
  const { useCartStore } = await import('@/stores/cart')
  useCartStore.getState().clear()
  vi.clearAllMocks()
  // Re-setup mock implementations after clearAllMocks
  mockGetStations.mockResolvedValue(mockStations)
  mockGetProducts.mockImplementation((stationId: string) => {
    if (stationId === 'st-1') return Promise.resolve([...mockBarProducts, mockOutOfStockProduct])
    if (stationId === 'st-2') return Promise.resolve(mockKitchenProducts)
    return Promise.resolve([])
  })
  mockCreateOrder.mockResolvedValue({ tearOffNumber: 1 })
  mockGetOrders.mockResolvedValue([])
  mockCancelOrder.mockResolvedValue({})
})

describe('OrderPage', () => {
  const navigate = vi.fn()

  it('renders product grid when session has event', async () => {
    render(<OrderPage navigate={navigate} />)

    await waitFor(() => {
      expect(screen.getByTestId('product-Bier')).toBeDefined()
      expect(screen.getByTestId('product-Cola')).toBeDefined()
    })
  })

  it('renders tab buttons and user menu in header', async () => {
    render(<OrderPage navigate={navigate} />)
    await waitFor(() => {
      expect(screen.getByTestId('user-menu-button')).toBeDefined()
    })
    // Tab buttons should be present
    expect(screen.getByText('order.tabNew')).toBeDefined()
    expect(screen.getByText('order.tabOpen')).toBeDefined()
    expect(screen.getByText('order.tabDone')).toBeDefined()
  })

  it('renders user menu button with first letter of waiter name', async () => {
    render(<OrderPage navigate={navigate} />)
    await waitFor(() => {
      expect(screen.getByTestId('user-menu-button')).toBeDefined()
    })
    expect(screen.getByTestId('user-menu-button').textContent).toBe('A')
  })

  it('station tabs switch active tab', async () => {
    render(<OrderPage navigate={navigate} />)

    await waitFor(() => {
      expect(screen.getByTestId('product-Bier')).toBeDefined()
    })

    const barBtn = screen.getByText('Bar')
    const kitchenBtn = screen.getByText('Kitchen')

    // Initially Bar is active (blue), Kitchen is inactive (gray)
    expect(barBtn.className).toContain('bg-blue-600')
    expect(kitchenBtn.className).toContain('bg-gray-100')

    // Click Kitchen tab — fireEvent triggers the onClick synchronously
    fireEvent.click(kitchenBtn)

    // Kitchen should now be active (blue), Bar inactive (gray)
    expect(kitchenBtn.className).toContain('bg-blue-600')
    expect(barBtn.className).toContain('bg-gray-100')
  })

  it('station tabs fetch products for clicked station', async () => {
    render(<OrderPage navigate={navigate} />)

    await waitFor(() => {
      expect(screen.getByTestId('product-Bier')).toBeDefined()
    })

    // Click Kitchen tab
    fireEvent.click(screen.getByText('Kitchen'))

    // API should have been called for both stations
    await waitFor(() => {
      expect(mockGetProducts).toHaveBeenCalledWith('st-1')
      expect(mockGetProducts).toHaveBeenCalledWith('st-2')
    })
  })

  it('clicking + increments cart count', async () => {
    render(<OrderPage navigate={navigate} />)

    await waitFor(() => {
      expect(screen.getByTestId('product-Bier')).toBeDefined()
    })

    // Click + on Bier
    const incrementBtn = screen.getByTestId('increment-Bier')
    fireEvent.click(incrementBtn)

    // Cart should show with 1 item
    const cartItems = screen.getAllByTestId('cart-item')
    expect(cartItems.length).toBe(1)
    expect(cartItems[0].textContent).toContain('Bier')

    // Click + again — quantity should be 2
    fireEvent.click(incrementBtn)
    const cartItems2 = screen.getAllByTestId('cart-item')
    expect(cartItems2.length).toBe(1)
    expect(cartItems2[0].textContent).toContain('2×')
  })

  it('clicking - decrements cart count and removes at zero', async () => {
    render(<OrderPage navigate={navigate} />)

    await waitFor(() => {
      expect(screen.getByTestId('product-Bier')).toBeDefined()
    })

    const incrementBtn = screen.getByTestId('increment-Bier')
    const decrementBtn = screen.getByTestId('decrement-Bier')

    // Add 2
    fireEvent.click(incrementBtn)
    fireEvent.click(incrementBtn)
    let cartItems = screen.getAllByTestId('cart-item')
    expect(cartItems[0].textContent).toContain('2×')

    // Decrement once
    fireEvent.click(decrementBtn)
    cartItems = screen.getAllByTestId('cart-item')
    expect(cartItems[0].textContent).toContain('Bier')

    // Decrement again — should remove from cart
    fireEvent.click(decrementBtn)
    expect(screen.queryAllByTestId('cart-item').length).toBe(0)
  })

  it('out-of-stock products have disabled increment button', async () => {
    render(<OrderPage navigate={navigate} />)

    await waitFor(() => {
      expect(screen.getByTestId('product-Fanta')).toBeDefined()
    })

    const incrementBtn = screen.getByTestId('increment-Fanta')
    expect(incrementBtn).toBeDisabled()

    // Verify the card has the opacity class
    const card = screen.getByTestId('product-Fanta')
    expect(card.className).toContain('opacity-50')
  })

  it('out-of-stock products have disabled decrement button', async () => {
    render(<OrderPage navigate={navigate} />)

    await waitFor(() => {
      expect(screen.getByTestId('product-Fanta')).toBeDefined()
    })

    const decrementBtn = screen.getByTestId('decrement-Fanta')
    expect(decrementBtn).toBeDisabled()
  })

  it('submit button is disabled without table number or cart items', async () => {
    render(<OrderPage navigate={navigate} />)

    await waitFor(() => {
      expect(screen.getByTestId('product-Bier')).toBeDefined()
    })

    // No cart items → no submit button visible (cart bar hidden)
    expect(screen.queryByTestId('submit-order')).toBeNull()
  })

  it('shows table input and submit after adding items', async () => {
    render(<OrderPage navigate={navigate} />)

    await waitFor(() => {
      expect(screen.getByTestId('product-Bier')).toBeDefined()
    })

    // Add a product
    fireEvent.click(screen.getByTestId('increment-Bier'))

    // Cart bar should appear with table input
    expect(screen.getByTestId('table-number-input')).toBeDefined()
    const submitBtn = screen.getByTestId('submit-order')
    expect(submitBtn).toBeDisabled() // no table number yet
  })

  describe('Order filtering', () => {
    const mockOrders = [
      { id: 'o-1', waiterId: 'w-1', tableNumber: '5', pickupCode: null, tearOffNumber: 1, status: 'open', totalCents: 300, comment: null, createdAt: '2026-01-01', updatedAt: '2026-01-01', eventId: 'evt-1',
        items: [{ id: 'oi-1', orderId: 'o-1', productId: 'p-1', quantity: 1, status: 'open', comment: null, options: null, product: { id: 'p-1', name: 'Bier', stationId: 'st-1' } }] },
      { id: 'o-2', waiterId: 'w-2', tableNumber: '3', pickupCode: null, tearOffNumber: 2, status: 'open', totalCents: 250, comment: null, createdAt: '2026-01-02', updatedAt: '2026-01-02', eventId: 'evt-1',
        items: [{ id: 'oi-2', orderId: 'o-2', productId: 'p-2', quantity: 1, status: 'open', comment: null, options: null, product: { id: 'p-2', name: 'Cola', stationId: 'st-1' } }] },
      { id: 'o-3', waiterId: 'w-1', tableNumber: '7', pickupCode: null, tearOffNumber: 3, status: 'cancelled', totalCents: 400, comment: null, createdAt: '2026-01-03', updatedAt: '2026-01-03', eventId: 'evt-1',
        items: [{ id: 'oi-3', orderId: 'o-3', productId: 'p-3', quantity: 1, status: 'cancelled', comment: null, options: null, product: { id: 'p-3', name: 'Schnitzel', stationId: 'st-2' } }] },
    ]

    it('fetches all orders when switching to open tab', async () => {
      mockGetOrders.mockResolvedValue(mockOrders)
      render(<OrderPage navigate={navigate} />)

      await waitFor(() => expect(screen.getByTestId('product-Bier')).toBeDefined())

      // Switch to open tab
      fireEvent.click(screen.getByText('order.tabOpen'))

      await waitFor(() => {
        expect(mockGetOrders).toHaveBeenCalledWith('evt-1')
      })
    })

    it('checkbox checked shows only own orders', async () => {
      mockGetOrders.mockResolvedValue(mockOrders)
      render(<OrderPage navigate={navigate} />)

      await waitFor(() => expect(screen.getByTestId('product-Bier')).toBeDefined())
      fireEvent.click(screen.getByText('order.tabOpen'))

      await waitFor(() => {
        // Alice (w-1) should see her own orders (o-1) but not Bob's (o-2)
        // i18n mock returns keys, so 'station.table' + '5'
        expect(screen.getByText(/5/)).toBeDefined()
        // Bob's order (table 3) should not appear
        const allText = document.body.textContent || ''
        expect(allText).not.toMatch(/3.*Cola/)
      })
    })

    it('checkbox unchecked shows all orders', async () => {
      mockGetOrders.mockResolvedValue(mockOrders)
      render(<OrderPage navigate={navigate} />)

      await waitFor(() => expect(screen.getByTestId('product-Bier')).toBeDefined())
      fireEvent.click(screen.getByText('order.tabOpen'))

      await waitFor(() => {
        expect(screen.getByText(/5/)).toBeDefined()
      })

      // Uncheck the filter
      const checkbox = screen.getByLabelText('order.onlyMyOrders')
      fireEvent.click(checkbox)

      await waitFor(() => {
        // Now should see Bob's order too (table 3 with Cola)
        const allText = document.body.textContent || ''
        expect(allText).toContain('Cola')
      })
    })

    it('done tab shows orders with all items prepared', async () => {
      const doneOrders = [{
        ...mockOrders[0],
        items: [{ ...mockOrders[0].items[0], status: 'prepared' }],
      }]
      mockGetOrders.mockResolvedValue(doneOrders)
      render(<OrderPage navigate={navigate} />)

      await waitFor(() => expect(screen.getByTestId('product-Bier')).toBeDefined())
      fireEvent.click(screen.getByText('order.tabDone'))

      await waitFor(() => {
        expect(screen.getByText('fertig')).toBeDefined()
      })
    })

    it('cancel button calls API and removes order', async () => {
      mockGetOrders.mockResolvedValue([mockOrders[0]])
      render(<OrderPage navigate={navigate} />)

      await waitFor(() => expect(screen.getByTestId('product-Bier')).toBeDefined())
      fireEvent.click(screen.getByText('order.tabOpen'))

      await waitFor(() => {
        expect(screen.getByText(/5/)).toBeDefined()
      })

      // Find and click cancel button
      const cancelBtn = screen.getByText('order.cancelOrder')
      fireEvent.click(cancelBtn)

      await waitFor(() => {
        expect(mockCancelOrder).toHaveBeenCalledWith('o-1', 'fake-token')
      })
    })
  })
})
