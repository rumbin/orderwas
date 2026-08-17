import { useState, useEffect, useCallback } from 'react'
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
  const { event, waiter, token } = useSessionStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<{ type: 'pay' | 'cancel' | 'reopen'; orderId: string } | null>(null)

  const loadOrders = useCallback(async () => {
    if (!event) return
    setLoading(true)
    try {
      const all = await api.getOrders(event.id)
      setOrders(all.filter((o) => o.waiterId === waiter?.id))
    } finally {
      setLoading(false)
    }
  }, [event, waiter])

  useEffect(() => {
    loadOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])

  if (!event || !waiter) return null

  const handlePay = async (orderId: string) => {
    await api.payOrder(orderId, token!)
    setConfirming(null)
    loadOrders()
  }

  const handleCancel = async (orderId: string) => {
    await api.cancelOrder(orderId, token!)
    setConfirming(null)
    loadOrders()
  }

  const handleReopen = async (orderId: string) => {
    await api.reopenOrder(orderId, token!)
    setConfirming(null)
    loadOrders()
  }

  const openOrders = orders.filter((o) => ['open', 'preparing', 'partial'].includes(o.status))
  const closedOrders = orders.filter((o) => ['paid', 'cancelled'].includes(o.status))

  const renderOrder = (order: Order, closed = false) => {
    const openAction = ['open', 'preparing', 'partial'].includes(order.status)
    return (
      <div key={order.id} className={`bg-white rounded-lg shadow-sm border p-4 ${closed ? 'opacity-70' : ''}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">
              {t('station.table')} {order.tableNumber ?? order.pickupCode}
            </span>
            {order.tearOffNumber && <span className="text-xs text-gray-500">#{order.tearOffNumber}</span>}
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_COLORS[order.status] ?? 'bg-gray-100'}`}>
            {order.status}
          </span>
        </div>
        <div className="text-sm text-gray-600">
          {order.items.map((item) => (
            <div key={item.id} className={`flex justify-between ${item.status === 'cancelled' ? 'line-through text-gray-400' : ''}`}>
              <span>
                {item.quantity}× {item.product.name}
                {item.comment && <span className="text-blue-600 text-xs ml-1">({item.comment})</span>}
              </span>
              <span className={item.status === 'prepared' || item.status === 'delivered' ? 'text-green-600' : ''}>
                {item.status === 'open' ? '' : item.status === 'prepared' ? '✓' : item.status === 'delivered' ? '✓✓' : ''}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t flex justify-between font-medium">
          <span>{t('order.total')}</span>
          <span>{formatCents(order.totalCents)}</span>
        </div>
        {openAction && waiter.canCashOut && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setConfirming({ type: 'pay', orderId: order.id })}
              className="bg-green-600 text-white text-sm rounded px-3 py-1.5"
              data-testid={`pay-${order.id}`}
            >
              {t('order.pay')}
            </button>
          </div>
        )}
        {openAction && waiter.canCancel && (
          <div className="mt-2">
            <button
              onClick={() => setConfirming({ type: 'cancel', orderId: order.id })}
              className="text-red-600 text-sm underline"
              data-testid={`cancel-${order.id}`}
            >
              {t('order.cancelOrder')}
            </button>
          </div>
        )}
        {order.status === 'paid' && waiter.canCashOut && (
          <div className="mt-2">
            <button
              onClick={() => setConfirming({ type: 'reopen', orderId: order.id })}
              className="text-gray-600 text-sm underline"
            >
              {t('order.reopen')}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">{t('order.myOrders')}</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/order')} className="text-sm text-blue-600">
            ← {t('order.products')}
          </button>
          <button onClick={loadOrders} className="text-sm text-blue-600">↻</button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-3">
        {loading ? (
          <p className="text-gray-500 text-center py-8">{t('common.loading')}</p>
        ) : (
          <>
            {openOrders.map((o) => renderOrder(o))}
            {openOrders.length === 0 && !closedOrders.length && (
              <p className="text-gray-500 text-center py-8">{t('order.empty')}</p>
            )}
            {closedOrders.length > 0 && (
              <>
                <h2 className="text-sm font-medium text-gray-500 pt-4">{t('order.closedOrders')}</h2>
                {closedOrders.map((o) => renderOrder(o, true))}
              </>
            )}
          </>
        )}
      </div>

      {/* Confirm dialog */}
      {confirming && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-30" onClick={() => setConfirming(null)}>
          <div className="bg-white rounded-lg p-4 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4">
              {confirming.type === 'pay' && t('order.confirmPay')}
              {confirming.type === 'cancel' && t('order.confirmCancel')}
              {confirming.type === 'reopen' && t('order.confirmReopen')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (confirming.type === 'pay') handlePay(confirming.orderId)
                  else if (confirming.type === 'cancel') handleCancel(confirming.orderId)
                  else handleReopen(confirming.orderId)
                }}
                className={`flex-1 text-white rounded py-2 font-medium ${
                  confirming.type === 'cancel' ? 'bg-red-600' : confirming.type === 'pay' ? 'bg-green-600' : 'bg-blue-600'
                }`}
              >
                {t('common.yes')}
              </button>
              <button onClick={() => setConfirming(null)} className="flex-1 bg-gray-100 rounded py-2">
                {t('common.no')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}