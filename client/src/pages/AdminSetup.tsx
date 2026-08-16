import { useState } from 'react'
import { api } from '@/api/client'
import type { Event, Station, Product } from '@/api/types'

export default function AdminSetup({ navigate }: { navigate: (path: string) => void }) {
  const [eventName, setEventName] = useState('')
  const [stationName, setStationName] = useState('')
  const [productData, setProductData] = useState({ name: '', priceCents: '' })
  const [waiterData, setWaiterData] = useState({ name: '', pin: '' })
  const [event, setEvent] = useState<Event | null>(null)
  const [station, setStation] = useState<Station | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [message, setMessage] = useState('')

  const handleCreateEvent = async () => {
    if (!eventName) return
    try {
      const ev = await api.createEvent({ name: eventName })
      setEvent(ev)
      setMessage(`Event "${ev.name}" created`)
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  const handleCreateStation = async () => {
    if (!event || !stationName) return
    try {
      const st = await api.createStation(event.id, { name: stationName })
      setStation(st)
      setMessage(`Station "${st.name}" created`)
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  const handleCreateProduct = async () => {
    if (!station || !productData.name || !productData.priceCents) return
    try {
      const p = await api.createProduct(station.id, {
        name: productData.name,
        priceCents: parseInt(productData.priceCents),
      })
      setProducts([...products, p])
      setProductData({ name: '', priceCents: '' })
      setMessage(`Product "${p.name}" created`)
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  const handleCreateWaiter = async () => {
    if (!event || !waiterData.name || !waiterData.pin) return
    try {
      await api.createWaiter(event.id, { name: waiterData.name, pin: waiterData.pin })
      setMessage(`Waiter "${waiterData.name}" created`)
      setWaiterData({ name: '', pin: '' })
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-gray-900">Admin Setup (Dev)</h1>
        <button onClick={() => navigate('/')} className="text-sm text-blue-600">← Login</button>
      </div>

      {message && <div className="mb-4 p-2 bg-blue-50 text-blue-700 text-sm rounded">{message}</div>}

      {/* Create Event */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <h2 className="font-medium mb-2">1. Create Event</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="Event name"
            className="flex-1 rounded-md border border-gray-300 p-2"
            disabled={!!event}
          />
          <button onClick={handleCreateEvent} disabled={!!event} className="bg-blue-600 text-white rounded-md px-4 disabled:opacity-50">Create</button>
        </div>
        {event && <p className="text-sm text-green-600 mt-1">✓ {event.name} ({event.status})</p>}
      </div>

      {/* Create Station */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <h2 className="font-medium mb-2">2. Create Station</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={stationName}
            onChange={(e) => setStationName(e.target.value)}
            placeholder="Station name (e.g., Bar, Küche)"
            className="flex-1 rounded-md border border-gray-300 p-2"
            disabled={!event || !!station}
          />
          <button onClick={handleCreateStation} disabled={!event || !!station} className="bg-blue-600 text-white rounded-md px-4 disabled:opacity-50">Create</button>
        </div>
        {station && <p className="text-sm text-green-600 mt-1">✓ {station.name}</p>}
      </div>

      {/* Create Product */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <h2 className="font-medium mb-2">3. Create Products {station && `(${products.length})`}</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={productData.name}
            onChange={(e) => setProductData({ ...productData, name: e.target.value })}
            placeholder="Product name"
            className="flex-1 rounded-md border border-gray-300 p-2"
            disabled={!station}
          />
          <input
            type="number"
            value={productData.priceCents}
            onChange={(e) => setProductData({ ...productData, priceCents: e.target.value })}
            placeholder="cents"
            className="w-24 rounded-md border border-gray-300 p-2"
            disabled={!station}
          />
          <button onClick={handleCreateProduct} disabled={!station} className="bg-blue-600 text-white rounded-md px-4 disabled:opacity-50">Add</button>
        </div>
        {products.length > 0 && (
          <ul className="mt-2 text-sm text-gray-600">
            {products.map((p) => (
              <li key={p.id}>{p.name} — {p.priceCents}¢</li>
            ))}
          </ul>
        )}
      </div>

      {/* Create Waiter */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <h2 className="font-medium mb-2">4. Create Waiter</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={waiterData.name}
            onChange={(e) => setWaiterData({ ...waiterData, name: e.target.value })}
            placeholder="Waiter name"
            className="flex-1 rounded-md border border-gray-300 p-2"
            disabled={!event}
          />
          <input
            type="password"
            value={waiterData.pin}
            onChange={(e) => setWaiterData({ ...waiterData, pin: e.target.value })}
            placeholder="PIN"
            className="w-24 rounded-md border border-gray-300 p-2"
            disabled={!event}
          />
          <button onClick={handleCreateWaiter} disabled={!event} className="bg-blue-600 text-white rounded-md px-4 disabled:opacity-50">Add</button>
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center">
        Or use the seed script: <code className="bg-gray-100 px-1 rounded">cd server && npx prisma db seed</code>
      </p>
    </div>
  )
}