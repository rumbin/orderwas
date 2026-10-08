import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import StationDisplay from '@/pages/StationDisplay'

// Mock i18n — t() returns the key, so identifiers read as "station.table 42" / "order.bonNumber 7"
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockGetStation = vi.hoisted(() => vi.fn())
const mockGetOrders = vi.hoisted(() => vi.fn())

vi.mock('@/api/client', () => ({
  api: {
    getStation: mockGetStation,
    getOrders: mockGetOrders,
    updateOrderItem: vi.fn(),
  },
}))

// StationDisplay subscribes to live updates; the socket itself is irrelevant here.
vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(),
}))

// UserMenu pulls in the session store + auth; not what this page-level test covers.
vi.mock('@/components/UserMenu', () => ({ default: () => null }))

const station = { id: 'st-1', name: 'Bar', eventId: 'ev-1' }

function makeOrder(overrides: Partial<Record<string, unknown>>, items: unknown[] = []) {
  return {
    id: 'o-1',
    status: 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tableNumber: null,
    pickupCode: null,
    tearOffNumber: null,
    items,
    ...overrides,
  }
}

function makeItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'it-1',
    status: 'open',
    quantity: 1,
    comment: null,
    options: null,
    productId: 'p-1',
    product: { id: 'p-1', name: 'Bier', color: null, stationId: 'st-1' },
    ...overrides,
  }
}

beforeEach(() => {
  mockGetStation.mockReset()
  mockGetOrders.mockReset()
  mockGetStation.mockResolvedValue(station)
  mockGetOrders.mockResolvedValue([])
})

const renderDisplay = () => render(<StationDisplay navigate={() => {}} stationId="st-1" />)

describe('StationDisplay order identity', () => {
  it('labels a counter order by its Bon and does not repeat the tear-off number', async () => {
    // Counter orders have neither tableNumber nor pickupCode: the Bon IS the identity.
    mockGetOrders.mockResolvedValue([makeOrder({ tearOffNumber: 7 }, [makeItem()])])

    renderDisplay()

    await waitFor(() => {
      expect(screen.getByTestId('order-identifier')).toHaveTextContent('order.bonNumber 7')
    })
    // bonIsIdentifier: no duplicate "#7" next to the label
    expect(screen.queryByText('#7')).toBeNull()
  })

  it('labels a table order by table and keeps the tear-off number as a suffix', async () => {
    mockGetOrders.mockResolvedValue([makeOrder({ tableNumber: '42', tearOffNumber: 3 }, [makeItem()])])

    renderDisplay()

    await waitFor(() => {
      expect(screen.getByTestId('order-identifier')).toHaveTextContent('station.table 42')
    })
    expect(screen.getByText('#3')).toBeInTheDocument()
  })

  it('uses the same identifier in the product aggregation view', async () => {
    mockGetOrders.mockResolvedValue([makeOrder({ tearOffNumber: 7 }, [makeItem()])])

    renderDisplay()
    const productsTab = await screen.findByText('order.products')
    productsTab.click()

    await waitFor(() => {
      expect(screen.getByText('order.bonNumber 7')).toBeInTheDocument()
    })
  })
})

describe('StationDisplay theme', () => {
  it('exposes the theme switcher in the header', async () => {
    renderDisplay()

    await waitFor(() => {
      expect(screen.getByTestId('theme-switcher')).toBeInTheDocument()
    })
  })
})
