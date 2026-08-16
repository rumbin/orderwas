import { useRouter, matchRoute } from '@/router'
import { useSessionStore } from '@/stores/session'
import Login from '@/pages/Login'
import OrderPage from '@/pages/Order'
import OrdersPage from '@/pages/Orders'
import AdminSetup from '@/pages/AdminSetup'
import StationDisplay from '@/pages/StationDisplay'

export default function App() {
  const route = useRouter()
  const isLoggedIn = useSessionStore((s) => s.isLoggedIn())

  // Route matching
  if (route.path === '/' || route.path === '/order') {
    if (!isLoggedIn) return <Login navigate={route.navigate} />
    if (route.path === '/') return <OrderPage navigate={route.navigate} />
    return <OrderPage navigate={route.navigate} />
  }

  if (route.path === '/orders') {
    if (!isLoggedIn) return <Login navigate={route.navigate} />
    return <OrdersPage navigate={route.navigate} />
  }

  if (route.path === '/admin') {
    return <AdminSetup navigate={route.navigate} />
  }

  // Station display route
  const stationMatch = matchRoute('/station/:id', route.path)
  if (stationMatch) {
    return <StationDisplay navigate={route.navigate} stationId={stationMatch.id} />
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">404 — Page not found</p>
    </div>
  )
}