import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { useCartStore } from '@/stores/cart'
import UserMenu from '@/components/UserMenu'
import ProductSection from '@/components/ProductSection'
import CartBar from '@/components/CartBar'
import VariantDialog from '@/components/VariantDialog'
import type { Station, Product, Order } from '@/api/types'

function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
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
  const { event, waiter, token, clear } = useSessionStore()
  const cart = useCartStore()
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
  const [tab, setTab] = useState<'new' | 'open' | 'done'>('new')
  const [onlyMyOrders, setOnlyMyOrders] = useState(true)
  const [myOrders, setMyOrders] = useState<Order[]>([])
  const [myOrdersLoading, setMyOrdersLoading] = useState(false)

  useEffect(() => {
    if (!event) return
    let cancelled = false
    api.getStations(event.id).then(async (sts) => {
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
  }, [event])

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
    if (!sectionRefCallbacks.current.has(id)) {
      sectionRefCallbacks.current.set(id, (el) => {
        if (el) sectionRefs.current.set(id, el)
        else sectionRefs.current.delete(id)
      })
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
    if (tab === 'new' || !event) return
    setMyOrdersLoading(true)
    api.getOrders(event.id).then((all) => setMyOrders(all)).finally(() => setMyOrdersLoading(false))
  }, [tab, event])

  const handleCancelOrder = async (orderId: string) => {
    try { await api.cancelOrder(orderId, token!); setMyOrders((prev) => prev.filter((o) => o.id !== orderId)) }
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
    if (!tableNumber || cart.items.length === 0) return
    setSubmitting(true); setError(''); setSuccess(null)
    try {
      const order = await api.createOrder({
        tableNumber, waiterId: waiter.id, eventId: event.id,
        items: cart.items.filter((i) => i.quantity > 0).map((item) => ({
          productId: item.product.id, quantity: item.quantity,
          comment: item.variant && item.variant !== 'Standard' ? item.variant : undefined,
          optionSelections: item.options?.map((o) => ({ extraId: o.extraId, optionId: o.optionId })),
        })),
      })
      setSuccess({ tearOffNumber: order.tearOffNumber }); cart.clear(); setTableNumber('')
    } catch (err) { setError((err as Error).message || 'Failed to submit order') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-32">
      {/* Header with tabs + avatar */}
      <div className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10 px-4 py-2 flex items-center gap-2">
        {(['new', 'open', 'done'] as const).map((t2) => (
          <button key={t2} onClick={() => { setTab(t2); setSuccess(null) }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${tab === t2 ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
            {t(`order.tab${t2.charAt(0).toUpperCase() + t2.slice(1)}`)}
          </button>
        ))}
        <div className="ml-auto"><UserMenu /></div>
      </div>

      {tab === 'new' && (
        <>
          {success && !error && (
            <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-green-600 text-white rounded-lg shadow-xl px-4 py-3 flex items-center z-30 animate-slide-up">
              <span className="font-medium">{t('order.success')}</span>
              {success.tearOffNumber != null && <span className="ml-2 font-bold">#{success.tearOffNumber}</span>}
            </div>
          )}

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
            total={total} onSubmit={handleSubmit} onOpenVariant={openVariantDialog} t={t} />
        </>
      )}

      {tab === 'open' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <input type="checkbox" id="only-my-open" checked={onlyMyOrders} onChange={(e) => setOnlyMyOrders(e.target.checked)} className="w-4 h-4 rounded" />
            <label htmlFor="only-my-open" className="text-sm text-gray-700 dark:text-gray-300">{t('order.onlyMyOrders')}</label>
          </div>
          {myOrdersLoading ? <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('common.loading')}</p> : (
            (() => {
              const open = myOrders.filter((o) => {
                if (onlyMyOrders && o.waiterId !== waiter?.id) return false
                if (['paid', 'cancelled', 'done'].includes(o.status)) return false
                return !(o.items.length > 0 && o.items.every((i) => ['prepared', 'delivered', 'cancelled'].includes(i.status)))
              }).sort((a, b) => (a.tearOffNumber ?? 0) - (b.tearOffNumber ?? 0))
              if (open.length === 0) return <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('order.empty')}</p>
              return open.map((order) => (
                <div key={order.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">{t('station.table')} {order.tableNumber ?? order.pickupCode}</span>
                      {order.tearOffNumber && <span className="text-xs text-gray-500">#{order.tearOffNumber}</span>}
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
              ))
            })()
          )}
        </div>
      )}

      {tab === 'done' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <input type="checkbox" id="only-my-done" checked={onlyMyOrders} onChange={(e) => setOnlyMyOrders(e.target.checked)} className="w-4 h-4 rounded" />
            <label htmlFor="only-my-done" className="text-sm text-gray-700 dark:text-gray-300">{t('order.onlyMyOrders')}</label>
          </div>
          {myOrdersLoading ? <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('common.loading')}</p> : (
            (() => {
              const done = myOrders.filter((o) => {
                if (onlyMyOrders && o.waiterId !== waiter?.id) return false
                if (['paid', 'cancelled', 'done'].includes(o.status)) return true
                return o.items.length > 0 && o.items.every((i) => ['prepared', 'delivered', 'cancelled'].includes(i.status))
              }).sort((a, b) => (b.tearOffNumber ?? 0) - (a.tearOffNumber ?? 0))
              if (done.length === 0) return <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('order.empty')}</p>
              return done.map((order) => {
                const allItemsDone = order.items.length > 0 && order.items.every((i) => ['prepared', 'delivered', 'cancelled'].includes(i.status))
                const displayStatus = order.status === 'cancelled' ? 'cancelled' : order.status === 'paid' ? 'paid' : order.status === 'done' ? 'done' : allItemsDone ? 'fertig' : order.status
                return (
                  <div key={order.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 opacity-70">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">{t('station.table')} {order.tableNumber ?? order.pickupCode}</span>
                        {order.tearOffNumber && <span className="text-xs text-gray-500">#{order.tearOffNumber}</span>}
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
              })
            })()
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
