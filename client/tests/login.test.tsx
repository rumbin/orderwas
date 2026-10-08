import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Login from '@/pages/Login'

vi.mock('@/api/client', () => ({
  api: {
    getWaiters: vi.fn(),
    login: vi.fn(),
  },
}))

import { api } from '@/api/client'

const mockEvent = { id: 'evt1', name: 'Testfest', status: 'test', hidePrices: false, tseEnabled: false, createdAt: '', updatedAt: '' }
vi.mock('@/stores/session', () => ({
  useSessionStore: () => ({
    event: mockEvent,
    setSession: vi.fn(),
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('zustand', () => ({
  create: (fn: any) => {
    const state = fn((set: any) => ({}), () => ({}))
    return () => state
  },
}))

const mockWaiters = [
  { id: 'wtr1', name: 'Alice', logo: null, eventId: 'evt1', printerId: null, pickupCode: null, printsImmediately: true, canCancel: false, canCashOut: false, canStatistics: false, canCreateWaiters: false, canTransfer: false, isStationWaiter: false, hidden: false, autoSammelbon: false, active: true },
  { id: 'wtr2', name: 'Bob', logo: null, eventId: 'evt1', printerId: null, pickupCode: null, printsImmediately: true, canCancel: false, canCashOut: false, canStatistics: false, canCreateWaiters: false, canTransfer: false, isStationWaiter: false, hidden: false, autoSammelbon: false, active: true },
]

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getWaiters).mockResolvedValue(mockWaiters as any)
  })

  it('renders waiter buttons sorted alphabetically', async () => {
    render(<Login navigate={vi.fn()} />)
    // Wait for the render, not just the request: getWaiters() resolving does not
    // mean React has committed the buttons yet (this raced under parallel load).
    const aliceBtn = await screen.findByTestId('waiter-Alice')
    const bobBtn = screen.getByTestId('waiter-Bob')
    // Alice before Bob in DOM (alphabetical)
    expect(aliceBtn.compareDocumentPosition(bobBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('clicking waiter opens PIN overlay', async () => {
    render(<Login navigate={vi.fn()} />)
    await screen.findByTestId('waiter-Alice')
    fireEvent.click(screen.getByTestId('waiter-Alice'))
    expect(screen.getByTestId('pin-input')).toBeDefined()
    expect(screen.getByTestId('login-button')).toBeDefined()
  })

  it('shows wrong PIN error on login failure', async () => {
    vi.mocked(api.login).mockRejectedValueOnce(new Error('Invalid credentials'))
    render(<Login navigate={vi.fn()} />)
    await screen.findByTestId('waiter-Alice')
    fireEvent.click(screen.getByTestId('waiter-Alice'))
    fireEvent.change(screen.getByTestId('pin-input'), { target: { value: '9999' } })
    fireEvent.click(screen.getByTestId('login-button'))
    await waitFor(() => {
      expect(screen.getByTestId('login-error')).toBeDefined()
    })
  })

  it('navigates to /order on successful login', async () => {
    const mockNavigate = vi.fn()
    vi.mocked(api.login).mockResolvedValueOnce({
      token: 'jwt-token',
      waiter: mockWaiters[0] as any,
    })
    render(<Login navigate={mockNavigate} />)
    await screen.findByTestId('waiter-Alice')
    fireEvent.click(screen.getByTestId('waiter-Alice'))
    fireEvent.change(screen.getByTestId('pin-input'), { target: { value: '1234' } })
    fireEvent.click(screen.getByTestId('login-button'))
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/order')
    })
  })
})
