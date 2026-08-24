import type {
  Event,
  Station,
  Product,
  ProductExtra,
  Waiter,
  Order,
  Printer,
  OrderItem,
  AppLayout,
} from './types'

export type { Event, Station, Product, Waiter, Order, OrderItem, Printer, Voucher, AppLayout } from './types'

const BASE_URL = '/api'

function authHeaders(): Record<string, string> {
  const stored = localStorage.getItem('orderwas-session')
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      const token = parsed?.state?.token
      if (token) return { Authorization: `Bearer ${token}` }
    } catch {
      // ignore
    }
  }
  return {}
}

function adminAuthHeaders(): Record<string, string> {
  const stored = localStorage.getItem('orderwas-session')
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      const adminToken = parsed?.state?.adminToken
      if (adminToken) return { Authorization: `Bearer ${adminToken}` }
    } catch {
      // ignore
    }
  }
  return {}
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...adminAuthHeaders(),
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export const api = {
  // Auth
  login: (waiterId: string, pin: string) =>
    request<{ token: string; waiter: Waiter }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ waiterId, pin }),
    }),

  // Admin Auth
  adminLogin: (pin: string) =>
    request<{ token: string }>('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  changeAdminPin: (newPin: string) =>
    request<{ ok: boolean }>('/auth/admin/pin', { method: 'PUT', body: JSON.stringify({ newPin }) }),

  // Events
  getEvents: () => request<Event[]>('/events'),
  getEvent: (id: string) => request<Event>(`/events/${id}`),
  createEvent: (data: { name: string; status?: string }) =>
    request<Event>('/events', { method: 'POST', body: JSON.stringify(data) }),
  updateEvent: (id: string, data: Partial<Event>) =>
    request<Event>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEvent: (id: string) =>
    request<void>(`/events/${id}`, { method: 'DELETE' }),

  // Stations
  getStations: (eventId: string) => request<Station[]>(`/events/${eventId}/stations`),
  getStation: (id: string) => request<Station>(`/stations/${id}`),
  createStation: (eventId: string, data: Partial<Station>) =>
    request<Station>(`/events/${eventId}/stations`, { method: 'POST', body: JSON.stringify(data) }),
  updateStation: (id: string, data: Partial<Station>) =>
    request<Station>(`/stations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStation: (id: string) =>
    request<void>(`/stations/${id}`, { method: 'DELETE' }),
  reorderStations: (items: { id: string; sortOrder: number }[]) =>
    request<{ ok: boolean }>('/stations/reorder', {
      method: 'POST',
      body: JSON.stringify(items),
    }),

  // Products
  getProducts: (stationId: string) => request<Product[]>(`/stations/${stationId}/products`),
  getProduct: (id: string) => request<Product>(`/products/${id}`),
  createProduct: (stationId: string, data: Partial<Product>) =>
    request<Product>(`/stations/${stationId}/products`, { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: string, data: Partial<Product>) =>
    request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id: string) =>
    request<void>(`/products/${id}`, { method: 'DELETE' }),
  adjustStock: (id: string, delta: number) =>
    request<{ id: string; name: string; stockCount: number; stockMode: string }>(`/products/${id}/stock`, { method: 'PATCH', body: JSON.stringify({ delta }) }),
  reorderProducts: (stationId: string, productIds: string[]) =>
    request<{ ok: boolean }>('/products/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ stationId, productIds }),
    }),

  // Extras (predefined customizations)
  createExtra: (productId: string, data: { name: string; multiSelect?: boolean; options: { name: string; priceDeltaCents?: number }[] }) =>
    request<ProductExtra>(`/products/${productId}/extras`, { method: 'POST', body: JSON.stringify(data) }),
  deleteExtra: (extraId: string) =>
    request<void>(`/extras/${extraId}`, { method: 'DELETE' }),

  // Waiters
  getWaiters: (eventId: string) => request<Waiter[]>(`/events/${eventId}/waiters`),
  createWaiter: (eventId: string, data: Partial<Waiter> & { pin?: string }) =>
    request<Waiter>(`/events/${eventId}/waiters`, { method: 'POST', body: JSON.stringify(data) }),
  updateWaiter: (id: string, data: Partial<Waiter>) =>
    request<Waiter>(`/waiters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWaiter: (id: string) =>
    request<void>(`/waiters/${id}`, { method: 'DELETE' }),

  // Layouts
  getLayouts: (eventId: string) => request<AppLayout[]>(`/events/${eventId}/layouts`),
  createLayout: (eventId: string, data: Partial<AppLayout>) =>
    request<AppLayout>(`/events/${eventId}/layouts`, { method: 'POST', body: JSON.stringify(data) }),
  updateLayout: (id: string, data: Partial<AppLayout>) =>
    request<AppLayout>(`/layouts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLayout: (id: string) =>
    request<void>(`/layouts/${id}`, { method: 'DELETE' }),
  getWaiterLayout: (waiterId: string) =>
    request<AppLayout | null>(`/waiters/${waiterId}/layout`),

  // Printers
  getPrinters: (eventId: string) => request<Printer[]>(`/events/${eventId}/printers`),
  createPrinter: (eventId: string, data: Partial<Printer>) =>
    request<Printer>(`/events/${eventId}/printers`, { method: 'POST', body: JSON.stringify(data) }),
  updatePrinter: (id: string, data: Partial<Printer>) =>
    request<Printer>(`/printers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePrinter: (id: string) =>
    request<void>(`/printers/${id}`, { method: 'DELETE' }),

  // Orders
  createOrder: (data: {
    tableNumber?: string
    pickupCode?: string
    waiterId: string
    eventId: string
    items: { productId: string; quantity?: number; comment?: string }[]
  }) => request<Order>('/orders', { method: 'POST', body: JSON.stringify(data) }),
  getOrders: (eventId: string) => request<Order[]>(`/events/${eventId}/orders`),
  getOrder: (id: string) => request<Order>(`/orders/${id}`),
  updateOrderStatus: (id: string, status: string) =>
    request<Order>(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  cancelOrder: (id: string, token: string) =>
    request<Order>(`/orders/${id}/cancel`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }),
  payOrder: (id: string, token: string) =>
    request<Order>(`/orders/${id}/pay`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }),
  reopenOrder: (id: string, token: string) =>
    request<Order>(`/orders/${id}/reopen`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }),
  updateOrderItem: (id: string, data: { comment?: string; status?: string }) =>
    request<OrderItem>(`/order-items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  cancelOrderItem: (id: string, token: string) =>
    request<OrderItem>(`/order-items/${id}/cancel`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }),

  // Audit & Reporting
  getAuditLogs: (eventId: string, opts?: { action?: string; entityType?: string }) => {
    const params = new URLSearchParams()
    if (opts?.action) params.set('action', opts.action)
    if (opts?.entityType) params.set('entityType', opts.entityType)
    const qs = params.toString()
    return request<any[]>(`/events/${eventId}/audit${qs ? `?${qs}` : ''}`)
  },
  getStockHistory: (eventId: string, productId: string) =>
    request<any[]>(`/events/${eventId}/audit/stock/${productId}`),
  settleStock: (productId: string, physicalCount: number) =>
    request<any>(`/products/${productId}/settle`, { method: 'POST', body: JSON.stringify({ physicalCount }) }),
  bulkSettle: (eventId: string, settlements: { productId: string; physicalCount: number }[]) =>
    request<any[]>(`/events/${eventId}/settle`, { method: 'POST', body: JSON.stringify({ settlements }) }),
  getPeakTimes: (eventId: string) =>
    request<{ hour: number; count: number }[]>(`/events/${eventId}/report/peak-times`),
  getStationRevenue: (eventId: string) =>
    request<{ stationId: string; stationName: string; totalItems: number; revenueCents: number }[]>(`/events/${eventId}/report/station-revenue`),
  getWaiterSummary: (eventId: string) =>
    request<any[]>(`/events/${eventId}/report/waiters`),
  getProductConsumption: (eventId: string) =>
    request<any[]>(`/events/${eventId}/report/products`),
}
