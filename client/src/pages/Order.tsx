import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { useCartStore } from '@/stores/cart'
import UserMenu from '@/components/UserMenu'
import type { Station, Product, Order } from '@/api/types'

function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

export default function OrderPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useTranslation()
  const { event, waiter, token, clear } = useSessionStore()
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
  // Tab state
  const [tab, setTab] = useState<'new' | 'open' | 'done'>('new')
  const [onlyMyOrders, setOnlyMyOrders] = useState(true)
  const [myOrders, setMyOrders] = useState<Order[]>([])
  const [myOrdersLoading, setMyOrdersLoading] = useState(false)

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

  // Auto-dismiss success after 7 seconds
  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => setSuccess(null), 7000)
    return () => clearTimeout(timer)
  }, [success])

  // Load orders when switching to open/done tabs
  useEffect(() => {
    if (tab === 'new' || !event) return
    setMyOrdersLoading(true)
    api.getOrders(event.id).then((all) => {
      setMyOrders(all.filter((o) => o.waiterId === waiter?.id))
    }).finally(() => setMyOrdersLoading(false))
  }, [tab, event, waiter])

  const handleCancelOrder = async (orderId: string) => {
    try {
      await api.cancelOrder(orderId, token!)
      setMyOrders((prev) => prev.filter((o) => o.id !== orderId))
    } catch (err) {
      console.error('Cancel failed:', err)
    }
  }

  if (!event || !waiter) return null

  const activeProducts = products[activeStation] ?? []
  const total = cart.total()

  const handleAddProduct = (product: Product) => {
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


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-32">
      {/* Header with tabs + avatar */}
      <div className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10 px-4 py-2 flex items-center gap-2">
        {(['new', 'open', 'done'] as const).map((t2) => (
          <button
            key={t2}
            onClick={() => { setTab(t2); setSuccess(null) }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${
              tab === t2
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            {t(`order.tab${t2.charAt(0).toUpperCase() + t2.slice(1)}`)}
          </button>
        ))}
        <div className="ml-auto"><UserMenu /></div>
      </div>

      {/* === NEW ORDER TAB === */}
      {tab === 'new' && (
        <>
      {/* Success toast — slides in from bottom */}
      {success && !error && (
        <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-green-600 text-white rounded-lg shadow-xl px-4 py-3 flex items-center justify-between z-30 animate-slide-up">
          <div>
            <span className="font-medium">{t('order.success')}</span>
            {success.tearOffNumber != null && (
              <span className="ml-2 font-bold">#{success.tearOffNumber}</span>
            )}
          </div>
        </div>
      )}

      {/* Station tabs */}
      {stations.length > 1 && (
        <div className="flex gap-1 px-4 py-2 bg-white dark:bg-gray-800 border-b dark:border-gray-700 overflow-x-auto">
          {stations.map((st) => (
            <button
              key={st.id}
              onClick={() => setActiveStation(st.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${
                activeStation === st.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
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
                  ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 opacity-50'
                  : count > 0
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
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
                  className="w-10 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-400 hover:text-red-500 disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed rounded-l-lg"
                  data-testid={`decrement-${product.name}`}
                >
                  −
                </button>

                {/* Product info */}
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

                {/* Increment */}
                <button
                  onClick={() => !outOfStock && handleAddProduct(product)}
                  disabled={outOfStock}
                  className="w-10 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-400 hover:text-blue-600 disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed rounded-r-lg"
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
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t dark:border-gray-700 shadow-lg p-4 z-20">
          {error && (
            <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm rounded">{error}</div>
          )}
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            <input
              ref={tableInputRef}
              type="text"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder={t('order.tableNumber')}
              className="flex-shrink-0 w-32 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 text-lg"
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
                        className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 text-sm whitespace-nowrap"
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
                          className="ml-1 text-gray-500 dark:text-gray-400 hover:text-red-500"
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
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('order.total')}</div>
              <div className="font-bold text-lg text-gray-900 dark:text-white">{formatCents(total)}</div>
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
        </>
      )}

      {/* === OPEN ORDERS TAB === */}
      {tab === 'open' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <input type="checkbox" id="only-my-open" checked={onlyMyOrders}
              onChange={(e) => setOnlyMyOrders(e.target.checked)}
              className="w-4 h-4 rounded" />
            <label htmlFor="only-my-open" className="text-sm text-gray-700 dark:text-gray-300">
              {t('order.onlyMyOrders')}
            </label>
          </div>
          {myOrdersLoading ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('common.loading')}</p>
          ) : (
            (() => {
              const open = myOrders
                .filter((o) => {
                  if (['paid', 'cancelled', 'done'].includes(o.status)) return false
                  // Done if ALL items are prepared/delivered/cancelled
                  const allDone = o.items.length > 0 && o.items.every((i) => ['prepared', 'delivered', 'cancelled'].includes(i.status))
                  return !allDone
                })
                .sort((a, b) => (a.tearOffNumber ?? 0) - (b.tearOffNumber ?? 0))
              if (open.length === 0) return <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('order.empty')}</p>
              return open.map((order) => (
                <div key={order.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {t('station.table')} {order.tableNumber ?? order.pickupCode}
                      </span>
                      {order.tearOffNumber && <span className="text-xs text-gray-500">#{order.tearOffNumber}</span>}
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200">
                      {order.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {order.items.map((item) => (
                      <div key={item.id} className={`flex justify-between ${item.status === 'cancelled' ? 'line-through text-gray-400' : ''}`}>
                        <span>{item.quantity}× {item.product.name}{item.comment && <span className="text-blue-600 dark:text-blue-400 text-xs ml-1">({item.comment})</span>}</span>
                      </div>
                    ))}
                  </div>
                  {order.waiterId === waiter?.id && (
                    <button onClick={() => handleCancelOrder(order.id)}
                      className="mt-2 text-red-600 dark:text-red-400 text-sm underline">
                      {t('order.cancelOrder')}
                    </button>
                  )}
                </div>
              ))
            })()
          )}
        </div>
      )}

      {/* === DONE ORDERS TAB === */}
      {tab === 'done' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <input type="checkbox" id="only-my-done" checked={onlyMyOrders}
              onChange={(e) => setOnlyMyOrders(e.target.checked)}
              className="w-4 h-4 rounded" />
            <label htmlFor="only-my-done" className="text-sm text-gray-700 dark:text-gray-300">
              {t('order.onlyMyOrders')}
            </label>
          </div>
          {myOrdersLoading ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('common.loading')}</p>
          ) : (
            (() => {
              const done = myOrders
                .filter((o) => {
                  if (['paid', 'cancelled', 'done'].includes(o.status)) return true
                  // Also done if ALL items are prepared/delivered/cancelled
                  return o.items.length > 0 && o.items.every((i) => ['prepared', 'delivered', 'cancelled'].includes(i.status))
                })
                .sort((a, b) => (b.tearOffNumber ?? 0) - (a.tearOffNumber ?? 0))
              if (done.length === 0) return <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('order.empty')}</p>
              return done.map((order) => {
                const allItemsDone = order.items.length > 0 && order.items.every((i) => ['prepared', 'delivered', 'cancelled'].includes(i.status))
                const displayStatus = order.status === 'cancelled' ? 'cancelled'
                  : order.status === 'paid' ? 'paid'
                  : order.status === 'done' ? 'done'
                  : allItemsDone ? 'fertig' : order.status
                return (
                <div key={order.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 opacity-70">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {t('station.table')} {order.tableNumber ?? order.pickupCode}
                      </span>
                      {order.tearOffNumber && <span className="text-xs text-gray-500">#{order.tearOffNumber}</span>}
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      displayStatus === 'cancelled' ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200'
                        : 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200'
                    }`}>
                      {displayStatus}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {order.items.map((item) => (
                      <div key={item.id} className={`flex justify-between ${item.status === 'cancelled' ? 'line-through text-gray-400' : ''}`}>
                        <span>{item.quantity}× {item.product.name}</span>
                        <span>{item.status === 'prepared' || item.status === 'delivered' ? '✓' : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
              })
            })()
          )}
        </div>
      )}

      {/* Variant dialog — long-press shows per-variant quantities */}
      {variantDialogProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-40" onClick={() => setVariantDialogProduct(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-t-lg sm:rounded-lg p-4 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-3 text-gray-900 dark:text-white">{variantDialogProduct.name}</h3>
            {variantDialogVariants.map((v) => (
              <div key={v.variant} className="flex items-center justify-between py-2 border-b dark:border-gray-700 last:border-b-0">
                <span className="text-sm flex-1 min-w-0 truncate text-gray-900 dark:text-gray-300">{v.variant}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustVariant(v.variant, -1)}
                    className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 hover:bg-red-100 dark:hover:bg-red-900/40 text-sm font-bold flex items-center justify-center"
                  >−</button>
                  <span className="w-6 text-center text-sm font-bold text-gray-900 dark:text-white">{v.quantity}</span>
                  <button
                    onClick={() => adjustVariant(v.variant, 1)}
                    className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-sm font-bold flex items-center justify-center"
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
                className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 text-sm"
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
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{extra.name}</div>
                    <div className="flex flex-wrap gap-1">
                      {extra.options.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => {
                            const sep = newVariantInput.trim() ? ' ' : ''
                            setNewVariantInput((prev) => prev.trim() + sep + option.name)
                            newVariantInputRef.current?.focus()
                          }}
                          className="bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600"
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
              className="w-full mt-3 bg-gray-100 dark:bg-gray-700 rounded-md py-2.5 text-sm font-medium text-gray-900 dark:text-white"
            >
              {t('order.confirmVariants')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}