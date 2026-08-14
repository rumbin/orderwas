import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/db/client'

const createProductSchema = z.object({
  name: z.string().min(1),
  price: z.number(),
  shortName: z.string().optional(),
  taxRate: z.number().default(20.0),
  isVoucher: z.boolean().optional(),
  addable: z.boolean().optional(),
  stockMode: z.enum(['none', 'tracked', 'composite']).optional(),
  stockCount: z.number().optional(),
  sortOrder: z.number().int().optional(),
})

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().optional(),
  shortName: z.string().nullable().optional(),
  taxRate: z.number().optional(),
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

    const product = await prisma.product.create({ data: { stationId, ...parsed.data } })
    return reply.status(201).send(product)
  })

  // GET /stations/:stationId/products — list products for station
  server.get('/stations/:stationId/products', async (request, reply) => {
    const { stationId } = request.params as { stationId: string }
    const station = await prisma.station.findUnique({ where: { id: stationId }, select: { id: true } })
    if (!station) return reply.status(404).send({ error: 'Station not found' })

    const products = await prisma.product.findMany({
      where: { stationId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    return reply.status(200).send(products)
  })

  // GET /products/:id — single product
  server.get('/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const product = await prisma.product.findUnique({ where: { id } })
    if (!product) return reply.status(404).send({ error: 'Product not found' })
    return reply.status(200).send(product)
  })

  // PUT /products/:id — update product
  server.put('/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updateProductSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    try {
      const updated = await prisma.product.update({ where: { id }, data: parsed.data })
      return reply.status(200).send(updated)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2025') return reply.status(404).send({ error: 'Product not found' })
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // DELETE /products/:id — delete product (409 if referenced by OrderItems)
  server.delete('/products/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } })
    if (!product) return reply.status(404).send({ error: 'Product not found' })

    const refCount = await prisma.orderItem.count({ where: { productId: id } })
    if (refCount > 0) return reply.status(409).send({ error: 'Product is referenced by orders and cannot be deleted' })

    await prisma.product.delete({ where: { id } })
    return reply.status(204).send()
  })
}
