import { useState, useEffect } from 'react'
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
  const { event, waiter } = useSessionStore()
  const cart = useCartStore()
  const [stations, setStations] = useState<Station[]>([])
  const [products, setProducts] = useState<Record<string, Product[]>>({})
  const [activeStation, setActiveStation] = useState<string>('')
  const [tableNumber, setTableNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

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

  if (!event || !waiter) return null

  const activeProducts = products[activeStation] ?? []
  const total = cart.total()

  const handleAddProduct = (product: Product) => {
    cart.addItem(product)
  }

  const handleSubmit = async () => {
    if (!tableNumber || cart.items.length === 0) return
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      await api.createOrder({
        tableNumber,
        waiterId: waiter.id,
        eventId: event.id,
        items: cart.items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          comment: item.comment,
        })),
      })
      setSuccess(t('order.success'))
      cart.clear()
      setTableNumber('')
    } catch (err) {
      setError((err as Error).message || 'Failed to submit order')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">{event.name}</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{waiter.name}</span>
          <button
            onClick={() => navigate('/orders')}
            className="text-sm text-blue-600"
          >
            {t('order.cart')}
          </button>
        </div>
      </div>

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
          const cartItem = cart.items.find((i) => i.product.id === product.id)
          return (
            <button
              key={product.id}
              onClick={() => handleAddProduct(product)}
              className={`relative min-h-[88px] rounded-lg border-2 p-3 text-left transition active:scale-95 ${
                cartItem
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="font-medium text-gray-900 text-sm leading-tight">{product.name}</div>
              <div className="text-xs text-gray-500 mt-1">{formatCents(product.priceCents)}</div>
              {cartItem && (
                <span className="absolute top-1 right-1 bg-blue-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold">
                  {cartItem.quantity}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Cart bar (fixed bottom) */}
      {cart.items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-20">
          {success && (
            <div className="mb-3 p-2 bg-green-50 text-green-700 text-sm rounded">{success}</div>
          )}
          {error && (
            <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{error}</div>
          )}
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            <input
              type="text"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder={t('order.tableNumber')}
              className="flex-shrink-0 w-32 rounded-md border border-gray-300 p-2 text-lg"
              data-testid="table-number-input"
            />
            <div className="flex-1 overflow-x-auto">
              <div className="flex gap-2">
                {cart.items.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1 text-sm whitespace-nowrap">
                    <span className="font-bold">{item.quantity}×</span>
                    <span>{item.product.name}</span>
                    <button
                      onClick={() => cart.decrementItem(item.product.id)}
                      className="ml-1 text-gray-500 hover:text-red-500"
                    >
                      −
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs text-gray-500">{t('order.total')}</div>
              <div className="font-bold text-lg text-gray-900">{formatCents(total)}</div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting || !tableNumber || cart.items.length === 0}
              className="bg-blue-600 text-white rounded-md py-2 px-4 font-medium disabled:opacity-50 flex-shrink-0"
              data-testid="submit-order"
            >
              {submitting ? t('common.loading') : t('order.submit')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}