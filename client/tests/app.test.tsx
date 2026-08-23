import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from '@/App'

// Mock the session store
vi.mock('@/stores/session', () => ({
  useSessionStore: (selector?: any) => {
    const state = {
      event: { id: 'evt1', name: 'Testfest', status: 'test', hidePrices: false, tseEnabled: false, lastTearOffNumber: 0, createdAt: '', updatedAt: '' },
      waiter: null,
      token: null,
      setEvent: vi.fn(),
      setWaiter: vi.fn(),
      setToken: vi.fn(),
      setSession: vi.fn(),
      clear: vi.fn(),
      isLoggedIn: () => false,
    }
    return selector ? selector(state) : state
  },
}))

// Mock the API
vi.mock('@/api/client', () => ({
  api: {
    getEvents: vi.fn().mockResolvedValue([]),
    getWaiters: vi.fn().mockResolvedValue([]),
    login: vi.fn(),
    getStations: vi.fn().mockResolvedValue([]),
  },
}))

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('App', () => {
  it('renders landing page with role tiles at root hash', async () => {
    window.location.hash = ''
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('tile-waiter')).toBeDefined()
      expect(screen.getByTestId('tile-station')).toBeDefined()
      expect(screen.getByTestId('tile-admin')).toBeDefined()
    })
  })

  it('renders login page at #/login', async () => {
    window.location.hash = '#/login'
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('waiter-select')).toBeDefined()
    })
  })
})