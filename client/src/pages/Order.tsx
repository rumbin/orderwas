import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { useCartStore, type SelectedOption } from '@/stores/cart'
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
  const [success, setSuccess] = useState<{ tearOffNumber: number | null } | null>(null)
  const [error, setError] = useState('')
  const [commentTarget, setCommentTarget] = useState<number | null>(null) // cart index
  const [commentText, setCommentText] = useState('')
  // Extras sheet: product being configured + current selections per extra
  const [extrasTarget, setExtrasTarget] = useState<Product | null>(null)
  const [extrasSelection, setExtrasSelection] = useState<Record<string, string[]>>({}) // extraId → optionIds
  const tableInputRef = useRef<HTMLInputElement>(null)

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
    setSuccess(null)
    if (product.extras?.length) {
      // Open option sheet first
      setExtrasSelection({})
      setExtrasTarget(product)
      return
    }
    cart.addItem(product)
  }

  const confirmExtras = () => {
    if (!extrasTarget) return
    const selections: SelectedOption[] = []
    for (const extra of extrasTarget.extras ?? []) {
      const optionIds = extrasSelection[extra.id] ?? []
      for (const optionId of optionIds) {
        const option = extra.options.find((o) => o.id === optionId)
        if (option) {
          selections.push({
            extraId: extra.id,
            optionId: option.id,
            extraName: extra.name,
            optionName: option.name,
            priceDeltaCents: option.priceDeltaCents,
          })
        }
      }
    }
    cart.addItem(extrasTarget, selections.length ? selections : undefined)
    setExtrasTarget(null)
    setExtrasSelection({})
  }

  const toggleOption = (extraId: string, optionId: string, multiSelect: boolean) => {
    setExtrasSelection((prev) => {
      const current = prev[extraId] ?? []
      if (multiSelect) {
        return { ...prev, [extraId]: current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId] }
      }
      // Radio: replace
      return { ...prev, [extraId]: current.includes(optionId) && current.length === 1 ? [] : [optionId] }
    })
  }

  const openCommentEditor = (index: number) => {
    setCommentText(cart.items[index]?.comment ?? '')
    setCommentTarget(index)
  }

  const saveComment = () => {
    if (commentTarget != null) {
      cart.setItemComment(commentTarget, commentText)
    }
    setCommentTarget(null)
    setCommentText('')
  }

  const handleSubmit = async () => {
    if (!tableNumber || cart.items.length === 0) return
    setSubmitting(true)
    setError('')
    setSuccess(null)
    try {
      const order = await api.createOrder({
        tableNumber,
        waiterId: waiter.id,
        eventId: event.id,
        items: cart.items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          comment: item.comment || undefined,
          optionSelections: item.options?.map((o) => ({ extraId: o.extraId, optionId: o.optionId })),
        })),
      })
      setSuccess({ tearOffNumber: order.tearOffNumber })
      cart.clear()
      setTableNumber('')
    } catch (err) {
      setError((err as Error).message || 'Failed to submit order')
    } finally {
      setSubmitting(false)
    }
  }

  const startNextOrder = () => {
    setSuccess(null)
    tableInputRef.current?.focus()
  }

  const extrasDeltaTotal = extrasTarget
    ? Object.values(extrasSelection).flat().reduce((sum, optionId) => {
        for (const extra of extrasTarget.extras ?? []) {
          const opt = extra.options.find((o) => o.id === optionId)
          if (opt) return sum + opt.priceDeltaCents
        }
        return sum
      }, 0)
    : 0

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">{event.name}</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{waiter.name}</span>
          <button onClick={() => navigate('/orders')} className="text-sm text-blue-600">
            {t('order.myOrders')}
          </button>
        </div>
      </div>

      {/* Success banner with tear-off + next-order button */}
      {success && !error && (
        <div className="sticky top-[57px] z-10 bg-green-50 border-b border-green-200 px-4 py-3 flex items-center justify-between">
          <div className="text-green-800">
            <span className="font-medium">{t('order.success')}</span>
            {success.tearOffNumber != null && (
              <span className="ml-2 font-bold">#{success.tearOffNumber}</span>
            )}
          </div>
          <button
            onClick={startNextOrder}
            className="bg-green-600 text-white rounded-md px-4 py-2 font-medium"
            data-testid="next-order"
          >
            {t('order.newOrder')}
          </button>
        </div>
      )}

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
          const count = cart.items
            .filter((i) => i.product.id === product.id)
            .reduce((sum, i) => sum + i.quantity, 0)
          const outOfStock = product.stockMode === 'tracked' && product.stockCount <= 0
          const lowStock = product.stockMode === 'tracked' && product.stockCount > 0 && product.stockCount <= 5
          return (
            <button
              key={product.id}
              onClick={() => !outOfStock && handleAddProduct(product)}
              disabled={outOfStock}
              data-testid={`product-${product.name}`}
              className={`relative min-h-[88px] rounded-lg border-2 p-3 text-left transition active:scale-95 ${
                outOfStock
                  ? 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                  : count > 0
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="font-medium text-gray-900 text-sm leading-tight">{product.name}</div>
              <div className="text-xs text-gray-500 mt-1">{formatCents(product.priceCents)}</div>
              {product.extras?.length ? (
                <div className="text-[10px] text-blue-600 mt-0.5">⚙ {product.extras.length} {t('order.extrasLabel')}</div>
              ) : null}
              {product.stockMode === 'tracked' && (
                <div className={`text-[10px] mt-0.5 ${outOfStock ? 'text-red-600 font-medium' : lowStock ? 'text-amber-600' : 'text-gray-400'}`}>
                  {outOfStock ? t('order.outOfStock') : `${product.stockCount} ${t('order.inStock')}`}
                </div>
              )}
              {count > 0 && (
                <span className="absolute top-1 right-1 bg-blue-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Cart bar (fixed bottom) */}
      {cart.items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-20">
          {error && (
            <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{error}</div>
          )}
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            <input
              ref={tableInputRef}
              type="text"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder={t('order.tableNumber')}
              className="flex-shrink-0 w-32 rounded-md border border-gray-300 p-2 text-lg"
              data-testid="table-number-input"
            />
            <div className="flex-1 overflow-x-auto">
              <div className="flex gap-2">
                {cart.items.map((item, idx) => (
                  <div key={`${item.product.id}-${idx}`} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1 text-sm whitespace-nowrap" data-testid="cart-item">
                    <span className="font-bold">{item.quantity}×</span>
                    <button onClick={() => openCommentEditor(idx)} className="hover:text-blue-600" title={t('order.editComment')}>
                      <span>
                        {item.product.name}
                        {item.options?.length ? (
                          <span className="text-blue-600">
                            {' '}({item.options.map((o) => o.optionName).join(', ')})
                          </span>
                        ) : null}
                        {item.comment && <span className="text-blue-600"> 💬</span>}
                      </span>
                    </button>
                    <button
                      onClick={() => cart.decrementItem(idx)}
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

      {/* Comment editor dialog */}
      {commentTarget != null && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-30" onClick={() => setCommentTarget(null)}>
          <div className="bg-white rounded-t-lg sm:rounded-lg p-4 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-2">
              {t('order.commentFor')}: {cart.items[commentTarget]?.product.name}
            </h3>
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t('order.commentPlaceholder')}
              className="w-full rounded-md border border-gray-300 p-3 text-lg"
              data-testid="comment-input"
              autoFocus
            />
            <div className="flex gap-2 mt-3">
              <button onClick={saveComment} className="flex-1 bg-blue-600 text-white rounded-md py-3 font-medium" data-testid="comment-save">
                {t('common.save')}
              </button>
              <button
                onClick={() => { if (commentTarget != null) cart.setItemComment(commentTarget, ''); setCommentTarget(null); }}
                className="px-4 bg-gray-100 rounded-md py-3"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extras option sheet */}
      {extrasTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-30" onClick={() => setExtrasTarget(null)}>
          <div className="bg-white rounded-t-lg sm:rounded-lg p-4 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-1">{extrasTarget.name}</h3>
            <p className="text-sm text-gray-500 mb-4">{formatCents(extrasTarget.priceCents)}</p>

            {(extrasTarget.extras ?? []).map((extra) => (
              <div key={extra.id} className="mb-4">
                <h4 className="font-medium text-sm mb-2">
                  {extra.name}
                  <span className="text-gray-400 ml-1">
                    {extra.multiSelect ? `(${t('order.multiSelect')})` : ''}
                  </span>
                </h4>
                <div className="space-y-1">
                  {extra.options.map((option) => {
                    const selected = (extrasSelection[extra.id] ?? []).includes(option.id)
                    return (
                      <button
                        key={option.id}
                        onClick={() => toggleOption(extra.id, option.id, extra.multiSelect)}
                        className={`w-full flex items-center justify-between rounded-md border-2 px-3 py-2.5 text-left ${
                          selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                        data-testid={`option-${option.name}`}
                      >
                        <span>{option.name}</span>
                        {option.priceDeltaCents !== 0 && (
                          <span className="text-sm text-gray-600">
                            {option.priceDeltaCents > 0 ? '+' : ''}{formatCents(option.priceDeltaCents)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <button
              onClick={confirmExtras}
              className="w-full bg-blue-600 text-white rounded-md py-3 font-medium"
              data-testid="extras-confirm"
            >
              {t('order.add')} · {formatCents(extrasTarget.priceCents + extrasDeltaTotal)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}