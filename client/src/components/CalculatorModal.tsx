import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { formatPrice } from '@/lib/money'

function formatCents(cents: number): string {
  return formatPrice(cents)
}

/** Parse a German-style decimal input ('20,50') into integer cents. */
function parseCents(input: string): number {
  const normalized = input.replace(',', '.').replace(/[^\d.]/g, '')
  const num = parseFloat(normalized)
  if (isNaN(num)) return 0
  return Math.round(num * 100)
}

/** Split `total` cents into `n` parts: floor division, remainder to first parts. */
function splitCents(total: number, n: number): number[] {
  const base = Math.floor(total / n)
  const remainder = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0))
}

interface Props {
  sumCents: number
  onClose: () => void
}

export default function CalculatorModal({ sumCents, onClose }: Props) {
  const { t } = useTranslation()
  const [received, setReceived] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const receivedCents = parseCents(received)
  const change = receivedCents - sumCents
  const split2 = splitCents(sumCents, 2)
  const split3 = splitCents(sumCents, 3)

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        ref={ref}
        className="bg-white dark:bg-gray-800 rounded-t-lg sm:rounded-lg p-4 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-white">{t('cashier.calculator')}</h3>

        {/* Sum */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{t('cashier.sum')}</span>
          <span className="text-lg font-bold text-gray-900 dark:text-white">{formatCents(sumCents)}</span>
        </div>

        {/* Received input */}
        <div className="mb-4">
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{t('cashier.received')}</label>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            placeholder={t('cashier.receivedPlaceholder')}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2.5 text-lg font-mono"
          />
        </div>

        {/* Change */}
        {receivedCents > 0 && (
          <div className="flex items-center justify-between mb-4 px-1">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {change >= 0 ? t('cashier.change') : t('cashier.changeMissing')}
            </span>
            <span className={`text-lg font-bold ${change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatCents(Math.abs(change))}
            </span>
          </div>
        )}

        {/* Split buttons */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between rounded-lg bg-gray-100 dark:bg-gray-700 px-3 py-2">
            <span className="text-sm text-gray-700 dark:text-gray-300">{t('cashier.split2')}</span>
            <span className="text-sm font-mono text-gray-900 dark:text-white">{formatCents(split2[0])} {t('cashier.perPerson')}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-gray-100 dark:bg-gray-700 px-3 py-2">
            <span className="text-sm text-gray-700 dark:text-gray-300">{t('cashier.split3')}</span>
            <span className="text-sm font-mono text-gray-900 dark:text-white">{formatCents(split3[0])} {t('cashier.perPerson')}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-gray-100 dark:bg-gray-700 rounded-md py-2.5 text-sm font-medium text-gray-900 dark:text-white"
        >
          {t('order.confirmVariants') ?? 'Schließen'}
        </button>
      </div>
    </div>,
    document.body,
  )
}
