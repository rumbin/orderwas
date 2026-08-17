import { useRouter, matchRoute } from '@/router'
import { useSessionStore } from '@/stores/session'
import Landing from '@/pages/Landing'
import Login from '@/pages/Login'
import OrderPage from '@/pages/Order'
import OrdersPage from '@/pages/Orders'
import Admin from '@/pages/Admin'
import StationDisplay from '@/pages/StationDisplay'

export default function App() {
  const route = useRouter()
  const isLoggedIn = useSessionStore((s) => s.isLoggedIn())

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
    if (!isLoggedIn) return <Login navigate={route.navigate} />
    return <OrdersPage navigate={route.navigate} />
  }

  if (route.path === '/admin') {
    return <Admin navigate={route.navigate} />
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