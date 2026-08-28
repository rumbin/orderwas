import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { OpenTable } from '@/api/types'

function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

interface Props {
  tables: OpenTable[]
  currentTable: string | null
  onSelect: (tableNumber: string) => void
  onClose: () => void
}

export default function TableSwitcherModal({ tables, currentTable, onSelect, onClose }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        ref={ref}
        className="bg-white dark:bg-gray-800 rounded-t-lg sm:rounded-lg p-4 w-full max-w-md max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg mb-3 text-gray-900 dark:text-white">{t('cashier.tables')}</h3>
        {tables.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('cashier.noOpenItems')}</p>
        ) : (
          <ul className="space-y-1">
            {tables.map((tbl) => (
              <li key={tbl.tableNumber}>
                <button
                  onClick={() => onSelect(tbl.tableNumber)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition ${
                    currentTable === tbl.tableNumber
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Tisch {tbl.tableNumber}</span>
                    <span className="text-xs opacity-70">
                      {tbl.orderCount} {t('cashier.unpaidItems')}
                    </span>
                  </div>
                  <span className="text-xs font-mono">{formatCents(tbl.openSumCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  )
}
