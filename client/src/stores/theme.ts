import { create } from 'zustand'

interface ThemeState {
  dark: boolean
  toggle: () => void
}

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('theme-dark') : null

export const useThemeStore = create<ThemeState>((set) => ({
  dark: stored === 'true',
  toggle: () =>
    set((state) => {
      const next = !state.dark
      localStorage.setItem('theme-dark', String(next))
      return { dark: next }
    }),
}))
