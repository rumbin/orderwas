import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createOrder, listOrdersByEvent, getOrder, updateOrderStatus, OrderValidationError } from '@/services/orderService'

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
  status: z.enum(['open', 'preparing', 'partial', 'paid', 'cancelled']),
})

export const ordersRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // POST /orders — create order
  server.post('/orders', async (request, reply) => {
    const parsed = createOrderBody.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    try {
      const order = await createOrder(parsed.data)
      return reply.status(201).send(order)
    } catch (err) {
      if (err instanceof OrderValidationError) {
        return reply.status(err.statusCode).send({ error: err.message })
      }
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // GET /events/:eventId/orders — list orders for event
  server.get('/events/:eventId/orders', async (request) => {
    const { eventId } = request.params as { eventId: string }
    return listOrdersByEvent(eventId)
  })

  // GET /orders/:id — single order with items
  server.get('/orders/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const order = await getOrder(id)
    if (!order) return reply.status(404).send({ error: 'Order not found' })
    return order
  })

  // PATCH /orders/:id — update order status
  server.patch('/orders/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updateOrderStatusBody.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    try {
      const order = await updateOrderStatus(id, parsed.data.status)
      return reply.status(200).send(order)
    } catch (err) {
      if (err instanceof OrderValidationError) {
        return reply.status(err.statusCode).send({ error: err.message })
      }
      return reply.status(400).send({ error: (err as Error).message })
    }
  })
}
