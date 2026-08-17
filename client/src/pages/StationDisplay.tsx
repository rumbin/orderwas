import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { useWebSocket, type OrderEventPayload } from '@/hooks/useWebSocket'
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
  const [view, setView] = useState<'orders' | 'products'>('orders')
  const [loading, setLoading] = useState(true)
  const [, setTick] = useState(0) // force re-render for wait time
  const [connected, setConnected] = useState(false)

  // Load station and its open orders
  const loadOrders = useCallback(async () => {
    if (!stationId) return
    try {
      const st = await api.getStation(stationId)
      setStation(st)
      const allOrders = await api.getOrders(st.eventId)
      const stationOrders = allOrders.filter(
        (o) => ['open', 'preparing', 'partial'].includes(o.status) &&
          o.items.some((i) => i.product.stationId === stationId && !['prepared', 'delivered', 'cancelled'].includes(i.status))
      )
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

  // WebSocket: live updates — any order event triggers a reload (simplest correct strategy)
  const handleOrderCreated = useCallback(() => {
    loadOrders()
  }, [loadOrders])

  const handleOrderUpdated = useCallback(() => {
    loadOrders()
  }, [loadOrders])

  useWebSocket(stationId, handleOrderCreated, handleOrderUpdated, setConnected)

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

  // Product aggregation view
  const productAggregation = useCallback(() => {
    const map = new Map<string, { name: string; totalQty: number; tables: string[] }>()
    for (const order of orders) {
      for (const item of order.items) {
        if (item.product.stationId !== stationId) continue
        if (item.status === 'prepared' || item.status === 'cancelled') continue
        const key = item.productId
        const existing = map.get(key) ?? { name: item.product.name, totalQty: 0, tables: [] }
        existing.totalQty += item.quantity
        existing.tables.push(order.tableNumber ?? order.pickupCode ?? '?')
        map.set(key, existing)
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty)
  }, [orders, stationId])

  if (loading) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">{t('common.loading')}</div>
  }

  if (!station) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">Station not found</div>
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-gray-400 text-sm">←</button>
          <h1 className="text-2xl font-bold">{station.name}</h1>
          <span className="text-sm text-gray-400">{t('station.openOrders')}: {orders.length}</span>
          <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} title={connected ? 'Live' : 'Offline'} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('orders')}
            className={`px-3 py-1.5 rounded text-sm font-medium ${view === 'orders' ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            {t('station.title')}
          </button>
          <button
            onClick={() => setView('products')}
            className={`px-3 py-1.5 rounded text-sm font-medium ${view === 'products' ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            {t('order.products')}
          </button>
          <button onClick={loadOrders} className="px-3 py-1.5 rounded text-sm bg-gray-700">↻</button>
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
                (i) => i.product.stationId === stationId && !['prepared', 'delivered', 'cancelled'].includes(i.status)
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
                      <span className="text-xl font-bold">
                        {t('station.table')} {order.tableNumber ?? order.pickupCode}
                      </span>
                      {order.tearOffNumber && <span className="text-sm text-gray-400">#{order.tearOffNumber}</span>}
                    </div>
                    <span className={`text-sm font-mono ${waitSeconds > 300 ? 'text-red-400' : 'text-gray-400'}`}>
                      {formatTime(waitSeconds)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {stationItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg">{item.quantity}×</span>
                          <span>{item.product.name}</span>
                          {item.comment && <span className="text-xs text-yellow-400">({item.comment})</span>}
                        </div>
                        {item.status === 'open' && (
                          <button
                            onClick={() => handleMarkDone(item.id)}
                            className="bg-green-600 hover:bg-green-700 text-xs px-2 py-1 rounded"
                            data-testid={`done-${item.id}`}
                          >
                            {t('station.markDone')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
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
                <div key={p.name} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xl font-bold">{p.totalQty}×</span>
                    <span className="ml-2 text-lg">{p.name}</span>
                  </div>
                  <div className="text-sm text-gray-400">
                    {t('station.table')}: {p.tables.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}