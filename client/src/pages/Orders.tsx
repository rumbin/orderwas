import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import ThemeSwitcher from '@/components/ThemeSwitcher'
import type { Order } from '@/api/types'
import { formatPrice } from '@/lib/money'
import { orderIdentifier, bonIsIdentifier, orderActorLabel } from '@/lib/orderIdentifier'

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200',
  preparing: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200',
  partial: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200',
  paid: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200',
  cancelled: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200',
}

function formatCents(cents: number): string {
  return formatPrice(cents)
}

export default function OrdersPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useTranslation()
  const { event, waiter, clear } = useSessionStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<{ type: 'cancel' | 'reopen'; orderId: string } | null>(null)

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

  const handleCancel = async (orderId: string) => {
    await api.cancelOrder(orderId)
    setConfirming(null)
    loadOrders()
  }

  const handleReopen = async (orderId: string) => {
    await api.reopenOrder(orderId)
    setConfirming(null)
    loadOrders()
  }

  const openOrders = orders.filter((o) => ['open', 'preparing', 'partial'].includes(o.status))
  const closedOrders = orders.filter((o) => ['paid', 'cancelled'].includes(o.status))

  const renderOrder = (order: Order, closed = false) => {
    const openAction = ['open', 'preparing', 'partial'].includes(order.status)
    return (
      <div key={order.id} className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 ${closed ? 'opacity-70' : ''}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white">
              {orderIdentifier(order, t)}
            </span>
            {order.waiter?.isCounter && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{orderActorLabel(order.waiter, t)}</span>}
            {order.tearOffNumber && !bonIsIdentifier(order) && <span className="text-xs text-gray-500 dark:text-gray-400">#{order.tearOffNumber}</span>}
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_COLORS[order.status] ?? 'bg-gray-100 dark:bg-gray-700 dark:text-gray-300'}`}>
            {order.status}
          </span>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {order.items.map((item) => (
            <div key={item.id} className={`flex justify-between ${item.status === 'cancelled' ? 'line-through text-gray-400 dark:text-gray-500' : ''}`}>
              <span>
                {item.quantity}× {item.product.name}
                {item.comment && <span className="text-blue-600 dark:text-blue-400 text-xs ml-1">({item.comment})</span>}
              </span>
              <span className={item.status === 'prepared' || item.status === 'delivered' ? 'text-green-600 dark:text-green-400' : ''}>
                {item.status === 'open' ? '' : item.status === 'prepared' ? '✓' : item.status === 'delivered' ? '✓✓' : ''}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t dark:border-gray-700 flex justify-between font-medium">
          <span>{t('order.total')}</span>
          <span>{formatCents(order.totalCents)}</span>
        </div>
        {openAction && waiter.canCancel && (
          <div className="mt-2">
            <button
              onClick={() => setConfirming({ type: 'cancel', orderId: order.id })}
              className="text-red-600 dark:text-red-400 text-sm underline"
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
              className="text-gray-600 dark:text-gray-400 text-sm underline"
            >
              {t('order.reopen')}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">{t('order.myOrders')}</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/order')} className="bg-blue-600 dark:bg-blue-500 text-white rounded-md px-3 py-1.5 text-sm font-medium">
            + {t('order.newOrder')}
          </button>
          <button onClick={loadOrders} className="text-sm text-blue-600 dark:text-blue-400">↻</button>
          <button onClick={() => { clear(); navigate('/') }} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            {t('common.logout') ?? 'Abmelden'}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-3">
        {loading ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('common.loading')}</p>
        ) : (
          <>
            {openOrders.map((o) => renderOrder(o))}
            {openOrders.length === 0 && !closedOrders.length && (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('order.empty')}</p>
            )}
            {closedOrders.length > 0 && (
              <>
                <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 pt-4">{t('order.closedOrders')}</h2>
                {closedOrders.map((o) => renderOrder(o, true))}
              </>
            )}
          </>
        )}
      </div>

      {/* Confirm dialog */}
      {confirming && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-30">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-sm w-full mx-4">
            <p className="mb-4">
              {confirming.type === 'cancel' && t('order.confirmCancel')}
              {confirming.type === 'reopen' && t('order.confirmReopen')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (confirming.type === 'cancel') handleCancel(confirming.orderId)
                  else handleReopen(confirming.orderId)
                }}
                className={`flex-1 text-white rounded py-2 font-medium ${
                  confirming.type === 'cancel' ? 'bg-red-600 dark:bg-red-500' : 'bg-blue-600 dark:bg-blue-500'
                }`}
              >
                {t('common.yes')}
              </button>
              <button onClick={() => setConfirming(null)} className="flex-1 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded py-2">
                {t('common.no')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Theme switcher */}
      <div className="fixed bottom-4 left-4 z-30">
        <ThemeSwitcher />
      </div>
    </div>
  )
}