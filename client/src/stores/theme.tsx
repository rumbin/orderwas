import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface ThemeCtx {
  dark: boolean
  toggle: () => void
}

const ThemeContext = createContext<ThemeCtx>({ dark: false, toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('theme-dark') === 'true' } catch { return false }
  })

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev
      try { localStorage.setItem('theme-dark', String(next)) } catch {}
      document.documentElement.classList.toggle('dark', next)
      return next
    })
  }, [])

  // Apply on mount
  useState(() => {
    document.documentElement.classList.toggle('dark', dark)
  })

  return <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>
}

export function useThemeStore() {
  return useContext(ThemeContext)
}
