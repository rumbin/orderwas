import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { Station, Printer } from '@/api/types'

export function AdminStations({ eventId, stations, printers, onChanged }: {
  eventId: string
  stations: Station[]
  printers: Printer[]
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [newName, setNewName] = useState('')
  const [newPrinterId, setNewPrinterId] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [reordering, setReordering] = useState(false)

  // Sorted copy for display — we use the stations prop order
  const sorted = [...stations].sort((a, b) => a.sortOrder - b.sortOrder)

  const handleCreate = async () => {
    if (!newName) return
    await api.createStation(eventId, { name: newName, ...(newPrinterId ? { printerId: newPrinterId } : {}) })
    setNewName('')
    setNewPrinterId('')
    onChanged()
  }

  const handleUpdate = async (station: Station, data: Partial<Station>) => {
    await api.updateStation(station.id, data)
    onChanged()
  }

  const handleDelete = async (id: string) => {
    await api.deleteStation(id)
    onChanged()
  }

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setOverIndex(index)
  }, [])

  const handleDrop = useCallback(async (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      setOverIndex(null)
      return
    }

    const reordered = [...sorted]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(index, 0, moved)

    // Build the reorder payload with new sortOrder values
    const reorderPayload = reordered.map((s, i) => ({
      id: s.id,
      sortOrder: i,
    }))

    setDragIndex(null)
    setOverIndex(null)
    setReordering(true)

    try {
      await api.reorderStations(reorderPayload)
      onChanged()
    } finally {
      setReordering(false)
    }
  }, [dragIndex, sorted, onChanged])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setOverIndex(null)
  }, [])

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">{t('admin.stations')}</h2>

      {/* Create */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder=" Stationsname"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-1.5"
        />
        <select
          value={newPrinterId}
          onChange={(e) => setNewPrinterId(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5"
        >
          <option value="">Kein Drucker</option>
          {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={handleCreate} className="bg-blue-600 text-white rounded px-4 py-1.5">{t('common.create')}</button>
      </div>

      {/* List */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 w-8"></th>
            <th className="py-2">Name</th>
            <th>Drucker</th>
            <th>Küchenmonitor</th>
            <th>Sortierung</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, index) => (
            <tr
              key={s.id}
              className={`border-b transition-colors ${
                dragIndex === index ? 'opacity-40' :
                overIndex === index ? 'bg-blue-50' : ''
              }`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
            >
              <td className="py-2 text-gray-400 cursor-grab active:cursor-grabbing select-none" title="Ziehen zum Sortieren">
                ☰
              </td>
              <td className="py-2">{s.name}</td>
              <td>
                <select
                  value={s.printerId ?? ''}
                  onChange={(e) => handleUpdate(s, { printerId: e.target.value || null } as Partial<Station>)}
                  className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                >
                  <option value="">Kein Drucker</option>
                  {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </td>
              <td>
                <button
                  onClick={() => handleUpdate(s, { kitchenMonitor: !s.kitchenMonitor } as Partial<Station>)}
                  className={`px-2 py-0.5 rounded text-xs ${s.kitchenMonitor ? 'bg-blue-100 text-blue-800' : 'bg-gray-100'}`}
                >
                  {s.kitchenMonitor ? 'An' : 'Aus'}
                </button>
              </td>
              <td className="text-gray-500">{s.sortOrder}</td>
              <td><button onClick={() => handleDelete(s.id)} className="text-red-600 text-xs">{t('common.delete')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {reordering && (
        <div className="text-xs text-gray-500 mt-2">Sortierung wird gespeichert…</div>
      )}
    </div>
  )
}
