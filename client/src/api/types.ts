/**
 * Shared types matching the backend Prisma models.
 * These mirror the API response shapes.
 */

export interface Event {
  id: string
  name: string
  status: 'test' | 'live'
  hidePrices: boolean
  tseEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface Station {
  id: string
  name: string
  logo: string | null
  printerIp: string | null
  printerType: 'network' | 'ignore' | 'dummy'
  kitchenMonitor: boolean
  sortOrder: number
  copyPrint: boolean
  eventId: string
}

export interface Product {
  id: string
  name: string
  shortName: string | null
  priceCents: number
  taxRateBps: number
  stationId: string
  available: boolean
  isVoucher: boolean
  addable: boolean
  stockMode: 'none' | 'tracked' | 'composite'
  stockCount: number
  sortOrder: number
}

export interface Waiter {
  id: string
  name: string
  pin: string
  logo: string | null
  eventId: string
  printerIp: string | null
  printsImmediately: boolean
  canCancel: boolean
  canCashOut: boolean
  canStatistics: boolean
  canCreateWaiters: boolean
  canTransfer: boolean
  isStationWaiter: boolean
  hidden: boolean
  autoSammelbon: boolean
  active: boolean
}

export interface OrderItem {
  id: string
  orderId: string
  productId: string
  product: Product
  quantity: number
  status: 'open' | 'prepared' | 'delivered' | 'cancelled'
  comment: string | null
}

export interface Order {
  id: string
  tableNumber: string
  waiterId: string
  waiter?: Waiter
  eventId: string
  status: 'open' | 'preparing' | 'partial' | 'paid' | 'cancelled'
  totalCents: number
  comment: string | null
  tearOffNumber: number | null
  pickupCode: string | null
  createdAt: string
  updatedAt: string
  items: OrderItem[]
}