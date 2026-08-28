import { useState } from 'react'

export function AdminExport({ eventId }: { eventId: string }) {
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