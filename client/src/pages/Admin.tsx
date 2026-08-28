import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import type { Event, Station, Product, Waiter, Printer } from '@/api/types'
import { AdminEvents } from '@/pages/admin/Events'
import { AdminStations } from '@/pages/admin/Stations'
import { AdminWaiters } from '@/pages/admin/Waiters'
import { AdminPrinters } from '@/pages/admin/Printers'
import { AdminProducts } from '@/pages/admin/AdminProducts'
import { AdminSettings } from '@/pages/admin/AdminSettings'
import { AdminExport } from '@/pages/admin/AdminExport'

type AdminTab = 'events' | 'stations' | 'products' | 'waiters' | 'printers' | 'export' | 'settings'

export default function Admin({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useTranslation()
  const { adminToken, setAdminToken, isAdminLoggedIn } = useSessionStore()

  // Admin login state
  const [adminPin, setAdminPin] = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminLoggingIn, setAdminLoggingIn] = useState(false)

  // Admin panel state (hooks must be declared unconditionally)
  const [tab, setTab] = useState<AdminTab>('events')
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [stations, setStations] = useState<Station[]>([])
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [printers, setPrinters] = useState<Printer[]>([])
  const [products, setProducts] = useState<Record<string, Product[]>>({})
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleAdminLogin = async () => {
    setAdminLoggingIn(true)
    setAdminError('')
    try {
      const { token } = await api.adminLogin(adminPin)
      setAdminToken(token)
      setAdminPin('')
    } catch {
      setAdminError(t('admin.wrongPin'))
    } finally {
      setAdminLoggingIn(false)
    }
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null

  const loadEvents = useCallback(async () => {
    const evs = await api.getEvents()
    setEvents(evs)
    if (evs.length > 0 && !selectedEventId) setSelectedEventId(evs[0].id)
  }, [selectedEventId])

  const loadEventData = useCallback(async () => {
    if (!selectedEventId) return
    setLoading(true)
    try {
      const [sts, wtrs, prts] = await Promise.all([
        api.getStations(selectedEventId),
        api.getWaiters(selectedEventId),
        api.getPrinters(selectedEventId),
      ])
      setStations(sts)
      setWaiters(wtrs)
      setPrinters(prts)
      setProducts({})
    } finally {
      setLoading(false)
    }
  }, [selectedEventId])

  useEffect(() => { if (isAdminLoggedIn()) loadEvents() }, [loadEvents, isAdminLoggedIn])
  useEffect(() => { if (isAdminLoggedIn()) loadEventData() }, [loadEventData, isAdminLoggedIn])

  const loadProducts = useCallback(async (stationId: string) => {
    const prods = await api.getProducts(stationId)
    setProducts((prev) => ({ ...prev, [stationId]: prods }))
  }, [])

  // --- Admin login gate ---
  if (!isAdminLoggedIn()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-6 w-full max-w-sm mx-4">
          <h1 className="text-xl font-bold mb-4 text-center">{t('admin.login')}</h1>
          {adminError && (
            <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{adminError}</div>
          )}
          <input
            type="password"
            value={adminPin}
            onChange={(e) => setAdminPin(e.target.value)}
            placeholder={t('admin.enterPin')}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdminLogin() }}
            className="w-full rounded border border-gray-300 px-3 py-2 mb-3 text-center text-lg tracking-widest"
            autoFocus
          />
          <button
            onClick={handleAdminLogin}
            disabled={adminLoggingIn || !adminPin}
            className="w-full bg-blue-600 text-white rounded py-2 font-medium disabled:opacity-50"
          >
            {adminLoggingIn ? t('common.loading') : t('login.login')}
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full mt-2 text-sm text-gray-500 hover:text-gray-700"
          >
            ← {t('common.back')}
          </button>
        </div>
      </div>
    )
  }

  const handleTabChange = (newTab: AdminTab) => {
    setTab(newTab)
    setSidebarOpen(false)
  }

  const tabs: { id: AdminTab; label: string; icon: string }[] = [
    { id: 'events', label: t('admin.events'), icon: '📅' },
    { id: 'stations', label: t('admin.stations'), icon: '🖥️' },
    { id: 'products', label: t('admin.products'), icon: '🍺' },
    { id: 'waiters', label: t('admin.waiters'), icon: '🧑' },
    { id: 'printers', label: t('admin.printers'), icon: '🖨️' },
    { id: 'export', label: 'Export', icon: '📦' },
    { id: 'settings', label: t('admin.settings'), icon: '⚙️' },
  ]

  const currentTabLabel = tabs.find((t2) => t2.id === tab)?.label ?? ''

  return (
    <div className="min-h-screen bg-gray-50 flex relative">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-30
        w-56 bg-gray-800 text-white flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="px-4 py-4 border-b border-gray-700">
          <h1 className="text-lg font-bold">{t('admin.title')}</h1>
        </div>
        <div className="px-4 py-3 border-b border-gray-700">
          <select
            value={selectedEventId}
            onChange={(e) => { setSelectedEventId(e.target.value); setProducts({}) }}
            className="w-full rounded bg-gray-700 text-white px-2 py-1.5 text-sm"
          >
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <nav className="flex-1 py-2">
          {tabs.map((t2) => (
            <button
              key={t2.id}
              onClick={() => handleTabChange(t2.id)}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 ${tab === t2.id ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
              data-testid={`tab-${t2.id}`}
            >
              <span className="text-base">{t2.icon}</span>
              {t2.label}
            </button>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-700">
          <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white">
            ← {t('common.back')}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Mobile header bar */}
        <div className="md:hidden bg-gray-800 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white hover:text-gray-200"
            aria-label="Open menu"
            data-testid="open-menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-medium">{currentTabLabel}</span>
        </div>

        <div className="p-4 md:p-6 overflow-auto">
          {loading ? (
            <p className="text-gray-500">{t('common.loading')}</p>
          ) : tab === 'events' ? (
            <AdminEvents events={events} selectedEventId={selectedEventId} onChanged={loadEvents} />
          ) : tab === 'stations' ? (
            <AdminStations eventId={selectedEventId} stations={stations} printers={printers} onChanged={loadEventData} />
          ) : tab === 'products' ? (
            <AdminProducts
              stations={stations}
              products={products}
              onLoadProducts={loadProducts}
              onCreateOrDelete={() => { /* reload products for active station */ }}
              setProducts={setProducts}
            />
          ) : tab === 'waiters' ? (
            <AdminWaiters eventId={selectedEventId} waiters={waiters} onChanged={loadEventData} />
          ) : tab === 'printers' ? (
            <AdminPrinters eventId={selectedEventId} printers={printers} onChanged={loadEventData} />
          ) : tab === 'settings' ? (
            <AdminSettings />
          ) : (
            <AdminExport eventId={selectedEventId} />
          )}
        </div>
      </div>
    </div>
  )
}