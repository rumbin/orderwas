import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { Event } from '@/api/types'

export function AdminEvents({ events, selectedEventId, onChanged }: {
  events: Event[]
  selectedEventId: string
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [newName, setNewName] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!newName) return
    await api.createEvent({ name: newName })
    setNewName('')
    onChanged()
  }

  const handleToggleStatus = async (event: Event) => {
    if (event.status === 'test' && !confirmingId) {
      setConfirmingId(event.id)
      return
    }
    const newStatus = event.status === 'test' ? 'live' : 'test'
    await api.updateEvent(event.id, { status: newStatus } as Partial<Event>)
    setConfirmingId(null)
    onChanged()
  }

  const handleDelete = async (id: string) => {
    await api.deleteEvent(id)
    onChanged()
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">{t('admin.events')}</h2>

      {/* Create */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Veranstaltungsname"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-1.5"
        />
        <button onClick={handleCreate} className="bg-blue-600 text-white rounded px-4 py-1.5">{t('common.create')}</button>
      </div>

      {/* List */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Name</th>
            <th>Status</th>
            <th>Tear-off</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b">
              <td className="py-2">{e.name}</td>
              <td>
                <button
                  onClick={() => handleToggleStatus(e)}
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    e.status === 'live' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {e.status === 'live' ? 'LIVE' : 'TEST'}
                </button>
                {confirmingId === e.id && (
                  <span className="ml-2 text-xs text-red-600">
                    ⚠ Alle Bestellungen werden gelöscht! <button onClick={() => handleToggleStatus(e)} className="underline font-bold">Bestätigen</button> <button onClick={() => setConfirmingId(null)}>Abbrechen</button>
                  </span>
                )}
              </td>
              <td className="text-gray-500">#{e.lastTearOffNumber}</td>
              <td><button onClick={() => handleDelete(e.id)} className="text-red-600 text-xs">{t('common.delete')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
