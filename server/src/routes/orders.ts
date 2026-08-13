import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/db/client'

const VALID_STATUSES = ['open', 'preparing', 'partial', 'paid', 'cancelled'] as const

const createOrderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive().optional().default(1),
  comment: z.string().optional(),
})

const createOrderBody = z.object({
  tableNumber: z.string().min(1),
  waiterId: z.string().min(1),
  eventId: z.string().min(1),
  items: z.array(createOrderItemSchema).nonempty({ message: 'items must not be empty' }),
})

const updateOrderStatusBody = z.object({
  status: z.enum(VALID_STATUSES),
})

export const ordersRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // POST /orders — create order
  server.post('/orders', async (request, reply) => {
    const parsed = createOrderBody.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    const { tableNumber, waiterId, eventId, items } = parsed.data

    // Validate waiter exists
    const waiter = await prisma.waiter.findUnique({ where: { id: waiterId }, select: { id: true } })
    if (!waiter) return reply.status(400).send({ error: 'Waiter does not exist' })

    // Validate event exists
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
    if (!event) return reply.status(400).send({ error: 'Event does not exist' })

    // Fetch product prices and validate all product IDs
    const productIds = items.map((i) => i.productId)
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, price: true } })
    if (products.length !== new Set(productIds).size) {
      return reply.status(400).send({ error: 'One or more products do not exist' })
    }

    const priceMap = new Map(products.map((p) => [p.id, p.price] as const))
    const total = items.reduce((sum, item) => sum + (priceMap.get(item.productId) ?? 0) * item.quantity, 0)

    try {
      const order = await prisma.order.create({
        data: {
          tableNumber,
          waiterId,
          eventId,
          total,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              comment: item.comment,
            })),
          },
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, price: true } } } },
        },
      })
      return reply.status(201).send(order)
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // GET /events/:eventId/orders — list orders for event
  server.get('/events/:eventId/orders', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const orders = await prisma.order.findMany({
      where: { eventId },
      include: {
        items: { include: { product: { select: { id: true, name: true, price: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return reply.status(200).send(orders)
  })

  // GET /orders/:id — single order with items
  server.get('/orders/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { id: true, name: true, price: true } } } },
      },
    })
    if (!order) return reply.status(404).send({ error: 'Order not found' })
    return reply.status(200).send(order)
  })

  // PATCH /orders/:id — update order status
  server.patch('/orders/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updateOrderStatusBody.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const order = await prisma.order.update({ where: { id }, data: { status: parsed.data.status } })
      return reply.status(200).send(order)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2025') return reply.status(404).send({ error: 'Order not found' })
      return reply.status(400).send({ error: (err as Error).message })
    }
  })
}