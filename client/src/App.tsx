import { useRouter, matchRoute } from '@/router'
import { useSessionStore } from '@/stores/session'
import { ThemeProvider, useThemeStore } from '@/stores/theme'
import Landing from '@/pages/Landing'
import Login from '@/pages/Login'
import OrderPage from '@/pages/Order'
import OrdersPage from '@/pages/Orders'
import Admin from '@/pages/Admin'
import StationDisplay from '@/pages/StationDisplay'
import KitchenMonitor from '@/pages/KitchenMonitor'
import GuestOrder from '@/pages/GuestOrder'

function AppInner() {
  const route = useRouter()
  const isLoggedIn = useSessionStore((s) => s.isLoggedIn())
  useThemeStore() // subscribe to theme context

  // Landing page — role navigation hub
  if (route.path === '/') {
    return <Landing navigate={route.navigate} />
  }

  if (route.path === '/login') {
    if (isLoggedIn) return <OrderPage navigate={route.navigate} />
    return <Login navigate={route.navigate} />
  }

  if (route.path === '/order') {
    if (!isLoggedIn) return <Login navigate={route.navigate} />
    return <OrderPage navigate={route.navigate} />
  }

  if (route.path === '/orders') {
    // Redirect to /order — tabs are now unified
    if (!isLoggedIn) return <Login navigate={route.navigate} />
    return <OrderPage navigate={route.navigate} />
  }

  if (route.path === '/admin') {
    return <Admin navigate={route.navigate} />
  }

  // Guest ordering route (via QR code)
  const guestMatch = matchRoute('/guest/:eventId/:token', route.path)
  if (guestMatch) {
    return <GuestOrder eventId={guestMatch.eventId} token={guestMatch.token} />
  }

  // Kitchen monitor route (full-screen wall display)
  const monitorMatch = matchRoute('/station/:id/monitor', route.path)
  if (monitorMatch) {
    return <KitchenMonitor stationId={monitorMatch.id} />
  }

  // Station display route
  const stationMatch = matchRoute('/station/:id', route.path)
  if (stationMatch) {
    return <StationDisplay navigate={route.navigate} stationId={stationMatch.id} />
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <p className="text-gray-500 dark:text-gray-400">404 — Page not found</p>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  )
}
