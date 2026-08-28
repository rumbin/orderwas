import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { Product, Station } from '@/api/types'
import { formatPrice } from '@/lib/money'

function formatCents(cents: number): string {
  return formatPrice(cents)
}

/**
 * Guest ordering page — accessed via QR code scan.
 * Shows products for the event, allows ordering without login.
 * Table number is auto-detected from the QR token.
 */
export default function GuestOrder({ eventId, token }: { eventId: string; token: string }) {
  const { t } = useTranslation()
  const [stations, setStations] = useState<Station[]>([])
  const [products, setProducts] = useState<Record<string, Product[]>>({})
  const [activeStation, setActiveStation] = useState<string>('')
  const [cart, setCart] = useState<Array<{ product: Product; quantity: number }>>([])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ tearOffNumber: number | null; totalCents: number } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getStations(eventId).then((sts) => {
      setStations(sts)
      if (sts.length > 0) setActiveStation(sts[0].id)
    }).catch(() => setError('Event not found'))
  }, [eventId])

  useEffect(() => {
    if (!activeStation) return
    if (products[activeStation]) return
    api.getProducts(activeStation).then((prods) => {
      setProducts((prev) => ({ ...prev, [activeStation]: prods }))
    })
  }, [activeStation, products])

  const activeProducts = products[activeStation] ?? []
  const total = cart.reduce((sum, item) => sum + item.product.priceCents * item.quantity, 0)

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        return prev.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { product, quantity: 1 }]
    })
  }

  const submitOrder = async () => {
    if (cart.length === 0) return
    setSubmitting(true)
    setError('')
    try {
      const result = await fetch('/api/guest/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          items: cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
        }),
      })
      const data = await result.json()
      if (!result.ok) throw new Error(data.error || 'Failed to submit order')
      setSuccess({ tearOffNumber: data.tearOffNumber, totalCents: data.totalCents })
      setCart([])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-6">
        <div className="text-6xl mb-4">✓</div>
        <h1 className="text-2xl font-bold text-green-800 mb-2">{t('order.success')}</h1>
        {success.tearOffNumber && (
          <p className="text-lg text-green-700">#{success.tearOffNumber}</p>
        )}
        <p className="text-gray-600 mt-2">{formatCents(success.totalCents)}</p>
        <button
          onClick={() => setSuccess(null)}
          className="mt-6 bg-green-600 text-white rounded-lg px-6 py-3 font-medium"
        >
          {t('order.newOrder')}
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10 px-4 py-3">
        <h1 className="text-lg font-bold text-gray-900 text-center">Bestellung</h1>
      </div>

      {/* Station tabs */}
      {stations.length > 1 && (
        <div className="flex gap-1 px-4 py-2 bg-white border-b overflow-x-auto">
          {stations.map((st) => (
            <button
              key={st.id}
              onClick={() => setActiveStation(st.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${
                activeStation === st.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              {st.name}
            </button>
          ))}
        </div>
      )}

      {/* Product grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
        {activeProducts.filter((p) => p.available).map((product) => {
          const count = cart.find((i) => i.product.id === product.id)?.quantity ?? 0
          return (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              className={`relative min-h-[80px] rounded-lg border-2 p-3 text-left transition active:scale-95 ${
                count > 0 ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="font-medium text-gray-900 text-sm">{product.name}</div>
              <div className="text-xs text-gray-500 mt-1">{formatCents(product.priceCents)}</div>
              {count > 0 && (
                <span className="absolute top-1 right-1 bg-blue-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Cart bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-20">
          {error && <div className="mb-2 p-2 bg-red-50 text-red-700 text-sm rounded">{error}</div>}
          <div className="flex items-center justify-between max-w-lg mx-auto">
            <div>
              <div className="text-sm text-gray-500">{cart.reduce((s, i) => s + i.quantity, 0)} Artikel</div>
              <div className="font-bold text-lg">{formatCents(total)}</div>
            </div>
            <button
              onClick={submitOrder}
              disabled={submitting}
              className="bg-blue-600 text-white rounded-lg px-6 py-3 font-medium disabled:opacity-50"
            >
              {submitting ? '...' : t('order.submit')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
