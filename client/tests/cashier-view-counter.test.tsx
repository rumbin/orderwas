import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CashierView from '@/components/CashierView'
import { makeCounterWaiter, makeEvent, resetSessionState } from './helpers/session'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockGetCounterUnpaid = vi.hoisted(() => vi.fn())
const mockPayItems = vi.hoisted(() => vi.fn())

vi.mock('@/api/client', () => ({
  api: {
    getCounterUnpaid: mockGetCounterUnpaid,
    payItems: mockPayItems,
  },
}))

// Identity-stable store mock (see tests/helpers/session.ts).
vi.mock('@/stores/session', async () => {
  const { useSessionStoreMock } = await import('./helpers/session')
  return { useSessionStore: useSessionStoreMock }
})

const counterOrder = [
  {
    orderId: 'o-1',
    tearOffNumber: 7,
    waiterName: 'Theke',
    waiterIsCounter: true,
    createdAt: '2026-09-12T12:00:00Z',
    items: [
      { id: 'it-1', productName: 'Bier', quantity: 2, status: 'open', comment: null, options: null, lineTotalCents: 600, paidAt: null },
    ],
  },
]

/**
 * The counter has at most one open Bon. The mock is *stateful* (rather than
 * mockResolvedValueOnce) because the component may re-fetch on re-render —
 * paying flips this state, exactly like the server does.
 */
let counterOpen: typeof counterOrder = []

beforeEach(() => {
  counterOpen = []
  resetSessionState({
    waiter: makeCounterWaiter(),
    event: makeEvent({ counterEnabled: true }),
  })
  mockGetCounterUnpaid.mockReset()
  mockPayItems.mockReset()
  mockGetCounterUnpaid.mockImplementation(async () => counterOpen)
  mockPayItems.mockImplementation(async () => {
    // Paying the Bon settles it and clears the counter screen.
    counterOpen = []
    return { paidCount: 1, sumCents: 600, updatedOrders: [] }
  })
})

describe('CashierView in counter mode', () => {
  it('shows the open Bon and offers no table selection', async () => {
    counterOpen = counterOrder
    render(<CashierView initialTable={null} isCounterMode />)

    await waitFor(() => {
      expect(screen.getByTestId('counter-cashier-header').textContent).toContain('order.counter')
      expect(screen.getByText('Bier')).toBeDefined()
    })
    // Header carries the counter label + Bon number, and there is no
    // "change table" affordance at the counter.
    expect(screen.getByTestId('counter-cashier-header').textContent).toContain('7')
    expect(screen.queryByText('cashier.selectTable')).toBeNull()
  })

  it('pre-selects all items (counter payment is mandatory for next order)', async () => {
    counterOpen = counterOrder
    render(<CashierView initialTable={null} isCounterMode />)

    // The pay button only appears once the pre-selection effect has committed —
    // waiting for the list alone raced with that second render.
    // The pay button exists before the pre-selection effect commits, so wait for
    // it to be *enabled* — clicking it while still disabled is a silent no-op.
    await waitFor(() => {
      expect(screen.getByText('Bier')).toBeDefined()
      expect(screen.getByText('cashier.pay')).toBeEnabled()
    })

    // All items should be pre-selected — no manual click needed
    expect(mockPayItems).not.toHaveBeenCalled()
    // Click pay directly — no need to select items first
    fireEvent.click(screen.getByText('cashier.pay'))

    await waitFor(() => {
      expect(mockPayItems).toHaveBeenCalledWith(['it-1'])
    })
  })

  it('shows the empty state when the counter has no open Bon', async () => {
    render(<CashierView initialTable={null} isCounterMode />)

    await waitFor(() => {
      expect(screen.getByText('cashier.noOpenBon')).toBeDefined()
    })
    expect(screen.queryByText('cashier.selectTable')).toBeNull()
  })

  it('reports completion once the Bon is fully paid (counter returns to the next order)', async () => {
    const onCounterPaymentComplete = vi.fn()
    counterOpen = counterOrder
    render(
      <CashierView initialTable={null} isCounterMode onCounterPaymentComplete={onCounterPaymentComplete} />,
    )

    await waitFor(() => {
      expect(screen.getByText('Bier')).toBeDefined()
      expect(screen.getByText('cashier.pay')).toBeEnabled()
    })

    // Items are pre-selected in counter mode — click pay directly
    fireEvent.click(screen.getByText('cashier.pay'))

    await waitFor(() => {
      expect(mockPayItems).toHaveBeenCalledWith(['it-1'])
    })
    // The Bon is settled → the counter is told to go back to order taking.
    await waitFor(() => {
      expect(onCounterPaymentComplete).toHaveBeenCalled()
    })
  })

  it('keeps the counter on screen when only part of the Bon was paid', async () => {
    const onCounterPaymentComplete = vi.fn()
    // Two items; only one is being paid, so the Bon stays open.
    counterOpen = [
      {
        ...counterOrder[0],
        items: [
          { ...counterOrder[0].items[0], id: 'it-1' },
          { ...counterOrder[0].items[0], id: 'it-2', productName: 'Cola' },
        ],
      },
    ]
    mockPayItems.mockImplementation(async () => {
      counterOpen = [{ ...counterOpen[0], items: [{ ...counterOpen[0].items[1] }] }]
      return { paidCount: 1, sumCents: 300, updatedOrders: [] }
    })
    render(
      <CashierView initialTable={null} isCounterMode onCounterPaymentComplete={onCounterPaymentComplete} />,
    )

    await waitFor(() => {
      expect(screen.getByText('Cola')).toBeDefined()
      expect(screen.getByText('cashier.pay')).toBeEnabled()
    })

    // Items are pre-selected — deselect Bier first (toggle behavior), then pay
    fireEvent.click(screen.getByText('Bier'))
    fireEvent.click(screen.getByText('cashier.pay'))

    await waitFor(() => {
      expect(mockPayItems).toHaveBeenCalledWith(['it-2'])
    })
    expect(onCounterPaymentComplete).not.toHaveBeenCalled()
  })
})
