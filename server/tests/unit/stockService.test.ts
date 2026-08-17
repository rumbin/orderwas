import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { prisma } from '@/db/client'
import {
  checkStockAvailability,
  decrementStock,
  restoreStock,
  adjustStock,
  type StockItem,
} from '@/services/stockService'
import { addComponent } from '@/services/productService'

describe('Stock management', () => {
  let eventId: string
  let stationId: string
  let trackedProduct: { id: string; stockCount: number }
  let compositeProduct: { id: string }
  let ingredientA: { id: string; stockCount: number }
  let ingredientB: { id: string; stockCount: number }

  afterAll(async () => {
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.productComponent.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.productComponent.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})

    const ev = await prisma.event.create({ data: { name: 'Stock Test' } })
    eventId = ev.id
    const station = await prisma.station.create({ data: { name: 'Bar', eventId } })
    stationId = station.id

    // Tracked product with 10 in stock
    trackedProduct = await prisma.product.create({
      data: { name: 'Bier', priceCents: 300, stationId, stockMode: 'tracked', stockCount: 10 },
    })

    // Ingredients for composite
    ingredientA = await prisma.product.create({
      data: { name: 'Schnitzel', priceCents: 0, stationId, stockMode: 'tracked', stockCount: 5 },
    })
    ingredientB = await prisma.product.create({
      data: { name: 'Pommes', priceCents: 0, stationId, stockMode: 'tracked', stockCount: 8 },
    })

    // Composite: Schnitzel + Pommes
    compositeProduct = await prisma.product.create({
      data: { name: 'Schnitzel+Pommes', priceCents: 1200, stationId, stockMode: 'composite' },
    })
    await addComponent(compositeProduct.id, ingredientA.id, 1)
    await addComponent(compositeProduct.id, ingredientB.id, 1)
  })

  // --- checkStockAvailability ---

  it('tracked product: sufficient stock returns ok', async () => {
    const items: StockItem[] = [{ productId: trackedProduct.id, quantity: 5 }]
    const result = await checkStockAvailability(items)
    expect(result.ok).toBe(true)
  })

  it('tracked product: insufficient stock returns error', async () => {
    const items: StockItem[] = [{ productId: trackedProduct.id, quantity: 15 }]
    const result = await checkStockAvailability(items)
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0].productId).toBe(trackedProduct.id)
    expect(result.errors[0].available).toBe(10)
    expect(result.errors[0].requested).toBe(15)
  })

  it('composite product: sufficient ingredient stock returns ok', async () => {
    const items: StockItem[] = [{ productId: compositeProduct.id, quantity: 3 }]
    const result = await checkStockAvailability(items)
    expect(result.ok).toBe(true)
  })

  it('composite product: insufficient ingredient stock returns error', async () => {
    // ingredientA has 5, ordering 6 composites needs 6 Schnitzel
    const items: StockItem[] = [{ productId: compositeProduct.id, quantity: 6 }]
    const result = await checkStockAvailability(items)
    expect(result.ok).toBe(false)
    expect(result.errors[0].productId).toBe(ingredientA.id)
  })

  it('product with stockMode none always returns ok', async () => {
    const noStock = await prisma.product.create({
      data: { name: 'Wasser', priceCents: 100, stationId, stockMode: 'none' },
    })
    const items: StockItem[] = [{ productId: noStock.id, quantity: 999 }]
    const result = await checkStockAvailability(items)
    expect(result.ok).toBe(true)
  })

  it('multiple items: aggregates stock checks correctly', async () => {
    const items: StockItem[] = [
      { productId: trackedProduct.id, quantity: 8 },
      { productId: trackedProduct.id, quantity: 5 }, // total 13 > 10
    ]
    const result = await checkStockAvailability(items)
    expect(result.ok).toBe(false)
  })

  // --- decrementStock ---

  it('decrementStock reduces tracked product stock', async () => {
    await prisma.$transaction(async (tx) => {
      await decrementStock(tx, [{ productId: trackedProduct.id, quantity: 3 }])
    })
    const after = await prisma.product.findUnique({ where: { id: trackedProduct.id } })
    expect(after!.stockCount).toBe(7)
  })

  it('decrementStock reduces composite ingredient stocks', async () => {
    await prisma.$transaction(async (tx) => {
      await decrementStock(tx, [{ productId: compositeProduct.id, quantity: 2 }])
    })
    const a = await prisma.product.findUnique({ where: { id: ingredientA.id } })
    const b = await prisma.product.findUnique({ where: { id: ingredientB.id } })
    expect(a!.stockCount).toBe(3) // 5 - 2
    expect(b!.stockCount).toBe(6) // 8 - 2
  })

  it('decrementStock with multiple items aggregates correctly', async () => {
    await prisma.$transaction(async (tx) => {
      await decrementStock(tx, [
        { productId: trackedProduct.id, quantity: 4 },
        { productId: trackedProduct.id, quantity: 2 },
      ])
    })
    const after = await prisma.product.findUnique({ where: { id: trackedProduct.id } })
    expect(after!.stockCount).toBe(4) // 10 - 6
  })

  // --- restoreStock ---

  it('restoreStock increases stock back', async () => {
    // First decrement
    await prisma.$transaction(async (tx) => {
      await decrementStock(tx, [{ productId: trackedProduct.id, quantity: 3 }])
    })
    // Then restore
    await prisma.$transaction(async (tx) => {
      await restoreStock(tx, [{ productId: trackedProduct.id, quantity: 3 }])
    })
    const after = await prisma.product.findUnique({ where: { id: trackedProduct.id } })
    expect(after!.stockCount).toBe(10)
  })

  it('restoreStock works for composite ingredients', async () => {
    await prisma.$transaction(async (tx) => {
      await decrementStock(tx, [{ productId: compositeProduct.id, quantity: 2 }])
    })
    await prisma.$transaction(async (tx) => {
      await restoreStock(tx, [{ productId: compositeProduct.id, quantity: 2 }])
    })
    const a = await prisma.product.findUnique({ where: { id: ingredientA.id } })
    const b = await prisma.product.findUnique({ where: { id: ingredientB.id } })
    expect(a!.stockCount).toBe(5)
    expect(b!.stockCount).toBe(8)
  })

  // --- adjustStock ---

  it('adjustStock adds to current stock', async () => {
    await adjustStock(trackedProduct.id, 5)
    const after = await prisma.product.findUnique({ where: { id: trackedProduct.id } })
    expect(after!.stockCount).toBe(15)
  })

  it('adjustStock can reduce stock', async () => {
    await adjustStock(trackedProduct.id, -3)
    const after = await prisma.product.findUnique({ where: { id: trackedProduct.id } })
    expect(after!.stockCount).toBe(7)
  })

  it('adjustStock returns updated product', async () => {
    const result = await adjustStock(trackedProduct.id, 0)
    expect(result.id).toBe(trackedProduct.id)
    expect(result.stockCount).toBe(10)
  })
})
