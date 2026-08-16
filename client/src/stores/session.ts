import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Event, Waiter } from '@/api/types'

interface SessionState {
  event: Event | null
  waiter: Waiter | null
  token: string | null
  setEvent: (event: Event | null) => void
  setWaiter: (waiter: Waiter | null) => void
  setToken: (token: string | null) => void
  setSession: (data: { event: Event; waiter: Waiter; token: string }) => void
  clear: () => void
  isLoggedIn: () => boolean
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      event: null,
      waiter: null,
      token: null,
      setEvent: (event) => set({ event }),
      setWaiter: (waiter) => set({ waiter }),
      setToken: (token) => set({ token }),
      setSession: (data) => set({ event: data.event, waiter: data.waiter, token: data.token }),
      clear: () => set({ event: null, waiter: null, token: null }),
      isLoggedIn: () => Boolean(get().token && get().waiter),
    }),
    { name: 'orderwas-session' },
  ),
)