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
})

export const productsRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
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
}
