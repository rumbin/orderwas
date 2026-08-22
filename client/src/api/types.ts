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
  lastTearOffNumber: number
  createdAt: string
  updatedAt: string
}

export interface Printer {
  id: string
  name: string
  type: 'network' | 'ignore' | 'dummy'
  ip: string | null
  charsPerLine: number
  font: string
  buzzer: boolean
  paperCut: 'full' | 'partial' | 'none'
  eventId: string
}

export interface Station {
  id: string
  name: string
  logo: string | null
  printerId: string | null
  printer?: Printer | null
  kitchenMonitor: boolean
  sortOrder: number
  copyPrint: boolean
  eventId: string
}

export interface ProductExtraOption {
  id: string
  extraId: string
  name: string
  priceDeltaCents: number
  sortOrder: number
}

export interface ProductExtra {
  id: string
  productId: string
  name: string
  multiSelect: boolean
  sortOrder: number
  options: ProductExtraOption[]
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
  extras?: ProductExtra[]
}

export interface Waiter {
  id: string
  name: string
  logo: string | null
  eventId: string
  printerId: string | null
  pickupCode: string | null
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
  options: string | null // JSON: [{extraName, optionName, priceDeltaCents}]
}

export interface Order {
  id: string
  tableNumber: string | null
  waiterId: string
  waiter?: Waiter
  eventId: string
  status: 'open' | 'preparing' | 'partial' | 'paid' | 'cancelled'
  totalCents: number
  comment: string | null
  tearOffNumber: number | null
  pickupCode: string | null
  sammelbonId: string | null
  createdAt: string
  updatedAt: string
  items: OrderItem[]
}

export interface AppLayout {
  id: string
  eventId: string
  waiterId: string | null
  columns: number
  rows: number
  buttons: string // JSON string
  createdAt: string
  updatedAt: string
}

export interface Voucher {
  id: string
  eventId: string
  code: string
  valueCents: number
  status: 'active' | 'redeemed' | 'expired'
  redeemedOrderId: string | null
  createdAt: string
  redeemedAt: string | null
}