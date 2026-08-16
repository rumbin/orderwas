import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { Waiter } from '@/api/types'

export function AdminWaiters({ eventId, waiters, onChanged }: {
  eventId: string
  waiters: Waiter[]
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [newData, setNewData] = useState({ name: '', pin: '', pickupCode: '' })

  const handleCreate = async () => {
    if (!newData.name || !newData.pin) return
    const payload: Record<string, string> = { name: newData.name, pin: newData.pin }
    if (newData.pickupCode) payload.pickupCode = newData.pickupCode
    await api.createWaiter(eventId, payload as unknown as Partial<Waiter> & { pin: string })
    setNewData({ name: '', pin: '', pickupCode: '' })
    onChanged()
  }

  const handleDelete = async (id: string) => {
    await api.deleteWaiter(id)
    onChanged()
  }

  const handleToggle = async (waiter: Waiter, field: keyof Waiter) => {
    await api.updateWaiter(waiter.id, { [field]: !waiter[field] } as Partial<Waiter>)
    onChanged()
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">{t('admin.waiters')}</h2>

      {/* Create */}
      <div className="flex gap-2 mb-6">
        <input type="text" placeholder="Name" value={newData.name}
          onChange={(e) => setNewData({ ...newData, name: e.target.value })}
          className="flex-1 rounded border border-gray-300 px-3 py-1.5" />
        <input type="password" placeholder="PIN" value={newData.pin}
          onChange={(e) => setNewData({ ...newData, pin: e.target.value })}
          className="w-24 rounded border border-gray-300 px-3 py-1.5" />
        <input type="text" placeholder="Abholcode" value={newData.pickupCode}
          onChange={(e) => setNewData({ ...newData, pickupCode: e.target.value })}
          className="w-28 rounded border border-gray-300 px-3 py-1.5" />
        <button onClick={handleCreate} className="bg-blue-600 text-white rounded px-4 py-1.5">{t('common.create')}</button>
      </div>

      {/* List */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Name</th>
            <th>Abholcode</th>
            <th>Aktiv</th>
            <th>Rechte</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {waiters.map((w) => (
            <tr key={w.id} className="border-b">
              <td className="py-2">{w.name}</td>
              <td className="text-gray-500">{w.pickupCode ?? '—'}</td>
              <td>
                <button onClick={() => handleToggle(w, 'active')}
                  className={`px-2 py-0.5 rounded text-xs ${w.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {w.active ? 'Ja' : 'Nein'}
                </button>
              </td>
              <td className="text-xs text-gray-500">
                {w.canCancel && 'Storno '}
                {w.canCashOut && 'Kasse '}
                {w.canStatistics && 'Statistik '}
                {w.isStationWaiter && 'Station '}
              </td>
              <td><button onClick={() => handleDelete(w.id)} className="text-red-600 text-xs">{t('common.delete')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
