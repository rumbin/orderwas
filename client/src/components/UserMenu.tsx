import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSessionStore } from '@/stores/session'
import { useThemeStore } from '@/stores/theme'

export default function UserMenu() {
  const { t } = useTranslation()
  const { waiter, clear } = useSessionStore()
  const { dark, toggle } = useThemeStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!waiter) return null

  const initial = waiter.name.charAt(0).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm"
        data-testid="user-menu-button"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-11 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 w-56 z-50">
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-900 dark:text-white">{waiter.name}</div>
          </div>
          <button
            onClick={toggle}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <span>{dark ? '☀️' : '🌙'}</span>
            <span>{dark ? (t('theme.light') ?? 'Hell') : (t('theme.dark') ?? 'Dunkel')}</span>
          </button>
          <button
            onClick={() => { clear(); window.location.hash = '#/' }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
            data-testid="logout-button"
          >
            {t('common.logout') ?? 'Abmelden'}
          </button>
        </div>
      )}
    </div>
  )
}
