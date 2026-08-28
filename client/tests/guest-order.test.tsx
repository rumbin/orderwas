import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GuestOrder from '@/pages/GuestOrder'

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Mock api object + global fetch (GuestOrder POSTs to /api/guest/orders directly)
const mockGetStations = vi.hoisted(() => vi.fn())
const mockGetProducts = vi.hoisted(() => vi.fn())
const mockFetch = vi.hoisted(() => vi.fn())

vi.mock('@/api/client', () => ({
  api: {
    getStations: mockGetStations,
    getProducts: mockGetProducts,
  },
}))

const stations = [
  { id: 'st-1', name: 'Bar', logo: null, printerId: null, kitchenMonitor: false, sortOrder: 0, copyPrint: false, eventId: 'evt-1' },
  { id: 'st-2', name: 'Kitchen', logo: null, printerId: null, kitchenMonitor: false, sortOrder: 1, copyPrint: false, eventId: 'evt-1' },
]

const barProducts = [
  { id: 'p-1', name: 'Bier', shortName: null, priceCents: 300, taxRateBps: 2000, stationId: 'st-1', available: true, isVoucher: false, addable: true, stockMode: 'none', stockCount: 0, sortOrder: 0, color: null },
  { id: 'p-2', name: 'Cola', shortName: null, priceCents: 250, taxRateBps: 2000, stationId: 'st-1', available: true, isVoucher: false, addable: true, stockMode: 'none', stockCount: 0, sortOrder: 1, color: null },
  { id: 'p-3', name: 'Fanta', shortName: null, priceCents: 250, taxRateBps: 2000, stationId: 'st-1', available: false, isVoucher: false, addable: true, stockMode: 'none', stockCount: 0, sortOrder: 2, color: null },
]

beforeEach(() => {
  mockGetStations.mockReset()
  mockGetProducts.mockReset()
  mockFetch.mockReset()
  mockGetStations.mockResolvedValue(stations)
  mockGetProducts.mockImplementation((stationId: string) => {
    if (stationId === 'st-1') return Promise.resolve(barProducts)
    return Promise.resolve([])
  })
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ tearOffNumber: 42, totalCents: 300 }) })
  vi.stubGlobal('fetch', mockFetch)
})

const renderGuest = () => render(<GuestOrder eventId="evt-1" token="table-token-9" />)

describe('GuestOrder', () => {
  it('renders the menu from the mocked stations/products and hides unavailable items', async () => {
    renderGuest()

    await waitFor(() => {
      expect(screen.getByText('Bier')).toBeDefined()
    })
    expect(screen.getByText('Cola')).toBeDefined()
    // product prices in de-DE format
    expect(screen.getByText('3,00 €')).toBeDefined()
    expect(screen.getByText('2,50 €')).toBeDefined()
    // unavailable product is filtered out of the menu
    expect(screen.queryByText('Fanta')).toBeNull()
    // products for the first station were requested
    expect(mockGetProducts).toHaveBeenCalledWith('st-1')
  })

  it('adding a product increments the guest cart and recomputes the total', async () => {
    renderGuest()

    await waitFor(() => {
      expect(screen.getByText('Bier')).toBeDefined()
    })

    // Add Bier twice
    fireEvent.click(screen.getByText('Bier'))
    fireEvent.click(screen.getByText('Bier'))

    // Cart bar appears → count badge 2, item count and total (300¢ × 2 = 600¢)
    expect(screen.getByText('2 Artikel')).toBeDefined()
    expect(screen.getByText('6,00 €')).toBeDefined()
  })

  it('submitting posts to the guest order API with the table token and selected items', async () => {
    renderGuest()

    await waitFor(() => {
      expect(screen.getByText('Bier')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Bier'))
    fireEvent.click(screen.getByText('Cola'))

    fireEvent.click(screen.getByText('order.submit'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/guest/orders')
    expect(options.method).toBe('POST')
    const body = JSON.parse(String(options.body))
    expect(body).toEqual({
      token: 'table-token-9',
      items: [
        { productId: 'p-1', quantity: 1 },
        { productId: 'p-2', quantity: 1 },
      ],
    })
  })

  it('shows the success screen with tear-off number and total after a successful order', async () => {
    renderGuest()

    await waitFor(() => {
      expect(screen.getByText('Bier')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Bier'))
    fireEvent.click(screen.getByText('order.submit'))

    await waitFor(() => {
      expect(screen.getByText('order.success')).toBeDefined()
    })
    expect(screen.getByText('#42')).toBeDefined()
    expect(screen.getByText('3,00 €')).toBeDefined()
  })
})