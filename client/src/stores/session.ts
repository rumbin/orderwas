import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Event, Waiter } from '@/api/types'

interface SessionState {
  event: Event | null
  waiter: Waiter | null
  token: string | null
  adminToken: string | null
  setEvent: (event: Event | null) => void
  setWaiter: (waiter: Waiter | null) => void
  setToken: (token: string | null) => void
  setAdminToken: (token: string | null) => void
  setSession: (data: { event: Event; waiter: Waiter; token: string }) => void
  clear: () => void
  isLoggedIn: () => boolean
  isAdminLoggedIn: () => boolean
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      event: null,
      waiter: null,
      token: null,
      adminToken: null,
      setEvent: (event) => set({ event }),
      setWaiter: (waiter) => set({ waiter }),
      setToken: (token) => set({ token }),
      setAdminToken: (adminToken) => set({ adminToken }),
      setSession: (data) => set({ event: data.event, waiter: data.waiter, token: data.token }),
      clear: () => set((state) => ({ event: null, waiter: null, token: null, adminToken: state.adminToken })),
      isLoggedIn: () => Boolean(get().token && get().waiter),
      isAdminLoggedIn: () => Boolean(get().adminToken),
    }),
    { name: 'orderwas-session' },
  ),
)