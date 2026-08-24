import type { Product } from '@/api/types'
import { useCartStore } from '@/stores/cart'
import { PRODUCT_COLORS, PRODUCT_BG_CLASSES } from '@/lib/productColors'
import { useRef } from 'react'

function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

interface Props {
  station: { id: string; name: string }
  products: Product[]
  t: (key: string) => string
  onAdd: (product: Product) => void
  onLongPress: (product: Product) => void
  sectionRef?: (el: HTMLDivElement | null) => void
}

export default function ProductSection({ station, products, t, onAdd, onLongPress, sectionRef }: Props) {
  const cart = useCartStore()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (
    <div
      ref={sectionRef}
      data-station-id={station.id}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-4">
        {products.filter((p) => p.available).map((product) => {
          const count = cart.items
            .filter((i) => i.product.id === product.id)
            .reduce((sum, i) => sum + i.quantity, 0)
          const outOfStock = product.stockMode === 'tracked' && product.stockCount <= 0
          const lowStock = product.stockMode === 'tracked' && product.stockCount > 0 && product.stockCount <= 5
          return (
            <div
              key={product.id}
              data-testid={`product-${product.name}`}
              className={`relative min-h-[88px] rounded-lg border-2 transition select-none ${
                outOfStock
                  ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 opacity-50'
                  : count > 0
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                    : product.color && PRODUCT_BG_CLASSES[product.color]
                      ? `border-gray-200 dark:border-gray-700 ${PRODUCT_BG_CLASSES[product.color]}`
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              style={product.color && PRODUCT_COLORS[product.color]
                ? { borderLeftColor: PRODUCT_COLORS[product.color], borderLeftWidth: '4px' }
                : undefined
              }
              onPointerDown={() => {
                timerRef.current = setTimeout(() => onLongPress(product), 500)
              }}
              onPointerUp={() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }}
              onPointerLeave={() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }}
            >
              {count > 0 && (
                <span className="absolute top-1 right-1 bg-blue-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold z-10">
                  {count}
                </span>
              )}
              <div className="flex items-stretch h-full">
                <button
                  onClick={() => {
                    const idx = cart.items.findIndex((i) => i.product.id === product.id)
                    if (idx >= 0) cart.decrementItem(idx)
                  }}
                  disabled={count === 0}
                  className="w-10 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-400 hover:text-red-500 disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed rounded-l-lg"
                  data-testid={`decrement-${product.name}`}
                >−</button>
                <div className="flex-1 py-2 px-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white text-sm leading-tight truncate">{product.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatCents(product.priceCents)}</div>
                  {product.extras?.length ? (
                    <div className="text-[10px] text-blue-600 mt-0.5">⚙ {product.extras.length} {t('order.extrasLabel')}</div>
                  ) : null}
                  {product.stockMode === 'tracked' && (
                    <div className={`text-[10px] mt-0.5 ${outOfStock ? 'text-red-600 font-medium' : lowStock ? 'text-amber-600' : 'text-gray-400 dark:text-gray-500'}`}>
                      {outOfStock ? t('order.outOfStock') : `${product.stockCount} ${t('order.inStock')}`}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => !outOfStock && onAdd(product)}
                  disabled={outOfStock}
                  className="w-10 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-400 hover:text-blue-600 disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed rounded-r-lg"
                  data-testid={`increment-${product.name}`}
                >+</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
