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

export const useThemeStore = create<ThemeState>((set, get) => ({
  dark: getInitialDark(),
  toggle: () => {
    const next = !get().dark
    try { localStorage.setItem('theme-dark', String(next)) } catch {}
    document.documentElement.classList.toggle('dark', next)
    set({ dark: next })
  },
}))

// Apply on load
document.documentElement.classList.toggle('dark', getInitialDark())
