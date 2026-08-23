import { create } from 'zustand'

interface ThemeState {
  dark: boolean
  toggle: () => void
}

function getInitialDark(): boolean {
  try {
    return localStorage.getItem('theme-dark') === 'true'
  } catch {
    return false
  }
}

function applyDark(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
}

export const useThemeStore = create<ThemeState>((set) => ({
  dark: getInitialDark(),
  toggle: () =>
    set((state) => {
      const next = !state.dark
      try {
        localStorage.setItem('theme-dark', String(next))
      } catch { /* ignore */ }
      applyDark(next)
      return { dark: next }
    }),
}))

// Apply on initial load (module execution time)
applyDark(getInitialDark())
