import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import type { Waiter } from '@/api/types'

export default function Login({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useTranslation()
  const { event: sessionEvent, setSession } = useSessionStore()
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [selectedWaiterId, setSelectedWaiterId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (sessionEvent) {
      api.getWaiters(sessionEvent.id).then(setWaiters).catch(() => setError('Failed to load waiters'))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedWaiterId || !pin) return
    setLoading(true)
    setError('')
    try {
      const { token, waiter } = await api.login(selectedWaiterId, pin)
      if (sessionEvent) {
        setSession({ event: sessionEvent, waiter, token })
      }
      navigate('/order')
    } catch {
      setError(t('login.wrongPin'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md p-6 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('app.title')}</h1>

        {/* Waiter selector */}
        {sessionEvent && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('login.selectWaiter')}
            </label>
            <select
              value={selectedWaiterId}
              onChange={(e) => { setSelectedWaiterId(e.target.value); setError('') }}
              className="w-full rounded-md border border-gray-300 p-2 text-lg"
              data-testid="waiter-select"
            >
              <option value="">—</option>
              {waiters.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* PIN input */}
        {selectedWaiterId && (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('login.enterPin')}
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => { setPin(e.target.value); setError('') }}
                className="w-full rounded-md border border-gray-300 p-2 text-lg"
                data-testid="pin-input"
                inputMode="numeric"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm mb-3" data-testid="login-error">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !pin}
              className="w-full bg-blue-600 text-white rounded-md py-3 text-lg font-medium disabled:opacity-50"
              data-testid="login-button"
            >
              {loading ? t('common.loading') : t('login.login')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
