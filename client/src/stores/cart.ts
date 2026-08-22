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
  variant?: string // free-text label, e.g. "mit Ketchup", undefined = "Standard"
  options?: SelectedOption[]
}

interface CartState {
  items: CartItem[]
  tableNumber: string
  setTableNumber: (n: string) => void
  addItem: (product: Product, options?: SelectedOption[], variant?: string) => void
  removeItem: (index: number) => void
  decrementItem: (index: number) => void
  // Variant management
  setVariantQuantity: (productId: string, variant: string, delta: number) => void
  addVariant: (productId: string, variant: string) => void
  clear: () => void
  total: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  tableNumber: '',
  setTableNumber: (n) => set({ tableNumber: n }),
  addItem: (product, options, variant) =>
    set((state) => {
      const v = variant ?? 'Standard'
      const sameOpts = (a?: SelectedOption[], b?: SelectedOption[]) => {
        if (!a && !b) return true
        if (!a || !b || a.length !== b.length) return false
        const key = (opts: SelectedOption[]) => opts.map((o) => o.optionId).sort().join(',')
        return key(a) === key(b)
      }
      const existingIdx = state.items.findIndex(
        (i) => i.product.id === product.id && (i.variant ?? 'Standard') === v && sameOpts(i.options, options),
      )
      if (existingIdx >= 0) {
        return {
          items: state.items.map((i, idx) =>
            idx === existingIdx ? { ...i, quantity: i.quantity + 1 } : i,
          ),
        }
      }
      return { items: [...state.items, { product, quantity: 1, variant, options }] }
    }),
  removeItem: (index) =>
    set((state) => ({ items: state.items.filter((_, idx) => idx !== index) })),
  decrementItem: (index) =>
    set((state) => ({
      items: state.items
        .map((i, idx) => (idx === index ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0),
    })),
  // Adjust quantity of a specific variant for a product. Removes the item if quantity drops to 0.
  setVariantQuantity: (productId, variant, delta) =>
    set((state) => {
      const idx = state.items.findIndex(
        (i) => i.product.id === productId && (i.variant ?? 'Standard') === variant,
      )
      if (idx < 0) return state
      const item = state.items[idx]
      const newQty = item.quantity + delta
      if (newQty <= 0) {
        return { items: state.items.filter((_, i) => i !== idx) }
      }
      return {
        items: state.items.map((i, idx2) => (idx2 === idx ? { ...i, quantity: newQty } : i)),
      }
    }),
  // Add a brand-new variant for a product (starts at quantity 0 — caller must increment)
  addVariant: (productId, variant) =>
    set((state) => {
      const product = state.items.find((i) => i.product.id === productId)?.product
      if (!product) return state
      // Don't add duplicate variant names
      const exists = state.items.some(
        (i) => i.product.id === productId && (i.variant ?? 'Standard') === variant,
      )
      if (exists) return state
      return {
        items: [...state.items, { product, quantity: 0, variant }],
      }
    }),
  clear: () => set({ items: [], tableNumber: '' }),
  total: () =>
    get().items.reduce(
      (sum, i) =>
        sum +
        (i.product.priceCents + (i.options?.reduce((s, o) => s + o.priceDeltaCents, 0) ?? 0)) * i.quantity,
      0,
    ),
}))
