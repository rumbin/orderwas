import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { Printer } from '@/api/types'

export function AdminPrinters({ eventId, printers, onChanged }: {
  eventId: string
  printers: Printer[]
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [newData, setNewData] = useState({ name: '', type: 'dummy' as string, ip: '', charsPerLine: '42' })
  const [testResult, setTestResult] = useState<Record<string, string>>({})

  const handleCreate = async () => {
    if (!newData.name) return
    await api.createPrinter(eventId, {
      name: newData.name,
      type: newData.type as Printer['type'],
      ...(newData.ip ? { ip: newData.ip } : {}),
      charsPerLine: parseInt(newData.charsPerLine) || 42,
    })
    setNewData({ name: '', type: 'dummy', ip: '', charsPerLine: '42' })
    onChanged()
  }

  const handleDelete = async (id: string) => {
    await api.deletePrinter(id)
    onChanged()
  }

  const handleTest = async (printer: Printer) => {
    setTestResult((prev) => ({ ...prev, [printer.id]: '...' }))
    try {
      const res = await fetch(`/api/printers/${printer.id}/test`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setTestResult((prev) => ({ ...prev, [printer.id]: `✓ ${data.message}` }))
      } else {
        setTestResult((prev) => ({ ...prev, [printer.id]: `✗ ${data.error}` }))
      }
    } catch (err) {
      setTestResult((prev) => ({ ...prev, [printer.id]: `✗ ${(err as Error).message}` }))
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">{t('admin.printers')}</h2>

      {/* Create */}
      <div className="flex gap-2 mb-6">
        <input type="text" placeholder="Druckername" value={newData.name}
          onChange={(e) => setNewData({ ...newData, name: e.target.value })}
          className="flex-1 rounded border border-gray-300 px-3 py-1.5" />
        <select value={newData.type}
          onChange={(e) => setNewData({ ...newData, type: e.target.value })}
          className="rounded border border-gray-300 px-2 py-1.5">
          <option value="dummy">Dummy</option>
          <option value="network">Netzwerk</option>
          <option value="ignore">Ignorieren</option>
        </select>
        {newData.type === 'network' && (
          <input type="text" placeholder="IP-Adresse" value={newData.ip}
            onChange={(e) => setNewData({ ...newData, ip: e.target.value })}
            className="w-32 rounded border border-gray-300 px-3 py-1.5" />
        )}
        <input type="number" placeholder="Zeichen/Zeile" value={newData.charsPerLine}
          onChange={(e) => setNewData({ ...newData, charsPerLine: e.target.value })}
          className="w-28 rounded border border-gray-300 px-3 py-1.5" />
        <button onClick={handleCreate} className="bg-blue-600 text-white rounded px-4 py-1.5">{t('common.create')}</button>
      </div>

      {/* List */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Name</th>
            <th>Typ</th>
            <th>IP</th>
            <th>Zeichen/Zeile</th>
            <th>Testdruck</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {printers.map((p) => (
            <tr key={p.id} className="border-b">
              <td className="py-2">{p.name}</td>
              <td><span className={`px-2 py-0.5 rounded text-xs ${
                p.type === 'dummy' ? 'bg-gray-100' : p.type === 'network' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'
              }`}>{p.type}</span></td>
              <td className="text-gray-500">{p.ip ?? '—'}</td>
              <td className="text-gray-500">{p.charsPerLine}</td>
              <td>
                <button onClick={() => handleTest(p)} className="text-blue-600 text-xs underline">Test</button>
                {testResult[p.id] && <span className="ml-2 text-xs">{testResult[p.id]}</span>}
              </td>
              <td><button onClick={() => handleDelete(p.id)} className="text-red-600 text-xs">{t('common.delete')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
