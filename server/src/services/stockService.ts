import { prisma } from '@/db/client'
import type { Prisma } from '@prisma/client'
import { expandComponents } from '@/services/productService'

export interface StockItem {
  productId: string
  quantity: number
}

export interface StockCheckResult {
  ok: boolean
  errors: Array<{
    productId: string
    productName: string
    available: number
    requested: number
  }>
}

/**
 * Checks if sufficient stock is available for all items.
 * Products with stockMode 'none' are always available.
 * Products with stockMode 'tracked' check stockCount directly.
 * Products with stockMode 'composite' expand into ingredient checks.
 */
export async function checkStockAvailability(items: StockItem[]): Promise<StockCheckResult> {
  // Aggregate quantities per product (multiple items may reference the same product)
  const quantities = new Map<string, number>()
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)
  }

  const productIds = [...quantities.keys()]
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, stockMode: true, stockCount: true },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  const errors: StockCheckResult['errors'] = []

  for (const [productId, totalQty] of quantities) {
    const product = productMap.get(productId)
    if (!product) {
      errors.push({ productId, productName: 'Unknown', available: 0, requested: totalQty })
      continue
    }

    if (product.stockMode === 'none') continue

    if (product.stockMode === 'tracked') {
      if (product.stockCount < totalQty) {
        errors.push({
          productId,
          productName: product.name,
          available: product.stockCount,
          requested: totalQty,
        })
      }
    }

    if (product.stockMode === 'composite') {
      const components = await expandComponents(productId)
      for (const comp of components) {
        const needed = comp.quantity * totalQty
        const ingredient = await prisma.product.findUnique({
          where: { id: comp.ingredientId },
          select: { id: true, name: true, stockCount: true, stockMode: true },
        })
        if (!ingredient) {
          errors.push({
            productId: comp.ingredientId,
            productName: comp.ingredientName,
            available: 0,
            requested: needed,
          })
          continue
        }
        if (ingredient.stockMode !== 'none' && ingredient.stockCount < needed) {
          errors.push({
            productId: comp.ingredientId,
            productName: ingredient.name,
            available: ingredient.stockCount,
            requested: needed,
          })
        }
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Atomically decrements stock for order items within a transaction.
 * Must be called inside a prisma.$transaction block.
 */
export async function decrementStock(
  tx: Prisma.TransactionClient,
  items: StockItem[],
): Promise<void> {
  // Aggregate quantities per product
  const quantities = new Map<string, number>()
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)
  }

  const productIds = [...quantities.keys()]
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, stockMode: true },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  for (const [productId, totalQty] of quantities) {
    const product = productMap.get(productId)
    if (!product || product.stockMode === 'none') continue

    if (product.stockMode === 'tracked') {
      await tx.product.update({
        where: { id: productId },
        data: { stockCount: { decrement: totalQty } },
      })
    }

    if (product.stockMode === 'composite') {
      const components = await expandComponents(productId)
      for (const comp of components) {
        const ingredientQty = comp.quantity * totalQty
        await tx.product.update({
          where: { id: comp.ingredientId },
          data: { stockCount: { decrement: ingredientQty } },
        })
      }
    }
  }
}

/**
 * Restores stock for order items within a transaction.
 * Used when an order is cancelled.
 */
export async function restoreStock(
  tx: Prisma.TransactionClient,
  items: StockItem[],
): Promise<void> {
  // Same logic as decrement but with increment
  const quantities = new Map<string, number>()
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)
  }

  const productIds = [...quantities.keys()]
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, stockMode: true },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  for (const [productId, totalQty] of quantities) {
    const product = productMap.get(productId)
    if (!product || product.stockMode === 'none') continue

    if (product.stockMode === 'tracked') {
      await tx.product.update({
        where: { id: productId },
        data: { stockCount: { increment: totalQty } },
      })
    }

    if (product.stockMode === 'composite') {
      const components = await expandComponents(productId)
      for (const comp of components) {
        const ingredientQty = comp.quantity * totalQty
        await tx.product.update({
          where: { id: comp.ingredientId },
          data: { stockCount: { increment: ingredientQty } },
        })
      }
    }
  }
}

/**
 * Manually adjusts stock for a product (delta can be positive or negative).
 * Returns the updated product.
 */
export async function adjustStock(productId: string, delta: number) {
  return prisma.product.update({
    where: { id: productId },
    data: { stockCount: { increment: delta } },
    select: { id: true, name: true, stockCount: true, stockMode: true },
  })
}
