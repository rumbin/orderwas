import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { useCartStore } from '@/stores/cart'
import type { Station, Product } from '@/api/types'

function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

export default function OrderPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useTranslation()
  const { event, waiter, clear } = useSessionStore()
  const cart = useCartStore()
  const [stations, setStations] = useState<Station[]>([])
  const [products, setProducts] = useState<Record<string, Product[]>>({})
  const [activeStation, setActiveStation] = useState<string>('')
  const [tableNumber, setTableNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ tearOffNumber: number | null } | null>(null)
  const [error, setError] = useState('')
  // Variant dialog
  const [variantDialogProduct, setVariantDialogProduct] = useState<Product | null>(null)
  const [variantDialogVariants, setVariantDialogVariants] = useState<{ variant: string; quantity: number }[]>([])
  const [newVariantInput, setNewVariantInput] = useState('')
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const newVariantInputRef = useRef<HTMLInputElement>(null)
  const tableInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!event) return
    api.getStations(event.id).then((sts) => {
      setStations(sts)
      if (sts.length > 0) setActiveStation(sts[0].id)
    })
  }, [event])

  useEffect(() => {
    if (!activeStation) return
    if (products[activeStation]) return
    api.getProducts(activeStation).then((prods) => {
      setProducts((prev) => ({ ...prev, [activeStation]: prods }))
    })
  }, [activeStation, products])

  // Warn before leaving with items in cart
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useCartStore.getState().items.some((i) => i.quantity > 0)) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  if (!event || !waiter) return null

  const activeProducts = products[activeStation] ?? []
  const total = cart.total()

  const handleAddProduct = (product: Product) => {
    setSuccess(null)
    cart.addItem(product)
  }

  const openVariantDialog = (product: Product) => {
    const variants = cart.items
      .filter((i) => i.product.id === product.id)
      .map((i) => ({ variant: i.variant ?? 'Standard', quantity: i.quantity }))
    // Ensure "Standard" always appears first if present, then others
    variants.sort((a, b) => {
      if (a.variant === 'Standard') return -1
      if (b.variant === 'Standard') return 1
      return 0
    })
    if (variants.length === 0) {
      variants.push({ variant: 'Standard', quantity: 0 })
    }
    setVariantDialogVariants(variants)
    setVariantDialogProduct(product)
    setNewVariantInput('')
  }

  const adjustVariant = (variant: string, delta: number) => {
    if (!variantDialogProduct) return
    // If no cart item exists yet for this variant, create one first
    const exists = cart.items.some(
      (i) => i.product.id === variantDialogProduct.id && (i.variant ?? 'Standard') === variant,
    )
    if (!exists && delta > 0) {
      cart.addItem(variantDialogProduct, undefined, variant === 'Standard' ? undefined : variant)
    } else {
      cart.setVariantQuantity(variantDialogProduct.id, variant, delta)
    }
    setVariantDialogVariants((prev) =>
      prev
        .map((v) => (v.variant === variant ? { ...v, quantity: v.quantity + delta } : v))
        .filter((v) => v.quantity > 0 || v.variant === 'Standard'),
    )
  }

  const submitNewVariant = () => {
    if (!variantDialogProduct || !newVariantInput.trim()) return
    const v = newVariantInput.trim()
    // If no items exist for this product yet, addItem creates the first one
    const hasItems = cart.items.some((i) => i.product.id === variantDialogProduct.id)
    if (!hasItems) {
      cart.addItem(variantDialogProduct, undefined, v)
    } else {
      cart.addVariant(variantDialogProduct.id, v)
      cart.setVariantQuantity(variantDialogProduct.id, v, 1)
    }
    setVariantDialogVariants((prev) => [...prev, { variant: v, quantity: 1 }])
    setNewVariantInput('')
    setTimeout(() => newVariantInputRef.current?.focus(), 0)
  }

  const handleSubmit = async () => {
    if (!tableNumber || cart.items.length === 0) return
    setSubmitting(true)
    setError('')
    setSuccess(null)
    try {
      const order = await api.createOrder({
        tableNumber,
        waiterId: waiter.id,
        eventId: event.id,
        items: cart.items.filter((i) => i.quantity > 0).map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          comment: item.variant && item.variant !== 'Standard' ? item.variant : undefined,
          optionSelections: item.options?.map((o) => ({ extraId: o.extraId, optionId: o.optionId })),
        })),
      })
      setSuccess({ tearOffNumber: order.tearOffNumber })
      cart.clear()
      setTableNumber('')
    } catch (err) {
      setError((err as Error).message || 'Failed to submit order')
    } finally {
      setSubmitting(false)
    }
  }

  const startNextOrder = () => {
    setSuccess(null)
    tableInputRef.current?.focus()
  }


  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">{event.name}</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{waiter.name}</span>
          <button onClick={() => navigate('/orders')} className="text-sm text-blue-600">
            {t('order.myOrders')}
          </button>
          <button onClick={() => { clear(); navigate('/') }} className="text-sm text-gray-400 hover:text-gray-700">
            {t('common.logout') ?? 'Abmelden'}
          </button>
        </div>
      </div>

      {/* Success banner with tear-off + next-order button */}
      {success && !error && (
        <div className="sticky top-[57px] z-10 bg-green-50 border-b border-green-200 px-4 py-3 flex items-center justify-between">
          <div className="text-green-800">
            <span className="font-medium">{t('order.success')}</span>
            {success.tearOffNumber != null && (
              <span className="ml-2 font-bold">#{success.tearOffNumber}</span>
            )}
          </div>
          <button
            onClick={startNextOrder}
            className="bg-green-600 text-white rounded-md px-4 py-2 font-medium"
            data-testid="next-order"
          >
            {t('order.newOrder')}
          </button>
        </div>
      )}

      {/* Station tabs */}
      {stations.length > 1 && (
        <div className="flex gap-1 px-4 py-2 bg-white border-b overflow-x-auto">
          {stations.map((st) => (
            <button
              key={st.id}
              onClick={() => setActiveStation(st.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${
                activeStation === st.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {st.name}
            </button>
          ))}
        </div>
      )}

      {/* Product grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-4">
        {activeProducts.filter((p) => p.available).map((product) => {
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
                  ? 'border-gray-200 bg-gray-100 opacity-50'
                  : count > 0
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
              onPointerDown={() => {
                longPressTimer.current = setTimeout(() => {
                  openVariantDialog(product)
                }, 500)
              }}
              onPointerUp={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
              onPointerLeave={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
            >
              {/* Count badge — upper-right corner */}
              {count > 0 && (
                <span className="absolute top-1 right-1 bg-blue-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold z-10">
                  {count}
                </span>
              )}
              <div className="flex items-stretch h-full">
                {/* Decrement */}
                <button
                  onClick={() => {
                    const idx = cart.items.findIndex((i) => i.product.id === product.id)
                    if (idx >= 0) cart.decrementItem(idx)
                  }}
                  disabled={count === 0}
                  className="w-10 flex items-center justify-center text-lg font-bold text-gray-600 hover:text-red-500 disabled:text-gray-300 disabled:cursor-not-allowed rounded-l-lg"
                  data-testid={`decrement-${product.name}`}
                >
                  −
                </button>

                {/* Product info */}
                <div className="flex-1 py-2 px-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm leading-tight truncate">{product.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{formatCents(product.priceCents)}</div>
                  {product.extras?.length ? (
                    <div className="text-[10px] text-blue-600 mt-0.5">⚙ {product.extras.length} {t('order.extrasLabel')}</div>
                  ) : null}
                  {product.stockMode === 'tracked' && (
                    <div className={`text-[10px] mt-0.5 ${outOfStock ? 'text-red-600 font-medium' : lowStock ? 'text-amber-600' : 'text-gray-400'}`}>
                      {outOfStock ? t('order.outOfStock') : `${product.stockCount} ${t('order.inStock')}`}
                    </div>
                  )}
                </div>

                {/* Increment */}
                <button
                  onClick={() => !outOfStock && handleAddProduct(product)}
                  disabled={outOfStock}
                  className="w-10 flex items-center justify-center text-lg font-bold text-gray-600 hover:text-blue-600 disabled:text-gray-300 disabled:cursor-not-allowed rounded-r-lg"
                  data-testid={`increment-${product.name}`}
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Cart bar (fixed bottom) */}
      {cart.items.filter((i) => i.quantity > 0).length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-20">
          {error && (
            <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{error}</div>
          )}
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            <input
              ref={tableInputRef}
              type="text"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder={t('order.tableNumber')}
              className="flex-shrink-0 w-32 rounded-md border border-gray-300 p-2 text-lg"
              data-testid="table-number-input"
            />
            <div className="flex-1 overflow-x-auto">
              <div className="flex gap-2">
                {(() => {
                  // Group cart items by product
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
                        className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1 text-sm whitespace-nowrap"
                        data-testid="cart-item"
                      >
                        <button
                          onClick={() => openVariantDialog(product)}
                          className="hover:text-blue-600"
                          title={t('order.editComment')}
                        >
                          <span>{display}</span>
                        </button>
                        <button
                          onClick={() => {
                            // Decrement the first variant (standard fallback)
                            const firstIdx = items[0]?.idx
                            if (firstIdx != null) cart.decrementItem(firstIdx)
                          }}
                          className="ml-1 text-gray-500 hover:text-red-500"
                        >
                          −
                        </button>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs text-gray-500">{t('order.total')}</div>
              <div className="font-bold text-lg text-gray-900">{formatCents(total)}</div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting || !tableNumber || cart.items.filter((i) => i.quantity > 0).length === 0}
              className="bg-blue-600 text-white rounded-md py-2 px-4 font-medium disabled:opacity-50 flex-shrink-0"
              data-testid="submit-order"
            >
              {submitting ? t('common.loading') : t('order.submit')}
            </button>
          </div>
        </div>
      )}

      {/* Variant dialog — long-press shows per-variant quantities */}
      {variantDialogProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-40" onClick={() => setVariantDialogProduct(null)}>
          <div className="bg-white rounded-t-lg sm:rounded-lg p-4 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-3">{variantDialogProduct.name}</h3>
            {variantDialogVariants.map((v) => (
              <div key={v.variant} className="flex items-center justify-between py-2 border-b last:border-b-0">
                <span className="text-sm flex-1 min-w-0 truncate">{v.variant}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustVariant(v.variant, -1)}
                    className="w-8 h-8 rounded bg-gray-100 hover:bg-red-100 text-sm font-bold flex items-center justify-center"
                  >−</button>
                  <span className="w-6 text-center text-sm font-bold">{v.quantity}</span>
                  <button
                    onClick={() => adjustVariant(v.variant, 1)}
                    className="w-8 h-8 rounded bg-gray-100 hover:bg-blue-100 text-sm font-bold flex items-center justify-center"
                  >+</button>
                </div>
              </div>
            ))}
            <div className="flex gap-2 mt-4">
              <input
                ref={newVariantInputRef}
                type="text"
                value={newVariantInput}
                onChange={(e) => setNewVariantInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitNewVariant() }}
                placeholder={t('order.newVariantPlaceholder') ?? 'Neue Variante...'}
                className="flex-1 rounded-md border border-gray-300 p-2 text-sm"
              />
              <button
                onClick={submitNewVariant}
                disabled={!newVariantInput.trim()}
                className="bg-blue-600 text-white rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                +
              </button>
            </div>
            {/* Predefined extras as quick-add buttons */}
            {variantDialogProduct.extras && variantDialogProduct.extras.length > 0 && (
              <div className="mt-3 space-y-2">
                {variantDialogProduct.extras.map((extra) => (
                  <div key={extra.id}>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{extra.name}</div>
                    <div className="flex flex-wrap gap-1">
                      {extra.options.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => {
                            const sep = newVariantInput.trim() ? ' ' : ''
                            setNewVariantInput((prev) => prev.trim() + sep + option.name)
                            newVariantInputRef.current?.focus()
                          }}
                          className="bg-gray-100 hover:bg-blue-100 text-xs px-2 py-1 rounded border border-gray-200"
                        >
                          {option.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setVariantDialogProduct(null)}
              className="w-full mt-3 bg-gray-100 rounded-md py-2.5 text-sm font-medium"
            >
              {t('order.confirmVariants')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}