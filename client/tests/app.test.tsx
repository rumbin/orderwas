import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from '@/App'
import { resetSessionState } from './helpers/session'

// Identity-stable store mock, logged out (see tests/helpers/session.ts).
vi.mock('@/stores/session', async () => {
  const { useSessionStoreMock } = await import('./helpers/session')
  return { useSessionStore: useSessionStoreMock }
})

beforeEach(() => {
  resetSessionState({ waiter: null, token: null })
})

// Mock the API
vi.mock('@/api/client', () => ({
  api: {
    getEvents: vi.fn().mockResolvedValue([]),
    getWaiters: vi.fn().mockResolvedValue([
      { id: 'wtr1', name: 'Alice', logo: null, eventId: 'evt1', printerId: null, pickupCode: null, printsImmediately: true, canCancel: false, canCashOut: false, canStatistics: false, canCreateWaiters: false, canTransfer: false, isStationWaiter: false, hidden: false, autoSammelbon: false, active: true },
    ]),
    login: vi.fn(),
    getStations: vi.fn().mockResolvedValue([]),
    getProducts: vi.fn().mockResolvedValue([]),
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
      expect(screen.getByTestId('waiter-Alice')).toBeDefined()
    })
  })
})