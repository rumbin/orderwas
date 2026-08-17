import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { Event, Station, Product, Waiter, Printer } from '@/api/types'
import { AdminEvents } from '@/pages/admin/Events'
import { AdminStations } from '@/pages/admin/Stations'
import { AdminWaiters } from '@/pages/admin/Waiters'
import { AdminPrinters } from '@/pages/admin/Printers'

type AdminTab = 'events' | 'stations' | 'products' | 'waiters' | 'printers' | 'export'

export default function Admin({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<AdminTab>('events')
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [stations, setStations] = useState<Station[]>([])
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [printers, setPrinters] = useState<Printer[]>([])
  const [products, setProducts] = useState<Record<string, Product[]>>({})
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null

  const loadEvents = useCallback(async () => {
    const evs = await api.getEvents()
    setEvents(evs)
    if (evs.length > 0 && !selectedEventId) setSelectedEventId(evs[0].id)
  }, [selectedEventId])

  const loadEventData = useCallback(async () => {
    if (!selectedEventId) return
    setLoading(true)
    try {
      const [sts, wtrs, prts] = await Promise.all([
        api.getStations(selectedEventId),
        api.getWaiters(selectedEventId),
        api.getPrinters(selectedEventId),
      ])
      setStations(sts)
      setWaiters(wtrs)
      setPrinters(prts)
      setProducts({})
    } finally {
      setLoading(false)
    }
  }, [selectedEventId])

  useEffect(() => { loadEvents() }, [loadEvents])
  useEffect(() => { loadEventData() }, [loadEventData])

  const loadProducts = useCallback(async (stationId: string) => {
    const prods = await api.getProducts(stationId)
    setProducts((prev) => ({ ...prev, [stationId]: prods }))
  }, [])

  const handleTabChange = (newTab: AdminTab) => {
    setTab(newTab)
    setSidebarOpen(false)
  }

  const tabs: { id: AdminTab; label: string; icon: string }[] = [
    { id: 'events', label: t('admin.events'), icon: '📅' },
    { id: 'stations', label: t('admin.stations'), icon: '🖥️' },
    { id: 'products', label: t('admin.products'), icon: '🍺' },
    { id: 'waiters', label: t('admin.waiters'), icon: '🧑' },
    { id: 'printers', label: t('admin.printers'), icon: '🖨️' },
    { id: 'export', label: 'Export', icon: '📦' },
  ]

  const currentTabLabel = tabs.find((t2) => t2.id === tab)?.label ?? ''

  return (
    <div className="min-h-screen bg-gray-50 flex relative">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-30
        w-56 bg-gray-800 text-white flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="px-4 py-4 border-b border-gray-700">
          <h1 className="text-lg font-bold">{t('admin.title')}</h1>
        </div>
        <div className="px-4 py-3 border-b border-gray-700">
          <select
            value={selectedEventId}
            onChange={(e) => { setSelectedEventId(e.target.value); setProducts({}) }}
            className="w-full rounded bg-gray-700 text-white px-2 py-1.5 text-sm"
          >
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <nav className="flex-1 py-2">
          {tabs.map((t2) => (
            <button
              key={t2.id}
              onClick={() => handleTabChange(t2.id)}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 ${tab === t2.id ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
              data-testid={`tab-${t2.id}`}
            >
              <span className="text-base">{t2.icon}</span>
              {t2.label}
            </button>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-700">
          <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white">
            ← {t('common.back')}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Mobile header bar */}
        <div className="md:hidden bg-gray-800 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white hover:text-gray-200"
            aria-label="Open menu"
            data-testid="open-menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-medium">{currentTabLabel}</span>
        </div>

        <div className="p-4 md:p-6 overflow-auto">
          {loading ? (
            <p className="text-gray-500">{t('common.loading')}</p>
          ) : tab === 'events' ? (
            <AdminEvents events={events} selectedEventId={selectedEventId} onChanged={loadEvents} />
          ) : tab === 'stations' ? (
            <AdminStations eventId={selectedEventId} stations={stations} printers={printers} onChanged={loadEventData} />
          ) : tab === 'products' ? (
            <AdminProducts
              stations={stations}
              products={products}
              onLoadProducts={loadProducts}
              onCreateOrDelete={() => { /* reload products for active station */ }}
              setProducts={setProducts}
            />
          ) : tab === 'waiters' ? (
            <AdminWaiters eventId={selectedEventId} waiters={waiters} onChanged={loadEventData} />
          ) : tab === 'printers' ? (
            <AdminPrinters eventId={selectedEventId} printers={printers} onChanged={loadEventData} />
          ) : (
            <AdminExport eventId={selectedEventId} />
          )}
        </div>
      </div>
    </div>
  )
}

// --- Admin Products (inline to avoid extra file) ---
function AdminProducts({ stations, products, onLoadProducts, setProducts }: {
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
    // Reload products for this station
    const prods = await api.getProducts(activeStation)
    setProducts((prev) => ({ ...prev, [activeStation]: prods }))
  }

  const handleDelete = async (product: Product) => {
    setDeleteError('')
    try {
      await api.deleteProduct(product.id)
      // Reload products for this station
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
      // Optimistic update — flip the flag locally without clearing/reloading the list
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
                  <th>Preis</th>
                  <th>Verfügbar</th>
                  <th>Lager</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {activeProducts.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="py-2">{p.name}</td>
                    <td>{(p.priceCents / 100).toFixed(2)} €</td>
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
                              // Reload products
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
    </div>
  )
}

// --- Admin Export (inline) ---
function AdminExport({ eventId }: { eventId: string }) {
  const [json, setJson] = useState('')
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')

  const handleExport = async () => {
    if (!eventId) return
    const res = await fetch(`/api/events/${eventId}/export`)
    const data = await res.json()
    setJson(JSON.stringify(data, null, 2))
  }

  const handleImport = async () => {
    if (!json) return
    setImporting(true)
    setMessage('')
    try {
      const res = await fetch('/api/events/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(`Importiert: ${data.name} (${data.id})`)
      } else {
        setMessage(`Fehler: ${data.error}`)
      }
    } catch (err) {
      setMessage(`Fehler: ${(err as Error).message}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Export / Import</h2>
      <div className="flex gap-2 mb-4">
        <button onClick={handleExport} className="bg-blue-600 text-white rounded px-4 py-1.5">Export (JSON)</button>
        <button onClick={handleImport} disabled={importing || !json} className="bg-green-600 text-white rounded px-4 py-1.5 disabled:opacity-50">
          {importing ? 'Importiere...' : 'Import'}
        </button>
      </div>
      {message && <div className="mb-3 p-2 bg-blue-50 text-blue-700 text-sm rounded">{message}</div>}
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        className="w-full h-96 rounded border border-gray-300 p-2 font-mono text-xs"
        placeholder="Exportiertes JSON erscheint hier..."
      />
    </div>
  )
}
