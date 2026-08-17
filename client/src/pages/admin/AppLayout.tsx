import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { AppLayout } from '@/api/types'

interface ButtonConfig {
  name: string
  color: string
  productId: string
  row: number
  col: number
}

const PRESET_COLORS = [
  '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
  '#85C1E9', '#F0B27A', '#82E0AA', '#F1948A', '#AED6F1',
]

export function AdminAppLayout({ eventId }: { eventId: string }) {
  const { t } = useTranslation()
  const [layouts, setLayouts] = useState<AppLayout[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [columns, setColumns] = useState(3)
  const [rows, setRows] = useState(5)
  const [buttons, setButtons] = useState<ButtonConfig[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const loadLayouts = useCallback(async () => {
    if (!eventId) return
    const data = await api.getLayouts(eventId)
    setLayouts(data)
    if (data.length > 0 && !selectedId) {
      selectLayout(data[0])
    }
  }, [eventId, selectedId])

  useEffect(() => { loadLayouts() }, [loadLayouts])

  const selectLayout = (layout: AppLayout) => {
    setSelectedId(layout.id)
    setColumns(layout.columns)
    setRows(layout.rows)
    try {
      setButtons(JSON.parse(layout.buttons) as ButtonConfig[])
    } catch {
      setButtons([])
    }
  }

  const handleCreate = async () => {
    const newLayout = await api.createLayout(eventId, {
      columns: 3,
      rows: 5,
      buttons: '[]',
    })
    setLayouts((prev) => [...prev, newLayout])
    selectLayout(newLayout)
  }

  const handleDelete = async (id: string) => {
    await api.deleteLayout(id)
    setLayouts((prev) => prev.filter((l) => l.id !== id))
    if (selectedId === id) {
      setSelectedId('')
      setButtons([])
    }
  }

  const handleSave = async () => {
    if (!selectedId) return
    setSaving(true)
    setMessage('')
    try {
      const buttonsJson = JSON.stringify(buttons)
      await api.updateLayout(selectedId, { columns, rows, buttons: buttonsJson })
      setLayouts((prev) =>
        prev.map((l) =>
          l.id === selectedId ? { ...l, columns, rows, buttons: buttonsJson } : l
        )
      )
      setMessage(t('common.saved'))
      setTimeout(() => setMessage(''), 2000)
    } finally {
      setSaving(false)
    }
  }

  const updateButton = (index: number, field: keyof ButtonConfig, value: string | number) => {
    setButtons((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const handleGridClick = (row: number, col: number) => {
    const existing = buttons.find((b) => b.row === row && b.col === col)
    if (existing) {
      // Remove button
      setButtons((prev) => prev.filter((b) => !(b.row === row && b.col === col)))
    } else {
      // Add new button
      setButtons((prev) => [
        ...prev,
        { name: '', color: PRESET_COLORS[prev.length % PRESET_COLORS.length], productId: '', row, col },
      ])
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">{t('admin.appLayout')}</h2>

      {/* Layout list */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {layouts.map((l) => (
          <div
            key={l.id}
            className={`flex items-center gap-1 px-3 py-1 rounded text-sm ${
              selectedId === l.id ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}
          >
            <button
              onClick={() => selectLayout(l)}
              className="flex-1 text-left"
            >
              {l.waiterId ? `Kellner: ${l.waiterId.slice(0, 6)}` : 'Standard'}
              <span className="ml-2 opacity-75">({l.columns}×{l.rows})</span>
            </button>
            <button
              onClick={() => handleDelete(l.id)}
              className="ml-1 text-xs hover:text-red-300"
              aria-label={t('common.delete')}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={handleCreate}
          className="bg-green-600 text-white rounded px-3 py-1 text-sm"
        >
          + {t('common.create')}
        </button>
      </div>

      {selectedId && (
        <>
          {/* Grid dimensions */}
          <div className="flex gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Spalten</label>
              <input
                type="number"
                min={1}
                max={20}
                value={columns}
                onChange={(e) => setColumns(parseInt(e.target.value) || 1)}
                className="w-20 rounded border border-gray-300 px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Zeilen</label>
              <input
                type="number"
                min={1}
                max={50}
                value={rows}
                onChange={(e) => setRows(parseInt(e.target.value) || 1)}
                className="w-20 rounded border border-gray-300 px-2 py-1"
              />
            </div>
          </div>

          {/* Grid editor */}
          <div className="border rounded-lg p-4 bg-gray-50 mb-4">
            <p className="text-sm text-gray-500 mb-2">Klicke auf eine Zelle, um einen Button hinzuzufügen oder zu entfernen.</p>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
            >
              {Array.from({ length: rows * columns }).map((_, i) => {
                const row = Math.floor(i / columns)
                const col = i % columns
                const btn = buttons.find((b) => b.row === row && b.col === col)
                return (
                  <button
                    key={i}
                    onClick={() => handleGridClick(row, col)}
                    className={`aspect-square rounded border-2 text-xs font-medium transition-colors ${
                      btn
                        ? 'border-transparent text-white shadow-sm'
                        : 'border-dashed border-gray-300 text-gray-400 hover:border-gray-400'
                    }`}
                    style={btn ? { backgroundColor: btn.color } : undefined}
                    title={btn ? btn.name || 'Leerer Button' : 'Button hinzufügen'}
                  >
                    {btn ? (btn.name || '?') : '+'}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Button editor list */}
          {buttons.length > 0 && (
            <div className="border rounded-lg overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="px-3 py-2">Pos</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Farbe</th>
                    <th className="px-3 py-2">Produkt-ID</th>
                  </tr>
                </thead>
                <tbody>
                  {buttons.map((btn, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-2 text-gray-500">
                        {btn.row + 1},{btn.col + 1}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={btn.name}
                          onChange={(e) => updateButton(idx, 'name', e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1"
                          placeholder="Button Name"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={btn.color}
                            onChange={(e) => updateButton(idx, 'color', e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer"
                          />
                          <div className="flex gap-0.5">
                            {PRESET_COLORS.slice(0, 5).map((c) => (
                              <button
                                key={c}
                                onClick={() => updateButton(idx, 'color', c)}
                                className="w-4 h-4 rounded-full border border-gray-300"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={btn.productId}
                          onChange={(e) => updateButton(idx, 'productId', e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1"
                          placeholder="Produkt-ID"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Save */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white rounded px-4 py-1.5 disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
            {message && <span className="text-green-600 text-sm">{message}</span>}
          </div>
        </>
      )}
    </div>
  )
}
