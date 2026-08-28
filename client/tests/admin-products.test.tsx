import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// Mock the API client (only the methods AdminProducts uses)
const mockCreateProduct = vi.fn()
const mockGetProducts = vi.fn()
const mockDeleteProduct = vi.fn()
const mockUpdateProduct = vi.fn()
const mockReorderProducts = vi.fn()

vi.mock('@/api/client', () => ({
  api: {
    createProduct: (...args: unknown[]) => mockCreateProduct(...args),
    getProducts: (...args: unknown[]) => mockGetProducts(...args),
    deleteProduct: (...args: unknown[]) => mockDeleteProduct(...args),
    updateProduct: (...args: unknown[]) => mockUpdateProduct(...args),
    reorderProducts: (...args: unknown[]) => mockReorderProducts(...args),
  },
}))

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => opts ? `${key}:${opts.name}` : key,
  }),
}))

import { AdminProducts, ProductEditModal } from '@/pages/admin/AdminProducts'
import type { Station, Product } from '@/api/types'

const mockStations: Station[] = [
  { id: 'st1', name: 'Bar', eventId: 'evt1', logo: null, printerId: null, kitchenMonitor: false, sortOrder: 0, copyPrint: false },
]

const mockProducts: Product[] = [
  { id: 'p1', name: 'Bier', priceCents: 300, stationId: 'st1', available: true, sortOrder: 0, taxRateBps: 2000, isVoucher: false, addable: true, stockMode: 'none', stockCount: 0, shortName: null, color: null },
  { id: 'p2', name: 'Schnitzel', priceCents: 850, stationId: 'st1', available: true, sortOrder: 1, taxRateBps: 2000, isVoucher: false, addable: true, stockMode: 'none', stockCount: 0, shortName: null, color: null },
]

function renderReal(stationIds: string[] = ['st1'], initial: Record<string, Product[]> = { st1: mockProducts }) {
  const onLoadProducts = vi.fn()
  const onCreateOrDelete = vi.fn()
  // Controlled wrapper that owns products state, like the real Admin shell.
  const Wrapper = () => {
    const [products, setProducts] = React.useState<Record<string, Product[]>>(initial)
    return (
      <AdminProducts
        stations={mockStations.filter((s) => stationIds.includes(s.id))}
        products={products}
        onLoadProducts={onLoadProducts}
        onCreateOrDelete={onCreateOrDelete}
        setProducts={setProducts}
      />
    )
  }
  const utils = render(<Wrapper />)
  return { onLoadProducts, onCreateOrDelete, ...utils }
}

describe('AdminProducts (real component)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetProducts.mockResolvedValue(mockProducts)
  })

  it('displays the products for the active station', async () => {
    renderReal()
    expect(screen.getByText('Bier')).toBeTruthy()
    expect(screen.getByText('Schnitzel')).toBeTruthy()
    // prices rendered via input defaultValue
    expect(screen.getByDisplayValue('300')).toBeTruthy()
    expect(screen.getByDisplayValue('850')).toBeTruthy()
  })

  it('opens the delete confirmation dialog on delete', async () => {
    renderReal()
    // The delete button has aria-label 'common.delete'
    const deleteButtons = screen.getAllByLabelText('common.delete')
    expect(deleteButtons).toHaveLength(2)
    fireEvent.click(deleteButtons[0])
    expect(screen.getByText('admin.confirmDeleteProduct:Bier')).toBeTruthy()
  })

  it('shows an error when a referenced product cannot be deleted', async () => {
    mockDeleteProduct.mockRejectedValue(new Error('Product is referenced by orders and cannot be deleted'))
    renderReal()
    fireEvent.click(screen.getAllByLabelText('common.delete')[0])
    fireEvent.click(screen.getByText('common.delete')) // confirm
    await waitFor(() => {
      expect(screen.getByText('Product is referenced by orders and cannot be deleted')).toBeTruthy()
    })
  })

  it('removes a product from the list after a successful delete', async () => {
    mockDeleteProduct.mockResolvedValue(undefined)
    // The admin shell loads via onLoadProducts (no-op here); api.getProducts is
    // only called inside handleDelete → so this one resolveOnce is the reload.
    mockGetProducts.mockResolvedValueOnce([mockProducts[1]])
    renderReal()
    await waitFor(() => expect(screen.getByText('Bier')).toBeTruthy())
    fireEvent.click(screen.getAllByLabelText('common.delete')[0])
    fireEvent.click(screen.getByText('common.delete')) // confirm
    await waitFor(() => {
      expect(screen.queryByText('Bier')).toBeNull()
      expect(screen.getByText('Schnitzel')).toBeTruthy()
    })
  })

  it('toggles product availability without clearing the list', async () => {
    mockUpdateProduct.mockResolvedValue({})
    renderReal()
    // toggle buttons render the availability text 'Ja'/'Nein'
    expect(screen.getAllByText('Ja')).toHaveLength(2)
    fireEvent.click(screen.getAllByText('Ja')[0])
    await waitFor(() => {
      expect(screen.getByText('Bier')).toBeTruthy()
      expect(screen.getByText('Schnitzel')).toBeTruthy()
      // updateProduct was called for p1 with available:false
      expect(mockUpdateProduct).toHaveBeenCalledWith('p1', { available: false })
    })
  })

  it('creates a new product via the create form', async () => {
    mockCreateProduct.mockResolvedValue({ id: 'p3' })
    renderReal()
    fireEvent.change(screen.getByPlaceholderText('Produktname'), { target: { value: 'Cola' } })
    fireEvent.change(screen.getByPlaceholderText('Cent'), { target: { value: '250' } })
    fireEvent.click(screen.getByText('common.create'))
    await waitFor(() => {
      expect(mockCreateProduct).toHaveBeenCalledWith('st1', { name: 'Cola', priceCents: 250 })
    })
  })

  it('ProductEditModal renders the product name and a price-delta with shared formatter', async () => {
    const product: Product = {
      id: 'p1', name: 'Bier', priceCents: 300, stationId: 'st1', available: true, sortOrder: 0,
      taxRateBps: 2000, isVoucher: false, addable: true, stockMode: 'none', stockCount: 0, shortName: null, color: null,
      extras: [{
        id: 'e1', name: 'Belag', productId: 'p1', multiSelect: false, sortOrder: 0,
        options: [{ id: 'o1', extraId: 'e1', name: 'Scharf', sortOrder: 0, priceDeltaCents: 50 }],
      }],
    }
    render(<ProductEditModal product={product} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByText('Bier — admin.extras')).toBeTruthy()
    // priceDeltaCents 50 → '+0,50 €' via formatPrice (characters may split across nodes)
    expect(screen.getAllByText((_, node) => node?.textContent?.includes('0,50') ?? false).length).toBeGreaterThan(0)
  })
})