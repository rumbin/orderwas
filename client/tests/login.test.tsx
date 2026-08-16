import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Login from '@/pages/Login'

// Mock the API client
vi.mock('@/api/client', () => ({
  api: {
    getEvents: vi.fn(),
    getWaiters: vi.fn(),
    login: vi.fn(),
  },
}))

import { api } from '@/api/client'

// Mock zustand session store
vi.mock('@/stores/session', () => ({
  useSessionStore: () => ({
    setSession: vi.fn(),
    clear: vi.fn(),
  }),
}))

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Mock zustand to avoid persist middleware
vi.mock('zustand', () => ({
  create: (fn: any) => {
    const state = fn((set: any) => ({}), () => ({}))
    return () => state
  },
}))

const mockEvents = [
  { id: 'evt1', name: 'Testfest', status: 'test', hidePrices: false, tseEnabled: false, lastTearOffNumber: 0, createdAt: '', updatedAt: '' },
]
const mockWaiters = [
  { id: 'wtr1', name: 'Alice', logo: null, eventId: 'evt1', printerId: null, pickupCode: null, printsImmediately: true, canCancel: false, canCashOut: false, canStatistics: false, canCreateWaiters: false, canTransfer: false, isStationWaiter: false, hidden: false, autoSammelbon: false, active: true },
]

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getEvents).mockResolvedValue(mockEvents as any)
    vi.mocked(api.getWaiters).mockResolvedValue(mockWaiters as any)
  })

  it('renders event selector populated from API', async () => {
    render(<Login navigate={vi.fn()} />)
    await waitFor(() => {
      expect(api.getEvents).toHaveBeenCalled()
    })
    const select = screen.getByTestId('event-select')
    expect(select).toBeDefined()
    await waitFor(() => {
      const options = select.querySelectorAll('option')
      expect(options.length).toBeGreaterThanOrEqual(2) // placeholder + events
    })
  })

  it('loads waiters after event selection', async () => {
    render(<Login navigate={vi.fn()} />)
    await waitFor(() => expect(api.getEvents).toHaveBeenCalled())
    const eventSelect = screen.getByTestId('event-select')
    fireEvent.change(eventSelect, { target: { value: 'evt1' } })
    await waitFor(() => expect(api.getWaiters).toHaveBeenCalledWith('evt1'))
    const waiterSelect = screen.getByTestId('waiter-select')
    await waitFor(() => {
      const options = waiterSelect.querySelectorAll('option')
      expect(options.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('shows wrong PIN error on login failure', async () => {
    vi.mocked(api.login).mockRejectedValueOnce(new Error('Invalid credentials'))
    render(<Login navigate={vi.fn()} />)
    await waitFor(() => expect(api.getEvents).toHaveBeenCalled())
    fireEvent.change(screen.getByTestId('event-select'), { target: { value: 'evt1' } })
    await waitFor(() => expect(api.getWaiters).toHaveBeenCalled())
    fireEvent.change(screen.getByTestId('waiter-select'), { target: { value: 'wtr1' } })
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
    await waitFor(() => expect(api.getEvents).toHaveBeenCalled())
    fireEvent.change(screen.getByTestId('event-select'), { target: { value: 'evt1' } })
    await waitFor(() => expect(api.getWaiters).toHaveBeenCalled())
    fireEvent.change(screen.getByTestId('waiter-select'), { target: { value: 'wtr1' } })
    fireEvent.change(screen.getByTestId('pin-input'), { target: { value: '1234' } })
    fireEvent.click(screen.getByTestId('login-button'))
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/order')
    })
  })
})