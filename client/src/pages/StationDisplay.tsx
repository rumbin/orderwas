import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { useWebSocket, type OrderEventPayload } from '@/hooks/useWebSocket'
import UserMenu from '@/components/UserMenu'
import { PRODUCT_COLORS, PRODUCT_BG_CLASSES } from '@/lib/productColors'
import { orderIdentifier, bonIsIdentifier } from '@/lib/orderIdentifier'
import type { Order, Station } from '@/api/types'

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function StationDisplay({ navigate, stationId }: { navigate: (path: string) => void; stationId: string }) {
  const { t } = useTranslation()
  const [station, setStation] = useState<Station | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [view, setView] = useState<'orders' | 'products' | 'done'>('orders')
  const [loading, setLoading] = useState(true)
  const [, setTick] = useState(0) // force re-render for wait time
  const [connected, setConnected] = useState(false)

  // Load station and its open orders — only orders where this station still has open items
  const loadOrders = useCallback(async () => {
    if (!stationId) return
    try {
      const st = await api.getStation(stationId)
      setStation(st)
      const allOrders = await api.getOrders(st.eventId)
      const stationOrders = allOrders.filter((o) => {
        if (o.status === 'done' || o.status === 'cancelled') return false // terminal → not open for anyone
        const stationItems = o.items.filter((i) => i.product.stationId === stationId)
        return stationItems.length > 0 && stationItems.some((i) => i.status === 'open')
      })
      setOrders(stationOrders)
    } finally {
      setLoading(false)
    }
  }, [stationId])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Tick every second for wait-time counter
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  // Poll fallback: if a WebSocket event is missed (e.g. page socket joins the
  // room a moment after the event fired), we don't want a cancelled/paid order
  // to linger on a public screen forever. Reload every 15s as a safety net.
  useEffect(() => {
    const interval = setInterval(() => loadOrders(), 15000)
    return () => clearInterval(interval)
  }, [loadOrders])

  // WebSocket: live updates — any order event triggers a reload (simplest correct strategy)
  const handleOrderCreated = useCallback(() => {
    loadOrders()
  }, [loadOrders])

  const handleOrderUpdated = useCallback(() => {
    loadOrders()
  }, [loadOrders])

  useWebSocket(stationId, handleOrderCreated, handleOrderUpdated, setConnected, station?.eventId ?? null)

  // Mark an item as done (persisted!)
  const handleMarkDone = async (itemId: string) => {
    // Optimistic: remove item from view
    setOrders((prev) => prev.map((o) => ({
      ...o,
      items: o.items.map((i) => i.id === itemId ? { ...i, status: 'prepared' } : i),
    })))
    try {
      await api.updateOrderItem(itemId, { status: 'prepared' })
    } catch {
      loadOrders() // revert on failure
    }
  }

  // Mark entire order done for this station: prepare all open items (does NOT set order.status)
  const handleMarkOrderDone = async (order: Order) => {
    // Optimistic: remove from view
    setOrders((prev) => prev.filter((o) => o.id !== order.id))
    try {
      const openItems = order.items.filter(
        (i) => i.product.stationId === stationId && i.status === 'open',
      )
      if (openItems.length > 0) {
        await Promise.all(
          openItems.map((i) => api.updateOrderItem(i.id, { status: 'prepared' })),
        )
      }
    } catch {
      loadOrders() // revert on failure
    }
  }

  // Product aggregation view — groups by product, then by variant (comment)
  const productAggregation = useCallback(() => {
    // Map: productId → { name, color, variants: Map<variant, { totalQty, tables }> }
    const map = new Map<string, { name: string; color: string | null; totalQty: number; variants: Map<string, { totalQty: number; tables: string[] }> }>()
    for (const order of orders) {
      for (const item of order.items) {
        if (item.product.stationId !== stationId) continue
        if (item.status === 'prepared' || item.status === 'cancelled') continue
        const variant = item.comment || null
        let productEntry = map.get(item.productId)
        if (!productEntry) {
          productEntry = { name: item.product.name, color: item.product.color, totalQty: 0, variants: new Map() }
          map.set(item.productId, productEntry)
        }
        productEntry.totalQty += item.quantity
        const vKey = variant ?? '__standard__'
        const existing = productEntry.variants.get(vKey) ?? { totalQty: 0, tables: [] }
        existing.totalQty += item.quantity
        existing.tables.push(orderIdentifier(order, t))
        productEntry.variants.set(vKey, existing)
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty)
  }, [orders, stationId, t])

  // Done orders: orders where ALL items for this station are prepared/delivered/cancelled
  const [doneOrders, setDoneOrders] = useState<Order[]>([])

  const loadDoneOrders = useCallback(async () => {
    if (!station || !stationId) return
    try {
      const allOrders = await api.getOrders(station.eventId)
      const done = allOrders.filter((o) => {
        // Explicitly marked done
        if (o.status === 'done') return true
        // Or all items for this station are prepared/delivered/cancelled
        const stationItems = o.items.filter((i) => i.product.stationId === stationId)
        return stationItems.length > 0 && stationItems.every((i) => ['prepared', 'delivered', 'cancelled'].includes(i.status))
      })
      setDoneOrders(done)
    } catch {
      // ignore
    }
  }, [station, stationId])

  useEffect(() => {
    if (view === 'done') loadDoneOrders()
  }, [view, loadDoneOrders])

  if (loading) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">{t('common.loading')}</div>
  }

  if (!station) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">Station not found</div>
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate('/')} className="text-gray-400 text-sm">←</button>
          <h1 className="text-xl font-bold truncate">{station.name}</h1>
          <span className="text-xs text-gray-400 whitespace-nowrap">{t('station.openOrders')}: {orders.length}</span>
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${connected ? 'bg-green-500' : 'bg-red-500'}`} title={connected ? 'Live' : 'Offline'} />
          <div className="ml-auto"><UserMenu /></div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setView('orders')}
            className={`px-2.5 py-1 rounded text-xs font-medium ${view === 'orders' ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            {t('station.title')}
          </button>
          <button
            onClick={() => setView('products')}
            className={`px-2.5 py-1 rounded text-xs font-medium ${view === 'products' ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            {t('order.products')}
          </button>
          <button
            onClick={() => setView('done')}
            className={`px-2.5 py-1 rounded text-xs font-medium ${view === 'done' ? 'bg-green-600' : 'bg-gray-700'}`}
          >
            {t('station.done') ?? 'Fertig'}
          </button>
          <button onClick={loadOrders} className="px-2.5 py-1 rounded text-xs bg-gray-700">↻</button>
        </div>
      </div>

      {/* Order view */}
      {view === 'orders' && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.length === 0 ? (
            <p className="text-gray-500 col-span-full text-center py-8">{t('station.noOrders')}</p>
          ) : (
            orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map((order) => {
              const waitSeconds = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 1000)
              const stationItems = order.items.filter(
                (i) => i.product.stationId === stationId && i.status !== 'cancelled',
              )
              return (
                <div
                  key={order.id}
                  className={`bg-gray-800 rounded-lg p-4 border-l-4 ${
                    waitSeconds > 300 ? 'border-red-500' : waitSeconds > 120 ? 'border-yellow-500' : 'border-green-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold" data-testid="order-identifier">
                        {orderIdentifier(order, t)}
                      </span>
                      {order.tearOffNumber && !bonIsIdentifier(order) && <span className="text-sm text-gray-400">#{order.tearOffNumber}</span>}
                    </div>
                    <span className={`text-sm font-mono ${waitSeconds > 300 ? 'text-red-400' : 'text-gray-400'}`}>
                      {formatTime(waitSeconds)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {stationItems.map((item) => {
                      let parsedOptions: { extraName: string; optionName: string; priceDeltaCents: number }[] = []
                      try { if (item.options) parsedOptions = JSON.parse(item.options) } catch { /* ignore */ }
                      return (
                        <div key={item.id} className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-lg">{item.quantity}×</span>
                              <span>{item.product.name}</span>
                              {item.product.color && PRODUCT_COLORS[item.product.color] && (
                                <span className="w-2 h-2 rounded-full inline-block ml-1" style={{ backgroundColor: PRODUCT_COLORS[item.product.color] }} />
                              )}
                              {item.status === 'prepared' && <span className="text-green-500">✓</span>}
                            </div>
                            {parsedOptions.length > 0 && (
                              <div className="text-xs text-yellow-400 ml-8">
                                {parsedOptions.map((o, i) => (
                                  <span key={i}>{o.extraName}: {o.optionName}{i < parsedOptions.length - 1 ? ', ' : ''}</span>
                                ))}
                              </div>
                            )}
                            {item.comment && <div className="text-xs text-yellow-400 ml-8">💬 {item.comment}</div>}
                          </div>
                          {item.status === 'open' && (
                            <button
                              onClick={() => handleMarkDone(item.id)}
                              className="bg-green-600 hover:bg-green-700 text-xs px-2 py-1 rounded ml-2 flex-shrink-0"
                              data-testid={`done-${item.id}`}
                            >
                              {t('station.markDone')}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {/* Mark entire order done */}
                  <button
                    onClick={() => handleMarkOrderDone(order)}
                    className="w-full mt-3 bg-green-700 hover:bg-green-800 text-sm py-2 rounded font-medium"
                    data-testid={`order-done-${order.id}`}
                  >
                    {t('station.markOrderDone') ?? 'Ganze Bestellung fertig'}
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Product view (aggregation) */}
      {view === 'products' && (
        <div className="p-4 max-w-2xl mx-auto">
          {productAggregation().length === 0 ? (
            <p className="text-gray-500 text-center py-8">{t('station.noOrders')}</p>
          ) : (
            <div className="space-y-2">
              {productAggregation().map((p) => (
                <div
                  key={p.name}
                  className={`rounded-lg p-4 ${p.color && PRODUCT_BG_CLASSES[p.color] ? PRODUCT_BG_CLASSES[p.color] : 'bg-gray-800'}`}
                  style={p.color && PRODUCT_COLORS[p.color] ? { borderLeftColor: PRODUCT_COLORS[p.color], borderLeftWidth: '4px' } : undefined}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold">{p.totalQty}×</span>
                      <span className="text-lg">{p.name}</span>
                      {p.color && PRODUCT_COLORS[p.color] && (
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PRODUCT_COLORS[p.color] }} />
                      )}
                    </div>
                  </div>
                  {p.variants.size > 1 || !p.variants.has('__standard__') ? (
                    <div className="mt-2 ml-6 space-y-1">
                      {Array.from(p.variants.entries()).map(([variant, v]) => (
                        <div key={variant} className="flex items-center justify-between text-sm text-gray-300">
                          <span>{variant === '__standard__' ? '— Standard' : `— ${variant}`}</span>
                          <span className="font-medium">{v.totalQty}× · {v.tables.join(', ')}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 ml-6 text-sm text-gray-400">
                      {Array.from(p.variants.values())[0].tables.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Done view — processed orders */}
      {view === 'done' && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {doneOrders.length === 0 ? (
            <p className="text-gray-500 col-span-full text-center py-8">{t('station.noDoneOrders') ?? 'Keine fertigen Bestellungen'}</p>
          ) : (
            doneOrders.sort((a, b) => (b.tearOffNumber ?? 0) - (a.tearOffNumber ?? 0)).map((order) => {
              const stationItems = order.items.filter((i) => i.product.stationId === stationId)
              const doneAt = Math.floor((Date.now() - new Date(order.updatedAt).getTime()) / 1000)
              return (
                <div key={order.id} className="bg-gray-800 rounded-lg p-4 border-l-4 border-green-800 opacity-70">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold">
                        {orderIdentifier(order, t)}
                      </span>
                      {order.tearOffNumber && !bonIsIdentifier(order) && <span className="text-sm text-gray-400">#{order.tearOffNumber}</span>}
                    </div>
                    <span className="text-sm text-gray-500">
                      {doneAt < 60 ? `${doneAt}s` : `${Math.floor(doneAt / 60)}m`}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {stationItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-sm">
                        <span className="font-bold">{item.quantity}×</span>
                        <span className={item.status === 'cancelled' ? 'line-through text-gray-500' : ''}>{item.product.name}</span>
                        <span className="text-green-500">✓</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
