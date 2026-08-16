import { useState } from 'react'
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
            <th className="py-2">Name</th>
            <th>Drucker</th>
            <th>Küchenmonitor</th>
            <th>Sortierung</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {stations.map((s) => (
            <tr key={s.id} className="border-b">
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
    </div>
  )
}
