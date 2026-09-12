import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import CartBar from '@/components/CartBar'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Cart with a single product so submit is not blocked by an empty cart.
const mockCart = {
  items: [
    {
      product: {
        id: 'p-1', name: 'Bier', shortName: null, priceCents: 300, taxRateBps: 2000,
        stationId: 'st-1', available: true, isVoucher: false, addable: true,
        stockMode: 'none' as const, stockCount: 0, sortOrder: 0, color: null,
      },
      quantity: 1,
    },
  ],
  decrementItem: vi.fn(),
}

vi.mock('@/stores/cart', () => ({
  useCartStore: () => mockCart,
}))

type CartBarProps = ComponentProps<typeof CartBar>

function renderBar(overrides: Partial<CartBarProps> = {}) {
  const props: CartBarProps = {
    tableNumber: '',
    onTableChange: vi.fn(),
    error: '',
    submitting: false,
    total: 300,
    onSubmit: vi.fn(),
    onOpenVariant: vi.fn(),
    t: (key: string) => key,
    ...overrides,
  }
  return render(<CartBar {...props} />)
}

beforeEach(() => {
  mockCart.decrementItem.mockReset()
})

describe('CartBar identifier input', () => {
  it('shows the table number input for regular waiters', () => {
    renderBar({ tableNumber: '5' })

    expect((screen.getByTestId('table-number-input') as HTMLInputElement).value).toBe('5')
    expect(screen.queryByTestId('bon-number-input')).toBeNull()
  })

  it('shows the Bon input in counter mode instead of the table input', () => {
    renderBar({ isCounterMode: true, bonNumber: '7' })

    const bon = screen.getByTestId('bon-number-input') as HTMLInputElement
    expect(bon.value).toBe('7')
    expect(bon.type).toBe('number')
    expect(screen.queryByTestId('table-number-input')).toBeNull()
  })

  it('reports Bon edits through onBonChange', () => {
    const onBonChange = vi.fn()
    renderBar({ isCounterMode: true, bonNumber: '', onBonChange })

    fireEvent.change(screen.getByTestId('bon-number-input'), { target: { value: '12' } })
    expect(onBonChange).toHaveBeenCalledWith('12')
  })

  it('enables submit once a Bon and items are present', () => {
    renderBar({ isCounterMode: true, bonNumber: '3' })

    expect((screen.getByTestId('submit-order') as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables submit without a Bon', () => {
    renderBar({ isCounterMode: true, bonNumber: '' })

    expect((screen.getByTestId('submit-order') as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables submit and shows the hint while the previous Bon is unpaid', () => {
    renderBar({ isCounterMode: true, bonNumber: '4', blocked: true, blockedHint: 'order.counterBlocked' })

    expect((screen.getByTestId('submit-order') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('order.counterBlocked')).toBeDefined()
  })

  it('offers a shortcut to the cashier from the blocked hint', () => {
    const onBlockedAction = vi.fn()
    renderBar({
      isCounterMode: true,
      bonNumber: '4',
      blocked: true,
      blockedHint: 'order.counterBlocked',
      blockedActionLabel: 'order.toCashier',
      onBlockedAction,
    })

    fireEvent.click(screen.getByTestId('counter-blocked-action'))
    expect(onBlockedAction).toHaveBeenCalled()
  })
})
