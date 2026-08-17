import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  createOrder,
  listOrdersByEvent,
  getOrder,
  updateOrderStatus,
  cancelOrder,
  markPaid,
  reopenOrder,
  OrderValidationError,
} from '@/services/orderService'
import { updateItem, cancelItem, OrderItemValidationError } from '@/services/orderItemService'

const createOrderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive().optional().default(1),
  comment: z.string().optional(),
})

const createOrderBody = z.object({
  tableNumber: z.string().min(1).optional(),
  pickupCode: z.string().min(1).optional(),
  waiterId: z.string().min(1),
  eventId: z.string().min(1),
  items: z.array(createOrderItemSchema).nonempty({ message: 'items must not be empty' }),
}).refine(
  (data) => Boolean(data.tableNumber) !== Boolean(data.pickupCode),
  { message: 'Exactly one of tableNumber or pickupCode must be provided' },
)

const updateOrderStatusBody = z.object({
  status: z.enum(['open', 'preparing', 'partial', 'paid', 'cancelled']),
})

const updateOrderItemBody = z.object({
  comment: z.string().optional(),
  status: z.enum(['open', 'prepared', 'delivered', 'cancelled']).optional(),
}).refine((data) => data.comment !== undefined || data.status !== undefined, {
  message: 'Nothing to update',
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

  // PATCH /orders/:id — update order status (generic)
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

  // POST /orders/:id/cancel — cancel full order (requires canCancel)
  server.post('/orders/:id/cancel', {
    preHandler: server.requirePermission('canCancel'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const order = await cancelOrder(id)
      return reply.status(200).send(order)
    } catch (err) {
      if (err instanceof OrderValidationError) {
        return reply.status(err.statusCode).send({ error: err.message })
      }
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // POST /orders/:id/pay — mark order paid (requires canCashOut)
  server.post('/orders/:id/pay', {
    preHandler: server.requirePermission('canCashOut'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const order = await markPaid(id)
      return reply.status(200).send(order)
    } catch (err) {
      if (err instanceof OrderValidationError) {
        return reply.status(err.statusCode).send({ error: err.message })
      }
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // POST /orders/:id/reopen — reopen paid order (requires canCashOut)
  server.post('/orders/:id/reopen', {
    preHandler: server.requirePermission('canCashOut'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const order = await reopenOrder(id)
      return reply.status(200).send(order)
    } catch (err) {
      if (err instanceof OrderValidationError) {
        return reply.status(err.statusCode).send({ error: err.message })
      }
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // PATCH /order-items/:id — update item comment/status
  server.patch('/order-items/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updateOrderItemBody.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    try {
      const item = await updateItem(id, parsed.data)
      return reply.status(200).send(item)
    } catch (err) {
      if (err instanceof OrderItemValidationError) {
        return reply.status(err.statusCode).send({ error: err.message })
      }
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // POST /order-items/:id/cancel — cancel single item (requires canCancel)
  server.post('/order-items/:id/cancel', {
    preHandler: server.requirePermission('canCancel'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const item = await cancelItem(id)
      return reply.status(200).send(item)
    } catch (err) {
      if (err instanceof OrderItemValidationError) {
        return reply.status(err.statusCode).send({ error: err.message })
      }
      return reply.status(400).send({ error: (err as Error).message })
    }
  })
}