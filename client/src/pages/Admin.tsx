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

  const loadProducts = async (stationId: string) => {
    if (products[stationId]) return
    const prods = await api.getProducts(stationId)
    setProducts((prev) => ({ ...prev, [stationId]: prods }))
  }

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'events', label: t('admin.events') },
    { id: 'stations', label: t('admin.stations') },
    { id: 'products', label: t('admin.products') },
    { id: 'waiters', label: t('admin.waiters') },
    { id: 'printers', label: t('admin.printers') },
    { id: 'export', label: 'Export' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-56 bg-gray-800 text-white flex flex-col">
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
              onClick={() => setTab(t2.id)}
              className={`w-full text-left px-4 py-2 text-sm ${tab === t2.id ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
            >
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

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        {loading ? (
          <p className="text-gray-500">{t('common.loading')}</p>
        ) : tab === 'events' ? (
          <AdminEvents events={events} selectedEventId={selectedEventId} onChanged={loadEvents} />
        ) : tab === 'stations' ? (
          <AdminStations eventId={selectedEventId} stations={stations} printers={printers} onChanged={loadEventData} />
        ) : tab === 'products' ? (
          <AdminProducts stations={stations} products={products} onLoadProducts={loadProducts} onChanged={(sid) => { setProducts((prev) => ({ ...prev, [sid]: [] })) }} />
        ) : tab === 'waiters' ? (
          <AdminWaiters eventId={selectedEventId} waiters={waiters} onChanged={loadEventData} />
        ) : tab === 'printers' ? (
          <AdminPrinters eventId={selectedEventId} printers={printers} onChanged={loadEventData} />
        ) : (
          <AdminExport eventId={selectedEventId} />
        )}
      </div>
    </div>
  )
}

// --- Admin Products (inline to avoid extra file) ---
function AdminProducts({ stations, products, onLoadProducts, onChanged }: {
  stations: Station[]
  products: Record<string, Product[]>
  onLoadProducts: (stationId: string) => void
  onChanged: (stationId: string) => void
}) {
  const { t } = useTranslation()
  const [activeStation, setActiveStation] = useState('')
  const [newProduct, setNewProduct] = useState({ name: '', priceCents: '' })

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
    onChanged(activeStation)
  }

  const handleDelete = async (id: string) => {
    await api.deleteProduct(id)
    onChanged(activeStation)
  }

  const handleToggle = async (product: Product) => {
    await api.updateProduct(product.id, { available: !product.available })
    onChanged(activeStation)
  }

  const activeProducts = products[activeStation] ?? []

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">{t('admin.products')}</h2>
      {stations.length === 0 ? (
        <p className="text-gray-500">Keine Stationen. Erstelle zuerst eine Station.</p>
      ) : (
        <>
          <div className="flex gap-2 mb-4">
            {stations.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveStation(s.id)}
                className={`px-3 py-1 rounded text-sm ${activeStation === s.id ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
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
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Name</th>
                <th>Preis</th>
                <th>Verfügbar</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeProducts.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="py-2">{p.name}</td>
                  <td>{(p.priceCents / 100).toFixed(2)} €</td>
                  <td>
                    <button onClick={() => handleToggle(p)} className={`px-2 py-0.5 rounded text-xs ${p.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {p.available ? 'Ja' : 'Nein'}
                    </button>
                  </td>
                  <td><button onClick={() => handleDelete(p.id)} className="text-red-600 text-xs">{t('common.delete')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
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
