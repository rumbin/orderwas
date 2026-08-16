import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import type { Order } from '@/api/types'

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-800',
  preparing: 'bg-blue-100 text-blue-800',
  partial: 'bg-purple-100 text-purple-800',
  paid: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

export default function OrdersPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useTranslation()
  const { event, waiter } = useSessionStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const loadOrders = async () => {
    if (!event) return
    setLoading(true)
    try {
      const all = await api.getOrders(event.id)
      // Filter to current waiter
      setOrders(all.filter((o) => o.waiterId === waiter?.id))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])

  if (!event || !waiter) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">{t('order.cart')}</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/order')} className="text-sm text-blue-600">
            ← {t('order.products')}
          </button>
          <button onClick={loadOrders} className="text-sm text-blue-600">
            ↻
          </button>
        </div>
      </div>

      {/* Order list */}
      <div className="max-w-2xl mx-auto p-4 space-y-3">
        {loading ? (
          <p className="text-gray-500 text-center py-8">{t('common.loading')}</p>
        ) : orders.length === 0 ? (
          <p className="text-gray-500 text-center py-8">{t('order.empty')}</p>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">
                    {t('station.table')} {order.tableNumber ?? order.pickupCode}
                  </span>
                  {order.tearOffNumber && (
                    <span className="text-xs text-gray-500">#{order.tearOffNumber}</span>
                  )}
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_COLORS[order.status] ?? 'bg-gray-100'}`}>
                  {order.status}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                {order.items.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.quantity}× {item.product.name}</span>
                    <span>{formatCents(item.product.priceCents * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t flex justify-between font-medium">
                <span>{t('order.total')}</span>
                <span>{formatCents(order.totalCents)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}