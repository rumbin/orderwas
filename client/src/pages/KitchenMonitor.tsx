import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { Order, Station } from '@/api/types'

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Kitchen monitor — full-screen wall display for station staff.
 * Optimized for large screens at distance: big type, no navigation chrome,
 * auto-refresh via WebSocket, wait-time color coding.
 */
export default function KitchenMonitor({ stationId }: { stationId: string }) {
  const { t } = useTranslation()
  const [station, setStation] = useState<Station | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [, setTick] = useState(0)
  const [connected, setConnected] = useState(false)

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

  useEffect(() => { loadOrders() }, [loadOrders])

  // Tick every second for wait-time counter
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  // WebSocket live updates
  useWebSocket(stationId, loadOrders, loadOrders, setConnected, station?.eventId ?? null)

  const handleMarkDone = async (itemId: string) => {
    setOrders((prev) => prev.map((o) => ({
      ...o,
      items: o.items.map((i) => i.id === itemId ? { ...i, status: 'prepared' } : i),
    })))
    try {
      await api.updateOrderItem(itemId, { status: 'prepared' })
    } catch {
      loadOrders()
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white text-4xl">{t('common.loading')}</div>
  }

  if (!station) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-red-400 text-3xl">Station not found</div>
  }

  const sortedOrders = [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  return (
    <div className="min-h-screen bg-black text-white select-none">
      {/* Minimal header */}
      <div className="fixed top-0 left-0 right-0 bg-gray-900/90 backdrop-blur px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">{station.name}</h1>
          <span className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
        <div className="text-2xl text-gray-400">
          {sortedOrders.length} {sortedOrders.length === 1 ? 'Bestellung' : 'Bestellungen'}
        </div>
      </div>

      {/* Order grid — fills entire screen */}
      <div className="pt-16 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {sortedOrders.length === 0 ? (
          <div className="col-span-full flex items-center justify-center h-[60vh]">
            <p className="text-gray-600 text-3xl">{t('station.noOrders')}</p>
          </div>
        ) : (
          sortedOrders.map((order) => {
            const waitSeconds = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 1000)
            const stationItems = order.items.filter(
              (i) => i.product.stationId === stationId && !['prepared', 'delivered', 'cancelled'].includes(i.status)
            )
            const isOpen = stationItems.some((i) => i.status === 'open')
            return (
              <div
                key={order.id}
                className={`rounded-lg p-4 border-l-8 transition-colors ${
                  waitSeconds > 300
                    ? 'bg-red-950 border-red-500'
                    : waitSeconds > 120
                      ? 'bg-yellow-950 border-yellow-500'
                      : isOpen
                        ? 'bg-gray-900 border-green-500'
                        : 'bg-gray-900 border-blue-500'
                }`}
              >
                {/* Table + wait time */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-bold">
                      {order.tableNumber ? `${t('station.table')} ${order.tableNumber}` : order.pickupCode}
                    </span>
                    {order.tearOffNumber && <span className="text-lg text-gray-500">#{order.tearOffNumber}</span>}
                  </div>
                  <span className={`text-xl font-mono ${waitSeconds > 300 ? 'text-red-400 font-bold' : waitSeconds > 120 ? 'text-yellow-400' : 'text-gray-500'}`}>
                    {formatTime(waitSeconds)}
                  </span>
                </div>

                {/* Items — big text for readability */}
                <div className="space-y-2">
                  {stationItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-2xl">{item.quantity}×</span>
                        <span className="text-xl">{item.product.name}</span>
                        {item.comment && <span className="text-sm text-yellow-400">({item.comment})</span>}
                      </div>
                      {item.status === 'open' && (
                        <button
                          onClick={() => handleMarkDone(item.id)}
                          className="bg-green-600 hover:bg-green-500 text-lg font-medium px-4 py-2 rounded-lg active:scale-95"
                          data-testid={`done-${item.id}`}
                        >
                          ✓ {t('station.markDone')}
                        </button>
                      )}
                      {item.status === 'prepared' && (
                        <span className="text-green-400 text-lg">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
