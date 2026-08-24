import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/db/client'
import {
  createProduct,
  listProductsByStation,
  getProduct,
  updateProduct,
  deleteProduct,
  ProductReferencedError,
} from '@/services/productService'
import { adjustStock } from '@/services/stockService'

const createProductSchema = z.object({
  name: z.string().min(1),
  priceCents: z.number().int(),
  shortName: z.string().optional(),
  taxRateBps: z.number().int().optional(),
  isVoucher: z.boolean().optional(),
  addable: z.boolean().optional(),
  stockMode: z.enum(['none', 'tracked', 'composite']).optional(),
  stockCount: z.number().optional(),
  sortOrder: z.number().int().optional(),
  color: z.string().nullable().optional(),
})

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  priceCents: z.number().int().optional(),
  shortName: z.string().nullable().optional(),
  taxRateBps: z.number().int().optional(),
  available: z.boolean().optional(),
  isVoucher: z.boolean().optional(),
  addable: z.boolean().optional(),
  stockMode: z.enum(['none', 'tracked', 'composite']).optional(),
  stockCount: z.number().optional(),
  sortOrder: z.number().int().optional(),
  color: z.string().nullable().optional(),
})

const createExtraSchema = z.object({
  name: z.string().min(1),
  multiSelect: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  options: z.array(z.object({
    name: z.string().min(1),
    priceDeltaCents: z.number().int().optional(),
    sortOrder: z.number().int().optional(),
  })).min(1),
})

const updateExtraSchema = z.object({
  name: z.string().min(1).optional(),
  multiSelect: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

export const productsRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // PATCH /products/reorder — bulk update sortOrder for products in a station
  const reorderSchema = z.object({
    stationId: z.string(),
    productIds: z.array(z.string()).nonempty(),
  })

  server.patch('/products/reorder', async (request, reply) => {
    const parsed = reorderSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    const { stationId, productIds } = parsed.data
    await prisma.$transaction(
      productIds.map((id, index) =>
        prisma.product.update({ where: { id }, data: { sortOrder: index } })
      )
    )
    return { ok: true }
  })

  // POST /stations/:stationId/products — create product under a station
  server.post('/stations/:stationId/products', async (request, reply) => {
    const { stationId } = request.params as { stationId: string }
    const parsed = createProductSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const station = await prisma.station.findUnique({ where: { id: stationId }, select: { id: true } })
    if (!station) return reply.status(404).send({ error: 'Station not found' })

    const product = await createProduct(stationId, parsed.data)
    return reply.status(201).send(product)
  })

  // GET /stations/:stationId/products — list products for station
  server.get('/stations/:stationId/products', async (request, reply) => {
    const { stationId } = request.params as { stationId: string }
    const station = await prisma.station.findUnique({ where: { id: stationId }, select: { id: true } })
    if (!station) return reply.status(404).send({ error: 'Station not found' })

    return listProductsByStation(stationId)
  })

  // GET /products/:id — single product
  server.get('/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const product = await getProduct(id)
    if (!product) return reply.status(404).send({ error: 'Product not found' })
    return product
  })

  // PUT /products/:id — update product
  server.put('/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updateProductSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const updated = await updateProduct(id, parsed.data)
    if (!updated) return reply.status(404).send({ error: 'Product not found' })
    return updated
  })

  // DELETE /products/:id — delete product (409 if referenced by OrderItems)
  server.delete('/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const deleted = await deleteProduct(id)
      if (!deleted) return reply.status(404).send({ error: 'Product not found' })
      return reply.status(204).send()
    } catch (err) {
      if (err instanceof ProductReferencedError) {
        return reply.status(409).send({ error: err.message })
      }
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // POST /products/:id/extras — create extra group with options
  server.post('/products/:id/extras', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = createExtraSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } })
    if (!product) return reply.status(404).send({ error: 'Product not found' })

    const { options, ...extraData } = parsed.data
    const extra = await prisma.productExtra.create({
      data: {
        productId: id,
        ...extraData,
        options: { create: options },
      },
      include: { options: true },
    })
    return reply.status(201).send(extra)
  })

  // DELETE /extras/:id — delete extra group (cascades options)
  server.delete('/extras/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.productExtra.delete({ where: { id } })
      return reply.status(204).send()
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2025') return reply.status(404).send({ error: 'Extra not found' })
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // PATCH /products/:id/stock — manual stock adjustment (delta)
  const adjustStockSchema = z.object({
    delta: z.number(),
  })

  server.patch('/products/:id/stock', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = adjustStockSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    try {
      const updated = await adjustStock(id, parsed.data.delta)
      return updated
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2025') return reply.status(404).send({ error: 'Product not found' })
      return reply.status(400).send({ error: (err as Error).message })
    }
  })
}
