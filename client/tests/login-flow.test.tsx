import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock the API client
vi.mock('@/api/client', () => ({
  api: {
    getEvents: vi.fn(),
    getWaiters: vi.fn(),
    login: vi.fn(),
    getStations: vi.fn(),
    getProducts: vi.fn(),
  },
}))

import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockEvents = [
  { id: 'evt1', name: 'Testfest', status: 'test', hidePrices: false, tseEnabled: false, lastTearOffNumber: 0, createdAt: '', updatedAt: '' },
  { id: 'evt2', name: 'Sommerfest', status: 'test', hidePrices: false, tseEnabled: false, lastTearOffNumber: 0, createdAt: '', updatedAt: '' },
]
const mockWaiters = [
  { id: 'wtr1', name: 'Alice', logo: null, eventId: 'evt1', printerId: null, pickupCode: null, printsImmediately: true, canCancel: false, canCashOut: false, canStatistics: false, canCreateWaiters: false, canTransfer: false, isStationWaiter: false, hidden: false, autoSammelbon: false, active: true },
]
const mockWaiters2 = [
  { id: 'wtr2', name: 'Bob', logo: null, eventId: 'evt2', printerId: null, pickupCode: null, printsImmediately: true, canCancel: false, canCashOut: false, canStatistics: false, canCreateWaiters: false, canTransfer: false, isStationWaiter: false, hidden: false, autoSammelbon: false, active: true },
]

describe('Session store clear() preserves adminToken', () => {
  beforeEach(() => {
    useSessionStore.setState({
      event: null,
      waiter: null,
      token: null,
      adminToken: null,
    })
  })

  it('clear() removes event, waiter, token but keeps adminToken', () => {
    // Set up a full session with adminToken
    useSessionStore.setState({
      event: mockEvents[0] as any,
      waiter: mockWaiters[0] as any,
      token: 'waiter-jwt',
      adminToken: 'admin-jwt',
    })

    // Call clear
    useSessionStore.getState().clear()

    const state = useSessionStore.getState()
    expect(state.event).toBeNull()
    expect(state.waiter).toBeNull()
    expect(state.token).toBeNull()
    expect(state.adminToken).toBe('admin-jwt') // preserved!
  })

  it('clear() on state without adminToken keeps it null', () => {
    useSessionStore.setState({
      event: mockEvents[0] as any,
      waiter: mockWaiters[0] as any,
      token: 'waiter-jwt',
      adminToken: null,
    })

    useSessionStore.getState().clear()

    const state = useSessionStore.getState()
    expect(state.event).toBeNull()
    expect(state.waiter).toBeNull()
    expect(state.token).toBeNull()
    expect(state.adminToken).toBeNull()
  })

  it('setSession sets event, waiter, token but does not touch adminToken', () => {
    useSessionStore.setState({ adminToken: 'admin-jwt' })

    useSessionStore.getState().setSession({
      event: mockEvents[0] as any,
      waiter: mockWaiters[0] as any,
      token: 'waiter-jwt',
    })

    const state = useSessionStore.getState()
    expect(state.event).toEqual(mockEvents[0])
    expect(state.waiter).toEqual(mockWaiters[0])
    expect(state.token).toBe('waiter-jwt')
    expect(state.adminToken).toBe('admin-jwt')
  })

  it('setAdminToken and clear() interact correctly', () => {
    useSessionStore.setState({ adminToken: 'admin-jwt' })
    useSessionStore.getState().setAdminToken('new-admin-jwt')

    expect(useSessionStore.getState().adminToken).toBe('new-admin-jwt')

    useSessionStore.getState().clear()

    expect(useSessionStore.getState().adminToken).toBe('new-admin-jwt')
  })
})

