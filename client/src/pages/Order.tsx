import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { useCartStore } from '@/stores/cart'
import UserMenu from '@/components/UserMenu'
import ProductSection from '@/components/ProductSection'
import CartBar from '@/components/CartBar'
import VariantDialog from '@/components/VariantDialog'
import CashierView from '@/components/CashierView'
import { orderIdentifier, bonIsIdentifier, orderActorLabel } from '@/lib/orderIdentifier'
import type { Station, Product, Order } from '@/api/types'
import { formatPrice } from '@/lib/money'

function formatCents(cents: number): string {
  return formatPrice(cents)
}

const STATUS_I18N: Record<string, string> = {
  open: 'order.statusOpen', preparing: 'order.statusPreparing', partial: 'order.statusPartial',
  done: 'order.statusDone', paid: 'order.statusPaid', cancelled: 'order.statusCancelled', fertig: 'order.statusDone',
}
function statusText(status: string, t: (key: string) => string): string {
  return t(STATUS_I18N[status] ?? status)
}

export default function OrderPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useTranslation()
  const { event, waiter, setEvent } = useSessionStore()
  const cart = useCartStore()
  // Effects key on the event *id* (a primitive), never on the event object:
  // a new object identity from the store must not re-trigger every fetch.
  const eventId = event?.id ?? null
  const [stations, setStations] = useState<Station[]>([])
  const [sortedStations, setSortedStations] = useState<Station[]>([])
  const [products, setProducts] = useState<Record<string, Product[]>>({})
  const [activeStationId, setActiveStationId] = useState<string>('')
  const [tableNumber, setTableNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ tearOffNumber: number | null } | null>(null)
  const [error, setError] = useState('')
  const [variantDialogProduct, setVariantDialogProduct] = useState<Product | null>(null)
  const [variantDialogVariants, setVariantDialogVariants] = useState<{ variant: string; quantity: number }[]>([])
  const [newVariantInput, setNewVariantInput] = useState('')
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const newVariantInputRef = useRef<HTMLInputElement>(null)
  const tableInputRef = useRef<HTMLInputElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [tab, setTab] = useState<'new' | 'cashier' | 'orders'>('new')
  const [cashierTable, setCashierTable] = useState<string | null>(null)
  const [onlyMyOrders, setOnlyMyOrders] = useState(true)
  const [myOrders, setMyOrders] = useState<Order[]>([])
  const [myOrdersLoading, setMyOrdersLoading] = useState(false)

  // Counter (Theke) mode: sell against a Bon number instead of a table, and
  // cash out the single open Bon before the next order can be started.
  const isCounterMode = waiter?.isCounter === true
  const [bonNumber, setBonNumber] = useState('')
  // Primitive (not an object) so a re-fetch can never re-render in a loop.
  const [counterOpenOrderId, setCounterOpenOrderId] = useState<string | null>(null)
  const counterJumpedToCashier = useRef(false)

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    api.getStations(eventId).then(async (sts) => {
      if (cancelled) return
      const sorted = [...sts].sort((a, b) => a.sortOrder - b.sortOrder)
      setStations(sts)
      setSortedStations(sorted)
      if (sorted.length > 0) setActiveStationId(sorted[0].id)
      const productMap: Record<string, Product[]> = {}
      await Promise.all(sorted.map(async (st) => {
        const prods = await api.getProducts(st.id)
        if (!cancelled) productMap[st.id] = prods
      }))
      if (!cancelled) setProducts(productMap)
    })
    return () => { cancelled = true }
  }, [eventId])

  useEffect(() => {
    if (sortedStations.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-station-id')
            if (id) setActiveStationId(id)
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px' }
    )
    for (const st of sortedStations) {
      const el = sectionRefs.current.get(st.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sortedStations])

  const sectionRefCallbacks = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map())
  const getSectionRef = useCallback((id: string) => {
    // Create a new ref callback if one doesn't exist for this station.
    // Each callback closes over the specific id — safe across StrictMode re-mounts.
    if (!sectionRefCallbacks.current.has(id)) {
      const cb = (el: HTMLDivElement | null) => {
        if (el) sectionRefs.current.set(id, el)
        else sectionRefs.current.delete(id)
      }
      sectionRefCallbacks.current.set(id, cb)
    }
    return sectionRefCallbacks.current.get(id)!
  }, [])

  const scrollToStation = useCallback((id: string) => {
    const el = sectionRefs.current.get(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useCartStore.getState().items.some((i) => i.quantity > 0)) e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => setSuccess(null), 7000)
    return () => clearTimeout(timer)
  }, [success])

  useEffect(() => {
    if (tab === 'new' || !eventId) return
    setMyOrdersLoading(true)
    api.getOrders(eventId).then((all) => setMyOrders(all)).finally(() => setMyOrdersLoading(false))
  }, [tab, eventId])

  // Counter mode: pre-fill the Bon with the next tear-off number (still editable).
  const nextBon = (event?.lastTearOffNumber ?? 0) + 1
  useEffect(() => {
    if (!isCounterMode) return
    setBonNumber(String(nextBon))
  }, [isCounterMode, nextBon])

  // Counter mode: the Bon sold at the counter must be paid before the next order.
  const refreshCounterOpenBon = useCallback(async () => {
    if (!isCounterMode || !eventId) return
    try {
      const open = await api.getCounterUnpaid(eventId)
      setCounterOpenOrderId(open[0]?.orderId ?? null)
    } catch {
      setCounterOpenOrderId(null)
    }
  }, [isCounterMode, eventId])

  useEffect(() => { void refreshCounterOpenBon() }, [refreshCounterOpenBon])

  // Counter mode: an open Bon means the counter belongs on the cashier screen
  // (this also restores the right screen after a reload).
  useEffect(() => {
    if (!isCounterMode || !counterOpenOrderId || counterJumpedToCashier.current) return
    counterJumpedToCashier.current = true
    setTab('cashier')
  }, [isCounterMode, counterOpenOrderId])

  // Counter mode: the Bon is settled — back to taking the next order.
  const handleCounterPaymentComplete = useCallback(() => {
    setCounterOpenOrderId(null)
    setTab('new')
    cart.clear()
    if (eventId) api.getEvent(eventId).then(setEvent).catch(() => {})
  }, [eventId, setEvent, cart])

  const handleCancelOrder = async (orderId: string) => {
    try { await api.cancelOrder(orderId); setMyOrders((prev) => prev.filter((o) => o.id !== orderId)) }
    catch (err) { console.error('Cancel failed:', err) }
  }

  if (!event || !waiter) return null

  const allStationProducts = sortedStations.map((st) => ({ station: st, products: products[st.id] ?? [] }))
  const total = cart.total()

  const handleAddProduct = (product: Product) => { cart.addItem(product) }

  const openVariantDialog = (product: Product) => {
    const variants = cart.items.filter((i) => i.product.id === product.id)
      .map((i) => ({ variant: i.variant ?? 'Standard', quantity: i.quantity }))
    variants.sort((a, b) => { if (a.variant === 'Standard') return -1; if (b.variant === 'Standard') return 1; return 0 })
    if (variants.length === 0) variants.push({ variant: 'Standard', quantity: 0 })
    setVariantDialogVariants(variants)
    setVariantDialogProduct(product)
    setNewVariantInput('')
  }

  const adjustVariant = (variant: string, delta: number) => {
    if (!variantDialogProduct) return
    const exists = cart.items.some((i) => i.product.id === variantDialogProduct.id && (i.variant ?? 'Standard') === variant)
    if (!exists && delta > 0) cart.addItem(variantDialogProduct, undefined, variant === 'Standard' ? undefined : variant)
    else cart.setVariantQuantity(variantDialogProduct.id, variant, delta)
    setVariantDialogVariants((prev) => prev.map((v) => (v.variant === variant ? { ...v, quantity: v.quantity + delta } : v)).filter((v) => v.quantity > 0 || v.variant === 'Standard'))
  }

  const submitNewVariant = () => {
    if (!variantDialogProduct || !newVariantInput.trim()) return
    const v = newVariantInput.trim()
    const hasItems = cart.items.some((i) => i.product.id === variantDialogProduct.id)
    if (!hasItems) cart.addItem(variantDialogProduct, undefined, v)
    else { cart.addVariant(variantDialogProduct.id, v); cart.setVariantQuantity(variantDialogProduct.id, v, 1) }
    setVariantDialogVariants((prev) => [...prev, { variant: v, quantity: 1 }])
    setNewVariantInput('')
    setTimeout(() => newVariantInputRef.current?.focus(), 0)
  }

  const handleSubmit = async () => {
    const identifier = isCounterMode ? bonNumber : tableNumber
    if (!identifier || cart.items.length === 0) return
    setSubmitting(true); setError(''); setSuccess(null)
    try {
      const order = await api.createOrder({
        // Counter orders are sold against the Bon number instead of a table.
        ...(isCounterMode ? { tearOffNumber: Number(bonNumber) } : { tableNumber }),
        waiterId: waiter.id, eventId: event.id,
        items: cart.items.filter((i) => i.quantity > 0).map((item) => ({
          productId: item.product.id, quantity: item.quantity,
          comment: item.variant && item.variant !== 'Standard' ? item.variant : undefined,
          optionSelections: item.options?.map((o) => ({ extraId: o.extraId, optionId: o.optionId })),
        })),
      })
      setSuccess({ tearOffNumber: order.tearOffNumber }); cart.clear()
      // Keep the Bon pre-fill moving with the event's tear-off counter.
      api.getEvent(event.id).then(setEvent).catch(() => {})
      if (isCounterMode) {
        setBonNumber(String((order.tearOffNumber ?? 0) + 1))
        setCounterOpenOrderId(order.id)
        setCashierTable(null)
      } else {
        setTableNumber('')
        setCashierTable(order.tableNumber ?? null)
      }
      setTimeout(() => setTab('cashier'), 100)
    } catch (err) { setError((err as Error).message || 'Failed to submit order') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-32">
      {/* Header with tabs + avatar */}
      <div className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10 px-4 py-2 flex items-center gap-2">
        {(['new', 'cashier', 'orders'] as const).map((t2) => (
          <button key={t2} onClick={() => { setTab(t2); setSuccess(null) }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${tab === t2 ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
            {t(`order.tab${t2.charAt(0).toUpperCase() + t2.slice(1)}`)}
          </button>
        ))}
        <div className="ml-auto"><UserMenu /></div>
      </div>

      {/* Success toast — visible across all tabs */}
      {success && !error && (
        <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-green-600 text-white rounded-lg shadow-xl px-4 py-3 flex items-center z-30 animate-slide-up">
          <span className="font-medium">{t('order.success')}</span>
          {success.tearOffNumber != null && <span className="ml-2 font-bold">#{success.tearOffNumber}</span>}
        </div>
      )}

      {tab === 'new' && (
        <>
          {/* Station nav */}
          {sortedStations.length > 1 && (
            <div ref={navRef} className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex gap-2 sticky top-[49px] z-10 overflow-x-auto">
              {sortedStations.map((st) => (
                <button key={st.id} onClick={() => scrollToStation(st.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition ${activeStationId === st.id ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                  {st.name}
                </button>
              ))}
            </div>
          )}

          {/* Product sections */}
          {allStationProducts.map(({ station, products: stationProducts }, idx) => (
            <div key={station.id} className={idx > 0 ? 'border-t border-gray-200 dark:border-gray-700' : ''}>
              <ProductSection station={station} products={stationProducts} t={t} onAdd={handleAddProduct}
                onLongPress={openVariantDialog} sectionRef={getSectionRef(station.id)} />
            </div>
          ))}

          <CartBar tableNumber={tableNumber} onTableChange={setTableNumber} error={error} submitting={submitting}
            total={total} onSubmit={handleSubmit} onOpenVariant={openVariantDialog} t={t}
            isCounterMode={isCounterMode} bonNumber={bonNumber} onBonChange={setBonNumber}
            blocked={isCounterMode && counterOpenOrderId !== null}
            blockedHint={t('order.counterBlocked')} blockedActionLabel={t('order.toCashier')}
            onBlockedAction={() => setTab('cashier')} />
        </>
      )}

      {tab === 'cashier' && (
        isCounterMode
          ? <CashierView initialTable={null} isCounterMode onCounterPaymentComplete={handleCounterPaymentComplete} />
          : <CashierView initialTable={cashierTable} />
      )}

      {tab === 'orders' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <input type="checkbox" id="only-my-orders" checked={onlyMyOrders} onChange={(e) => setOnlyMyOrders(e.target.checked)} className="w-4 h-4 rounded" />
            <label htmlFor="only-my-orders" className="text-sm text-gray-700 dark:text-gray-300">{t('order.onlyMyOrders')}</label>
          </div>
          {myOrdersLoading ? <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('common.loading')}</p> : (
            <>
              {/* Open orders */}
              {(() => {
                const open = myOrders.filter((o) => {
                  if (onlyMyOrders && o.waiterId !== waiter?.id) return false
                  if (['paid', 'cancelled', 'done'].includes(o.status)) return false
                  return !(o.items.length > 0 && o.items.every((i) => ['prepared', 'delivered', 'cancelled'].includes(i.status)))
                }).sort((a, b) => (a.tearOffNumber ?? 0) - (b.tearOffNumber ?? 0))
                if (open.length === 0) return null
                return (
                  <>
                    <h3 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-2">{t('order.statusOpen')}</h3>
                    {open.map((order) => (
                      <div key={order.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">{orderIdentifier(order, t)}</span>
                            {order.waiter?.isCounter && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">{orderActorLabel(order.waiter, t)}</span>}
                            {order.tearOffNumber && !bonIsIdentifier(order) && <span className="text-xs text-gray-500">#{order.tearOffNumber}</span>}
                          </div>
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200">{statusText(order.status, t)}</span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          {order.items.map((item) => (
                            <div key={item.id} className={`flex justify-between ${item.status === 'cancelled' ? 'line-through text-gray-400' : ''}`}>
                              <span>{item.quantity}× {item.product.name}{item.comment && <span className="text-blue-600 dark:text-blue-400 text-xs ml-1">({item.comment})</span>}</span>
                            </div>
                          ))}
                        </div>
                        {order.waiterId === waiter?.id && (
                          <button onClick={() => handleCancelOrder(order.id)} className="mt-2 text-red-600 dark:text-red-400 text-sm underline">{t('order.cancelOrder')}</button>
                        )}
                      </div>
                    ))}
                  </>
                )
              })()}
              {/* Done orders */}
              {(() => {
                const done = myOrders.filter((o) => {
                  if (onlyMyOrders && o.waiterId !== waiter?.id) return false
                  if (['paid', 'cancelled', 'done'].includes(o.status)) return true
                  return o.items.length > 0 && o.items.every((i) => ['prepared', 'delivered', 'cancelled'].includes(i.status))
                }).sort((a, b) => (b.tearOffNumber ?? 0) - (a.tearOffNumber ?? 0))
                if (done.length === 0) return null
                return (
                  <>
                    <h3 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mt-4 mb-2">{t('order.statusDone')}</h3>
                    {done.map((order) => {
                      const allItemsDone = order.items.length > 0 && order.items.every((i) => ['prepared', 'delivered', 'cancelled'].includes(i.status))
                      const displayStatus = order.status === 'cancelled' ? 'cancelled' : order.status === 'paid' ? 'paid' : order.status === 'done' ? 'done' : allItemsDone ? 'fertig' : order.status
                      return (
                        <div key={order.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 opacity-70">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white">{orderIdentifier(order, t)}</span>
                              {order.waiter?.isCounter && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">{orderActorLabel(order.waiter, t)}</span>}
                              {order.tearOffNumber && !bonIsIdentifier(order) && <span className="text-xs text-gray-500">#{order.tearOffNumber}</span>}
                            </div>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${displayStatus === 'cancelled' ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200' : 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200'}`}>{statusText(displayStatus, t)}</span>
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
                    })}
                  </>
                )
              })()}
            </>
          )}
        </div>
      )}

      {variantDialogProduct && (
        <VariantDialog product={variantDialogProduct} variants={variantDialogVariants} newVariantInput={newVariantInput}
          onAdjust={adjustVariant} onInputChange={setNewVariantInput} onSubmitVariant={submitNewVariant}
          onClose={() => setVariantDialogProduct(null)} t={t} />
      )}
    </div>
  )
}
