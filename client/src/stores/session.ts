import { create } from 'zustand'
import type { Event, Waiter } from '@/api/types'

interface SessionState {
  event: Event | null
  waiter: Waiter | null
  setEvent: (event: Event | null) => void
  setWaiter: (waiter: Waiter | null) => void
  clear: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  event: null,
  waiter: null,
  setEvent: (event) => set({ event }),
  setWaiter: (waiter) => set({ waiter }),
  clear: () => set({ event: null, waiter: null }),
}))