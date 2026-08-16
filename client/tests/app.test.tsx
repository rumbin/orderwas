import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from '@/App'

// Mock the session store with all methods used by Login
vi.mock('@/stores/session', () => ({
  useSessionStore: (selector?: any) => {
    const state = {
      event: null,
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
  },
}))

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('App', () => {
  it('renders login page at root hash', async () => {
    window.location.hash = ''
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('event-select')).toBeDefined()
    })
  })
})