import type {
  Event,
  Station,
  Product,
  Waiter,
  Order,
} from './types'

export type { Event, Station, Product, Waiter, Order, OrderItem } from './types'

const BASE_URL = '/api'

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${response.status}`)
  }

  // Handle 204 No Content (DELETE responses)
  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export const api = {
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
  createWaiter: (eventId: string, data: Partial<Waiter>) =>
    request<Waiter>(`/events/${eventId}/waiters`, { method: 'POST', body: JSON.stringify(data) }),
  updateWaiter: (id: string, data: Partial<Waiter>) =>
    request<Waiter>(`/waiters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWaiter: (id: string) =>
    request<void>(`/waiters/${id}`, { method: 'DELETE' }),

  // Orders
  createOrder: (data: {
    tableNumber: string
    waiterId: string
    eventId: string
    items: { productId: string; quantity?: number; comment?: string }[]
  }) => request<Order>('/orders', { method: 'POST', body: JSON.stringify(data) }),
  getOrders: (eventId: string) => request<Order[]>(`/events/${eventId}/orders`),
  getOrder: (id: string) => request<Order>(`/orders/${id}`),
  updateOrderStatus: (id: string, status: string) =>
    request<Order>(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
}