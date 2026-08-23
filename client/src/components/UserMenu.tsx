import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useSessionStore } from '@/stores/session'
import { useThemeStore } from '@/stores/theme'

export default function UserMenu() {
  const { t } = useTranslation()
  const { waiter, clear } = useSessionStore()
  const { dark, toggle } = useThemeStore()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (btnRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
  }, [open])

  if (!waiter) return null

  const initial = waiter.name.charAt(0).toUpperCase()

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm"
        data-testid="user-menu-button"
      >
        {initial}
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 py-2 w-56"
          style={{ top: menuPos.top, right: menuPos.right, zIndex: 99999 }}
        >
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-900 dark:text-white">{waiter.name}</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); toggle(); setOpen(false) }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <span>{dark ? '☀️' : '🌙'}</span>
            <span>{dark ? (t('theme.light') ?? 'Hell') : (t('theme.dark') ?? 'Dunkel')}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); clear(); window.location.hash = '#/' }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
            data-testid="logout-button"
          >
            {t('common.logout') ?? 'Abmelden'}
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}
