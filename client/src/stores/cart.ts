import { create } from 'zustand'
import type { Product } from '@/api/types'

export interface SelectedOption {
  extraId: string
  optionId: string
  extraName: string
  optionName: string
  priceDeltaCents: number
}

interface CartItem {
  product: Product
  quantity: number
  comment?: string
  options?: SelectedOption[] // per-unit selections
}

interface CartState {
  items: CartItem[]
  tableNumber: string
  setTableNumber: (n: string) => void
  addItem: (product: Product, options?: SelectedOption[]) => void
  removeItem: (index: number) => void
  decrementItem: (index: number) => void
  setItemComment: (index: number, comment: string) => void
  clear: () => void
  total: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  tableNumber: '',
  setTableNumber: (n) => set({ tableNumber: n }),
  // Items with identical product+options merge; different options stay separate lines
  addItem: (product, options) =>
    set((state) => {
      const sameOpts = (a?: SelectedOption[], b?: SelectedOption[]) => {
        if (!a && !b) return true
        if (!a || !b || a.length !== b.length) return false
        const key = (opts: SelectedOption[]) => opts.map((o) => o.optionId).sort().join(',')
        return key(a) === key(b)
      }
      const existingIdx = state.items.findIndex((i) => i.product.id === product.id && sameOpts(i.options, options))
      if (existingIdx >= 0) {
        return {
          items: state.items.map((i, idx) =>
            idx === existingIdx ? { ...i, quantity: i.quantity + 1 } : i,
          ),
        }
      }
      return { items: [...state.items, { product, quantity: 1, options }] }
    }),
  removeItem: (index) =>
    set((state) => ({ items: state.items.filter((_, idx) => idx !== index) })),
  decrementItem: (index) =>
    set((state) => ({
      items: state.items
        .map((i, idx) => (idx === index ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0),
    })),
  setItemComment: (index, comment) =>
    set((state) => ({
      items: state.items.map((i, idx) =>
        idx === index ? { ...i, comment: comment || undefined } : i,
      ),
    })),
  clear: () => set({ items: [], tableNumber: '' }),
  total: () =>
    get().items.reduce(
      (sum, i) =>
        sum +
        (i.product.priceCents + (i.options?.reduce((s, o) => s + o.priceDeltaCents, 0) ?? 0)) * i.quantity,
      0,
    ),
}))