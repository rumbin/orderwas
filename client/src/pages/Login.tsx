import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import type { Waiter } from '@/api/types'

export default function Login({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useTranslation()
  const { event: sessionEvent, setSession } = useSessionStore()
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [selectedWaiter, setSelectedWaiter] = useState<Waiter | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const pinInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (sessionEvent) {
      api.getWaiters(sessionEvent.id).then(setWaiters).catch(() => setError('Failed to load waiters'))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedWaiter) {
      setTimeout(() => pinInputRef.current?.focus(), 50)
    }
  }, [selectedWaiter])

  const handleLogin = async () => {
    if (!selectedWaiter || !pin) return
    setLoading(true)
    setError('')
    try {
      const { token, waiter } = await api.login(selectedWaiter.id, pin)
      if (sessionEvent) {
        setSession({ event: sessionEvent, waiter, token })
      }
      navigate('/order')
    } catch {
      setError(t('login.wrongPin'))
      setPin('')
      setTimeout(() => pinInputRef.current?.focus(), 50)
    } finally {
      setLoading(false)
    }
  }

  const sortedWaiters = [...waiters].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md p-6 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('app.title')}</h1>
        <p className="text-sm text-gray-500 mb-6">{t('login.selectWaiter')}</p>

        {/* Waiter button grid */}
        <div className="grid grid-cols-2 gap-3">
          {sortedWaiters.map((w) => (
            <button
              key={w.id}
              onClick={() => { setSelectedWaiter(w); setPin(''); setError('') }}
              className="bg-gray-100 hover:bg-blue-100 hover:border-blue-300 border-2 border-transparent rounded-lg py-4 px-3 text-center font-medium text-gray-800 transition"
              data-testid={`waiter-${w.name}`}
            >
              {w.name}
            </button>
          ))}
        </div>
      </div>

      {/* PIN overlay */}
      {selectedWaiter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-30" onClick={() => setSelectedWaiter(null)}>
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-xs mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-1">{selectedWaiter.name}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('login.enterPin')}</p>
            <input
              ref={pinInputRef}
              type="password"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLogin() }}
              className="w-full rounded-md border border-gray-300 p-3 text-xl text-center tracking-widest mb-3"
              inputMode="numeric"
              data-testid="pin-input"
            />
            {error && (
              <p className="text-red-600 text-sm mb-3 text-center" data-testid="login-error">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedWaiter(null)}
                className="flex-1 bg-gray-100 rounded-md py-3 font-medium text-gray-600"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleLogin}
                disabled={loading || !pin}
                className="flex-1 bg-blue-600 text-white rounded-md py-3 font-medium disabled:opacity-50"
                data-testid="login-button"
              >
                {loading ? t('common.loading') : t('login.login')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
