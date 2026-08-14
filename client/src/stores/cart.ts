import { create } from 'zustand'
import type { Product } from '@/api/types'

interface CartItem {
  product: Product
  quantity: number
  comment?: string
}

interface CartState {
  items: CartItem[]
  tableNumber: string
  setTableNumber: (n: string) => void
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  incrementItem: (productId: string) => void
  decrementItem: (productId: string) => void
  clear: () => void
  total: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  tableNumber: '',
  setTableNumber: (n) => set({ tableNumber: n }),
  addItem: (product) =>
    set((state) => {
      const existing = state.items.find((i) => i.product.id === product.id)
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product.id === product.id
              ? { ...i, quantity: i.quantity + 1 }
              : i,
          ),
        }
      }
      return { items: [...state.items, { product, quantity: 1 }] }
    }),
  removeItem: (productId) =>
    set((state) => ({
      items: state.items.filter((i) => i.product.id !== productId),
    })),
  incrementItem: (productId) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.product.id === productId
          ? { ...i, quantity: i.quantity + 1 }
          : i,
      ),
    })),
  decrementItem: (productId) =>
    set((state) => ({
      items: state.items
        .map((i) =>
          i.product.id === productId
            ? { ...i, quantity: i.quantity - 1 }
            : i,
        )
        .filter((i) => i.quantity > 0),
    })),
  clear: () => set({ items: [], tableNumber: '' }),
  total: () =>
    get().items.reduce((sum, i) => sum + i.product.priceCents * i.quantity, 0),
}))