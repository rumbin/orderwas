import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { Product, ProductExtra, Station } from '@/api/types'
import { PRODUCT_COLORS } from '@/lib/productColors'
import { formatPrice } from '@/lib/money'

export function AdminProducts({ stations, products, onLoadProducts, setProducts }: {
  stations: Station[]
  products: Record<string, Product[]>
  onLoadProducts: (stationId: string) => void
  onCreateOrDelete: () => void
  setProducts: React.Dispatch<React.SetStateAction<Record<string, Product[]>>>
}) {
  const { t } = useTranslation()
  const [activeStation, setActiveStation] = useState('')
  const [newProduct, setNewProduct] = useState({ name: '', priceCents: '' })
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)
  const [savedPriceId, setSavedPriceId] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  useEffect(() => {
    if (stations.length > 0 && !activeStation) setActiveStation(stations[0].id)
  }, [stations])

  useEffect(() => {
    if (activeStation) onLoadProducts(activeStation)
  }, [activeStation, onLoadProducts])

  const handleCreate = async () => {
    if (!activeStation || !newProduct.name || !newProduct.priceCents) return
    await api.createProduct(activeStation, { name: newProduct.name, priceCents: parseInt(newProduct.priceCents) })
    setNewProduct({ name: '', priceCents: '' })
    const prods = await api.getProducts(activeStation)
    setProducts((prev) => ({ ...prev, [activeStation]: prods }))
  }

  const handleDelete = async (product: Product) => {
    setDeleteError('')
    try {
      await api.deleteProduct(product.id)
      const prods = await api.getProducts(activeStation)
      setProducts((prev) => ({ ...prev, [activeStation]: prods }))
    } catch (err) {
      setDeleteError((err as Error).message || t('common.error'))
    }
    setDeleteTarget(null)
  }

  const handleToggle = async (product: Product) => {
    setToggling(product.id)
    try {
      await api.updateProduct(product.id, { available: !product.available })
      setProducts((prev) => ({
        ...prev,
        [activeStation]: (prev[activeStation] ?? []).map((p) =>
          p.id === product.id ? { ...p, available: !p.available } : p
        ),
      }))
    } finally {
      setToggling(null)
    }
  }

  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) return
    const currentProducts = products[activeStation] ?? []
    const reordered = [...currentProducts]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(dropIndex, 0, moved)
    setProducts((prev) => ({ ...prev, [activeStation]: reordered }))
    setDragIndex(null)
    try {
      await api.reorderProducts(activeStation, reordered.map((p) => p.id))
    } catch {
      onLoadProducts(activeStation)
    }
  }

  const activeProducts = products[activeStation] ?? []

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">{t('admin.products')}</h2>
      {stations.length === 0 ? (
        <p className="text-gray-500">Keine Stationen. Erstelle zuerst eine Station.</p>
      ) : (
        <>
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {stations.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveStation(s.id)}
                className={`px-3 py-1 rounded text-sm whitespace-nowrap ${activeStation === s.id ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                {s.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Produktname"
              value={newProduct.name}
              onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
              className="flex-1 rounded border border-gray-300 px-3 py-1.5"
            />
            <input
              type="number"
              placeholder="Cent"
              value={newProduct.priceCents}
              onChange={(e) => setNewProduct({ ...newProduct, priceCents: e.target.value })}
              className="w-28 rounded border border-gray-300 px-3 py-1.5"
            />
            <button onClick={handleCreate} className="bg-blue-600 text-white rounded px-4 py-1.5">{t('common.create')}</button>
          </div>
          {deleteError && (
            <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{deleteError}</div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2">Name</th>
                  <th></th>
                  <th>Preis</th>
                  <th>Verfügbar</th>
                  <th>Lager</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {activeProducts.map((p, index) => (
                  <tr
                    key={p.id}
                    className="border-b cursor-grab"
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={() => setDragIndex(null)}
                    style={{ opacity: dragIndex === index ? 0.5 : 1 }}
                  >
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {p.color && PRODUCT_COLORS[p.color] && (
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PRODUCT_COLORS[p.color] }} />
                        )}
                        {p.name}
                      </div>
                    </td>
                    <td>
                      {(p as any)._count?.orderItems > 0 && (
                        <span className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-gray-200 text-gray-600 leading-none">Bestellt</span>
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        defaultValue={p.priceCents}
                        onBlur={async (e) => {
                          const newPrice = parseInt(e.target.value)
                          if (newPrice !== p.priceCents && !isNaN(newPrice) && newPrice >= 0) {
                            await api.updateProduct(p.id, { priceCents: newPrice })
                            setProducts(prev => ({
                              ...prev,
                              [activeStation]: (prev[activeStation] ?? []).map(prod =>
                                prod.id === p.id ? { ...prod, priceCents: newPrice } : prod
                              )
                            }))
                            setSavedPriceId(p.id)
                            setTimeout(() => setSavedPriceId(null), 1500)
                          }
                        }}
                        className="w-24 rounded border border-gray-300 px-2 py-0.5 text-sm"
                        min={0}
                      />
                      {savedPriceId === p.id && (
                        <span className="text-green-600 text-xs ml-2">✓</span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => handleToggle(p)}
                        disabled={toggling === p.id}
                        className={`px-2 py-0.5 rounded text-xs ${p.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} ${toggling === p.id ? 'opacity-50' : ''}`}
                      >
                        {p.available ? 'Ja' : 'Nein'}
                      </button>
                    </td>
                    <td>
                      {p.stockMode !== 'none' ? (
                        <div className="flex items-center gap-1">
                          <span className={`text-xs ${p.stockCount <= 0 ? 'text-red-600 font-medium' : p.stockCount <= 5 ? 'text-amber-600' : 'text-gray-600'}`}>
                            {p.stockCount}
                          </span>
                          <button
                            onClick={async () => {
                              const delta = prompt(`Lagerbestand für "${p.name}" ändern (negativ = abbauen, positiv = auffüllen):`)
                              if (delta === null) return
                              const num = parseInt(delta)
                              if (isNaN(num)) return
                              await api.adjustStock(p.id, num)
                              const prods = await api.getProducts(activeStation)
                              setProducts((prev) => ({ ...prev, [activeStation]: prods }))
                            }}
                            className="text-gray-400 hover:text-gray-600 text-xs"
                            title="Lagerbestand anpassen"
                          >
                            ✏️
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingProduct(p)}
                          className="text-blue-500 hover:text-blue-700 p-1"
                          title={t('common.edit')}
                          aria-label={t('common.edit')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {(p as any)._count?.orderItems > 0 ? (
                          <span className="text-gray-300 text-xs" title="Kann nicht gelöscht werden">🔒</span>
                        ) : (
                          <button
                            onClick={() => { setDeleteTarget(p); setDeleteError('') }}
                            className="text-red-500 hover:text-red-700 p-1"
                            title={t('common.delete')}
                            aria-label={t('common.delete')}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-lg p-4 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4">
              {t('admin.confirmDeleteProduct', { name: deleteTarget.name })}
            </p>
            {deleteError && (
              <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{deleteError}</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 bg-red-600 text-white rounded py-2 font-medium"
              >
                {t('common.delete')}
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-gray-100 rounded py-2"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Edit Modal — Extras Management */}
      {editingProduct && (
        <ProductEditModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={async () => {
            const prods = await api.getProducts(activeStation)
            setProducts((prev) => ({ ...prev, [activeStation]: prods }))
            setEditingProduct(null)
          }}
        />
      )}
    </div>
  )
}

// --- Product Edit Modal — Extras Management ---
export function ProductEditModal({ product, onClose, onSaved }: {
  product: Product
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [extras, setExtras] = useState<ProductExtra[]>(product.extras ?? [])
  const [newExtraName, setNewExtraName] = useState('')
  const [newExtraMultiSelect, setNewExtraMultiSelect] = useState(false)
  const [newOptionTexts, setNewOptionTexts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string | null>(product.color ?? null)

  const handleAddExtra = async () => {
    if (!newExtraName.trim()) return
    setSaving(true)
    try {
      const optionNames = (newOptionTexts['new'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      if (optionNames.length === 0) {
        // Create extra with a single empty option (required by backend)
        const extra = await api.createExtra(product.id, {
          name: newExtraName.trim(),
          multiSelect: newExtraMultiSelect,
          options: [{ name: 'Standard' }],
        })
        setExtras((prev) => [...prev, extra])
      } else {
        const extra = await api.createExtra(product.id, {
          name: newExtraName.trim(),
          multiSelect: newExtraMultiSelect,
          options: optionNames.map((name) => ({ name, priceDeltaCents: 0 })),
        })
        setExtras((prev) => [...prev, extra])
      }
      setNewExtraName('')
      setNewExtraMultiSelect(false)
      setNewOptionTexts({})
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteExtra = async (extraId: string) => {
    await api.deleteExtra(extraId)
    setExtras((prev) => prev.filter((e) => e.id !== extraId))
  }

  const handleColorChange = async (color: string | null) => {
    setSelectedColor(color)
    await api.updateProduct(product.id, { color })
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-4 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{product.name} — {t('admin.extras') ?? 'Extras'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Color picker */}
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">{t('admin.productColor') ?? 'Button-Farbe'}</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleColorChange(null)}
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                selectedColor === null
                  ? 'border-blue-500 bg-gray-100'
                  : 'border-gray-300 bg-white hover:border-gray-400'
              }`}
              title={t('admin.noColor') ?? 'Keine Farbe'}
              aria-label={t('admin.noColor') ?? 'Keine Farbe'}
            >
              <span className="text-[10px] text-gray-400">×</span>
            </button>
            {Object.entries(PRODUCT_COLORS).map(([name, hex]) => (
              <button
                key={name}
                onClick={() => handleColorChange(name)}
                className={`w-6 h-6 rounded-full border-2 transition ${
                  selectedColor === name
                    ? 'border-blue-500 ring-2 ring-blue-200 scale-110'
                    : 'border-transparent hover:scale-110'
                }`}
                style={{ backgroundColor: hex }}
                title={name}
                aria-label={name}
              />
            ))}
          </div>
        </div>

        {/* Existing extras */}
        {extras.length > 0 && (
          <div className="space-y-3 mb-4">
            {extras.map((extra) => (
              <div key={extra.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{extra.name}</span>
                    <span className="text-xs text-gray-400">({extra.multiSelect ? 'Mehrfach' : 'Einfach'})</span>
                  </div>
                  <button
                    onClick={() => handleDeleteExtra(extra.id)}
                    className="text-red-400 hover:text-red-600 text-xs"
                  >
                    {t('common.delete')}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {extra.options.map((opt: any) => (
                    <span key={opt.id} className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded">
                      {opt.name}
                      {opt.priceDeltaCents !== 0 && (
                        <span className="text-gray-400 ml-1">
                          {opt.priceDeltaCents > 0 ? '+' : ''}{formatPrice(opt.priceDeltaCents)}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {extras.length === 0 && (
          <p className="text-gray-400 text-sm mb-4">
            {t('admin.noExtras') ?? 'Keine Extras definiert. Free-Text-Kommentare sind immer möglich.'}
          </p>
        )}

        {/* Add new extra */}
        <div className="border-t pt-3">
          <p className="text-xs text-gray-500 mb-2">{t('admin.addExtraHint') ?? 'Neues Extra hinzufügen (Optionen mit Komma trennen):'}</p>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newExtraName}
              onChange={(e) => setNewExtraName(e.target.value)}
              placeholder={t('admin.extraName') ?? 'Extra-Name (z.B. "Belag")'}
              className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
            />
            <label className="flex items-center gap-1 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={newExtraMultiSelect}
                onChange={(e) => setNewExtraMultiSelect(e.target.checked)}
              />
              {t('admin.multiSelect') ?? 'Mehrfach'}
            </label>
          </div>
          <input
            type="text"
            value={newOptionTexts['new'] ?? ''}
            onChange={(e) => setNewOptionTexts((prev) => ({ ...prev, new: e.target.value }))}
            placeholder={t('admin.optionsHint') ?? 'Optionen: Senf, Ketchup, Remoulade'}
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm mb-2"
          />
          <button
            onClick={handleAddExtra}
            disabled={saving || !newExtraName.trim()}
            className="bg-blue-600 text-white text-sm rounded px-3 py-1.5 disabled:opacity-50"
          >
            {saving ? t('common.saving') : `+ ${t('common.create')}`}
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-3">
          {t('admin.freeTextHint') ?? '💡 Kellner können jederzeit free-Text-Kommentare hinzufügen (z.B. "ohne Senf").'}
        </p>
      </div>
    </div>
  )
}