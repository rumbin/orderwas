import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

interface ThemeCtx {
  dark: boolean
  toggle: () => void
}

const ThemeContext = createContext<ThemeCtx>({ dark: false, toggle: () => {} })

function getInitialDark(): boolean {
  try { return localStorage.getItem('theme-dark') === 'true' } catch { return false }
}

// Apply immediately (before React mounts)
const initialDark = getInitialDark()
document.documentElement.classList.toggle('dark', initialDark)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(initialDark)

  // Keep DOM in sync whenever dark changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev
      try { localStorage.setItem('theme-dark', String(next)) } catch {}
      return next
    })
  }, [])

  return <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>
}

export function useThemeStore() {
  return useContext(ThemeContext)
}
