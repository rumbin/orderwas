import type {
  Event,
  Station,
  Product,
  Waiter,
  Order,
  Printer,
  OrderItem,
} from './types'

export type { Event, Station, Product, Waiter, Order, OrderItem, Printer, Voucher } from './types'

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

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
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

  // Products
  getProducts: (stationId: string) => request<Product[]>(`/stations/${stationId}/products`),
  getProduct: (id: string) => request<Product>(`/products/${id}`),
  createProduct: (stationId: string, data: Partial<Product>) =>
    request<Product>(`/stations/${stationId}/products`, { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: string, data: Partial<Product>) =>
    request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id: string) =>
    request<void>(`/products/${id}`, { method: 'DELETE' }),

  // Waiters
  getWaiters: (eventId: string) => request<Waiter[]>(`/events/${eventId}/waiters`),
  createWaiter: (eventId: string, data: Partial<Waiter> & { pin?: string }) =>
    request<Waiter>(`/events/${eventId}/waiters`, { method: 'POST', body: JSON.stringify(data) }),
  updateWaiter: (id: string, data: Partial<Waiter>) =>
    request<Waiter>(`/waiters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWaiter: (id: string) =>
    request<void>(`/waiters/${id}`, { method: 'DELETE' }),

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
}