import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/api/client', () => ({
  api: {
    getWaiters: vi.fn(),
    login: vi.fn(),
    getStations: vi.fn(),
    getProducts: vi.fn(),
  },
}))

import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockEvent = { id: 'evt1', name: 'Testfest', status: 'test', hidePrices: false, tseEnabled: false, lastTearOffNumber: 0, createdAt: '', updatedAt: '' }
const mockWaiters = [
  { id: 'wtr1', name: 'Alice', logo: null, eventId: 'evt1', printerId: null, pickupCode: null, printsImmediately: true, canCancel: false, canCashOut: false, canStatistics: false, canCreateWaiters: false, canTransfer: false, isStationWaiter: false, hidden: false, autoSammelbon: false, active: true },
]

describe('Session store clear() preserves adminToken', () => {
  beforeEach(() => {
    useSessionStore.setState({ event: null, waiter: null, token: null, adminToken: null })
  })

  it('clear() removes event, waiter, token but keeps adminToken', () => {
    useSessionStore.setState({ event: mockEvent as any, waiter: mockWaiters[0] as any, token: 'waiter-jwt', adminToken: 'admin-jwt' })
    useSessionStore.getState().clear()
    const state = useSessionStore.getState()
    expect(state.event).toBeNull()
    expect(state.waiter).toBeNull()
    expect(state.token).toBeNull()
    expect(state.adminToken).toBe('admin-jwt')
  })

  it('clear() on state without adminToken keeps it null', () => {
    useSessionStore.setState({ event: mockEvent as any, waiter: mockWaiters[0] as any, token: 'waiter-jwt', adminToken: null })
    useSessionStore.getState().clear()
    const state = useSessionStore.getState()
    expect(state.event).toBeNull()
    expect(state.adminToken).toBeNull()
  })

  it('setSession sets event, waiter, token but does not touch adminToken', () => {
    useSessionStore.setState({ adminToken: 'admin-jwt' })
    useSessionStore.getState().setSession({ event: mockEvent as any, waiter: mockWaiters[0] as any, token: 'waiter-jwt' })
    const state = useSessionStore.getState()
    expect(state.event).toEqual(mockEvent)
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
    useSessionStore.setState({ event: mockEvent as any, waiter: null, token: null, adminToken: null })
    vi.mocked(api.getWaiters).mockResolvedValue(mockWaiters as any)
  })

  it('loads waiters and shows buttons', async () => {
    const { default: Login } = await import('@/pages/Login')
    render(<Login navigate={vi.fn()} />)
    await waitFor(() => {
      expect(api.getWaiters).toHaveBeenCalledWith('evt1')
    })
    expect(screen.getByTestId('waiter-Alice')).toBeDefined()
  })

  it('successful login sets session and navigates', async () => {
    const mockNavigate = vi.fn()
    vi.mocked(api.login).mockResolvedValueOnce({ token: 'waiter-jwt-token', waiter: mockWaiters[0] as any })
    const { default: Login } = await import('@/pages/Login')
    render(<Login navigate={mockNavigate} />)
    await waitFor(() => expect(api.getWaiters).toHaveBeenCalled())
    fireEvent.click(screen.getByTestId('waiter-Alice'))
    fireEvent.change(screen.getByTestId('pin-input'), { target: { value: '1234' } })
    fireEvent.click(screen.getByTestId('login-button'))
    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith('wtr1', '1234')
      const state = useSessionStore.getState()
      expect(state.token).toBe('waiter-jwt-token')
      expect(state.event?.id).toBe('evt1')
      expect(mockNavigate).toHaveBeenCalledWith('/order')
    })
  })

  it('wrong PIN shows error and does not set session', async () => {
    vi.mocked(api.login).mockRejectedValueOnce(new Error('Invalid credentials'))
    const { default: Login } = await import('@/pages/Login')
    render(<Login navigate={vi.fn()} />)
    await waitFor(() => expect(api.getWaiters).toHaveBeenCalled())
    fireEvent.click(screen.getByTestId('waiter-Alice'))
    fireEvent.change(screen.getByTestId('pin-input'), { target: { value: '9999' } })
    fireEvent.click(screen.getByTestId('login-button'))
    await waitFor(() => {
      expect(screen.getByTestId('login-error')).toBeDefined()
    })
    expect(useSessionStore.getState().token).toBeNull()
  })
})
