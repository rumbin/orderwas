import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import type { Event, Station } from '@/api/types'
import ThemeSwitcher from '@/components/ThemeSwitcher'

export default function Landing({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useTranslation()
  const { isLoggedIn, clear, setEvent } = useSessionStore()
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [stations, setStations] = useState<Station[]>([])
  const [showStations, setShowStations] = useState(false)

  useEffect(() => {
    // Clear stale waiter session on landing page (preserve adminToken)
    clear()
    api.getEvents().then((evs) => {
      setEvents(evs)
      if (evs.length > 0) setSelectedEventId(evs[0].id)
    }).catch(() => {})
  }, [])

  const openStationPicker = async () => {
    if (!selectedEventId) return
    const sts = await api.getStations(selectedEventId)
    setStations(sts)
    setShowStations(true)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">{t('app.title')}</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">{t('app.tagline')}</p>

      {/* Event selector (needed for station picker) */}
      <div className="mb-6 w-full max-w-md">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('login.selectEvent')}</label>
        <select
          value={selectedEventId}
          onChange={(e) => { setSelectedEventId(e.target.value); setShowStations(false) }}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white p-2 text-lg"
          data-testid="landing-event-select"
        >
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {/* Role tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-md">
        <button
          onClick={() => {
            // Store selected event in session so Login can skip event selection
            const ev = events.find((e) => e.id === selectedEventId)
            if (ev) setEvent(ev)
            navigate(isLoggedIn() ? '/order' : '/login')
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-6 text-center min-h-[120px] flex flex-col items-center justify-center"
          data-testid="tile-waiter"
        >
          <span className="text-3xl mb-2">🍺</span>
          <span className="font-medium text-lg">{t('landing.waiter')}</span>
        </button>
        <button
          onClick={openStationPicker}
          className="bg-gray-800 hover:bg-gray-900 text-white rounded-xl p-6 text-center min-h-[120px] flex flex-col items-center justify-center"
          data-testid="tile-station"
        >
          <span className="text-3xl mb-2">🖥️</span>
          <span className="font-medium text-lg">{t('landing.station')}</span>
        </button>
        <button
          onClick={() => navigate('/admin')}
          className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl p-6 text-center min-h-[120px] flex flex-col items-center justify-center"
          data-testid="tile-admin"
        >
          <span className="text-3xl mb-2">⚙️</span>
          <span className="font-medium text-lg">{t('landing.admin')}</span>
        </button>
      </div>

      {/* Station picker overlay */}
      {showStations && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-30" onClick={() => setShowStations(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-3 dark:text-white">{t('landing.selectStation')}</h3>
            <div className="space-y-2">
              {stations.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/station/${s.id}`)}
                  className="w-full text-left bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-md px-4 py-3 font-medium dark:text-white"
                  data-testid={`station-option-${s.name}`}
                >
                  {s.name}
                  {s.kitchenMonitor && <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">Küchenmonitor</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Theme switcher */}
      <div className="fixed bottom-4 left-4 z-30">
        <ThemeSwitcher />
      </div>
    </div>
  )
}