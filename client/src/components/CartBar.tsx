import { useCartStore } from '@/stores/cart'
import type { Product } from '@/api/types'

function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

interface Props {
  tableNumber: string
  onTableChange: (v: string) => void
  error: string
  submitting: boolean
  total: number
  onSubmit: () => void
  onOpenVariant: (product: Product) => void
  t: (key: string) => string
}

export default function CartBar({ tableNumber, onTableChange, error, submitting, total, onSubmit, onOpenVariant, t }: Props) {
  const cart = useCartStore()

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t dark:border-gray-700 shadow-lg p-4 z-20">
      {error && (
        <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm rounded">{error}</div>
      )}
      <div className="flex items-center gap-3 max-w-2xl mx-auto">
        <input
          type="text"
          value={tableNumber}
          onChange={(e) => onTableChange(e.target.value)}
          placeholder={t('order.tableNumber')}
          className="flex-shrink-0 w-32 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 text-lg"
          data-testid="table-number-input"
        />
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-2">
            {(() => {
              const grouped = new Map<string, { product: Product; items: { variant: string; quantity: number; idx: number }[] }>()
              cart.items.forEach((item, idx) => {
                if (item.quantity <= 0) return
                const pid = item.product.id
                if (!grouped.has(pid)) grouped.set(pid, { product: item.product, items: [] })
                grouped.get(pid)!.items.push({ variant: item.variant ?? 'Standard', quantity: item.quantity, idx })
              })
              return Array.from(grouped.values()).map(({ product, items }) => {
                const totalCount = items.reduce((s, i) => s + i.quantity, 0)
                const variants = items.map((i) => i.variant)
                const display = totalCount === 1
                  ? (variants[0] === 'Standard' ? product.name : `${product.name} (${variants[0]})`)
                  : (variants.length === 1 && variants[0] === 'Standard'
                      ? `${totalCount}× ${product.name}`
                      : `${totalCount}× ${product.name} (${items.map((i) => `${i.quantity}× ${i.variant}`).join(', ')})`)
                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 text-sm whitespace-nowrap"
                    data-testid="cart-item"
                  >
                    <button onClick={() => onOpenVariant(product)} className="hover:text-blue-600" title={t('order.editComment')}>
                      <span>{display}</span>
                    </button>
                    <button
                      onClick={() => { const firstIdx = items[0]?.idx; if (firstIdx != null) cart.decrementItem(firstIdx) }}
                      className="ml-1 text-gray-500 dark:text-gray-400 hover:text-red-500"
                    >−</button>
                  </div>
                )
              })
            })()}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t('order.total')}</div>
          <div className="font-bold text-lg text-gray-900 dark:text-white">{formatCents(total)}</div>
        </div>
        <button
          onClick={onSubmit}
          disabled={submitting || !tableNumber || cart.items.filter((i) => i.quantity > 0).length === 0}
          className="bg-blue-600 text-white rounded-md py-2 px-4 font-medium disabled:opacity-50 flex-shrink-0"
          data-testid="submit-order"
        >
          {submitting ? t('common.loading') : t('order.submit')}
        </button>
      </div>
    </div>
  )
}