describe('Login flow', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset the real store
    useSessionStore.setState({
      event: null,
      waiter: null,
      token: null,
      adminToken: null,
    })
    vi.mocked(api.getEvents).mockResolvedValue(mockEvents as any)
    vi.mocked(api.getWaiters).mockImplementation((eventId: string) => {
      if (eventId === 'evt2') return Promise.resolve(mockWaiters2 as any)
      return Promise.resolve(mockWaiters as any)
    })
  })

  it('renders event selector populated from API', async () => {
    // Dynamic import to pick up mocked api
    const { default: Login } = await import('@/pages/Login')
    render(<Login navigate={vi.fn()} />)
    await waitFor(() => {
      expect(api.getEvents).toHaveBeenCalled()
    })
    const select = screen.getByTestId('event-select')
    const options = select.querySelectorAll('option')
    // placeholder + 2 events
    expect(options.length).toBe(3)
  })

  it('selecting an event loads waiters for that event', async () => {
    const { default: Login } = await import('@/pages/Login')
    render(<Login navigate={vi.fn()} />)
    await waitFor(() => expect(api.getEvents).toHaveBeenCalled())

    fireEvent.change(screen.getByTestId('event-select'), { target: { value: 'evt1' } })
    await waitFor(() => expect(api.getWaiters).toHaveBeenCalledWith('evt1'))

    const waiterSelect = screen.getByTestId('waiter-select')
    const options = waiterSelect.querySelectorAll('option')
    expect(options.length).toBe(2) // placeholder + Alice
    expect(options[1].textContent).toBe('Alice')
  })

  it('selecting a different event loads its waiters', async () => {
    const { default: Login } = await import('@/pages/Login')
    render(<Login navigate={vi.fn()} />)
    await waitFor(() => expect(api.getEvents).toHaveBeenCalled())

    fireEvent.change(screen.getByTestId('event-select'), { target: { value: 'evt2' } })
    await waitFor(() => expect(api.getWaiters).toHaveBeenCalledWith('evt2'))

    const waiterSelect = screen.getByTestId('waiter-select')
    const options = waiterSelect.querySelectorAll('option')
    expect(options.length).toBe(2) // placeholder + Bob
    expect(options[1].textContent).toBe('Bob')
  })

  it('successful login sets session correctly with event, waiter, and token', async () => {
    const mockNavigate = vi.fn()
    vi.mocked(api.login).mockResolvedValueOnce({
      token: 'waiter-jwt-token',
      waiter: mockWaiters[0] as any,
    })

    const { default: Login } = await import('@/pages/Login')
    render(<Login navigate={mockNavigate} />)
    await waitFor(() => expect(api.getEvents).toHaveBeenCalled())

    fireEvent.change(screen.getByTestId('event-select'), { target: { value: 'evt1' } })
    await waitFor(() => expect(api.getWaiters).toHaveBeenCalled())
    fireEvent.change(screen.getByTestId('waiter-select'), { target: { value: 'wtr1' } })
    fireEvent.change(screen.getByTestId('pin-input'), { target: { value: '1234' } })
    fireEvent.click(screen.getByTestId('login-button'))

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith('wtr1', '1234')
    })

    // Check that session was set correctly
    const state = useSessionStore.getState()
    expect(state.token).toBe('waiter-jwt-token')
    expect(state.waiter).toEqual(mockWaiters[0])
    expect(state.event?.id).toBe('evt1')
    expect(state.event?.name).toBe('Testfest')

    // Should navigate to order page
    expect(mockNavigate).toHaveBeenCalledWith('/order')
  })

  it('wrong PIN shows error and does not set session', async () => {
    vi.mocked(api.login).mockRejectedValueOnce(new Error('Invalid credentials'))

    const { default: Login } = await import('@/pages/Login')
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

    // Session should NOT have been set
    const state = useSessionStore.getState()
    expect(state.token).toBeNull()
    expect(state.waiter).toBeNull()
    expect(state.event).toBeNull()
  })

  it('clearing session on login page does not wipe adminToken', async () => {
    // Simulate admin being logged in
    useSessionStore.setState({ adminToken: 'admin-jwt' })

    const { default: Login } = await import('@/pages/Login')
    render(<Login navigate={vi.fn()} />)

    // clear() is called on mount — adminToken should survive
    const state = useSessionStore.getState()
    expect(state.adminToken).toBe('admin-jwt')
    expect(state.event).toBeNull()
    expect(state.waiter).toBeNull()
    expect(state.token).toBeNull()
  })
})
