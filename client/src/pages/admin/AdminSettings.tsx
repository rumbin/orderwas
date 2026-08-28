import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'

export function AdminSettings() {
  const { t } = useTranslation()
  const [newPin, setNewPin] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleChangePin = async () => {
    if (!newPin || newPin.length < 3) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await api.changeAdminPin(newPin)
      setMessage(t('admin.pinChanged'))
      setNewPin('')
    } catch (err) {
      setError((err as Error).message || t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">{t('admin.settings')}</h2>
      <div className="bg-white rounded-lg shadow p-4 max-w-md">
        <h3 className="font-semibold mb-3">{t('admin.changePin')}</h3>
        {message && (
          <div className="mb-3 p-2 bg-green-50 text-green-700 text-sm rounded">{message}</div>
        )}
        {error && (
          <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{error}</div>
        )}
        <div className="flex flex-col gap-3">
          <input
            type="password"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            placeholder={t('admin.newPin')}
            className="rounded border border-gray-300 px-3 py-2"
            autoFocus
          />
          <button
            onClick={handleChangePin}
            disabled={saving || !newPin || newPin.length < 3}
            className="bg-blue-600 text-white rounded py-2 font-medium disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}