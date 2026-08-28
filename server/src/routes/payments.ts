import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  payItems,
  listOpenTables,
  listUnpaidByTable,
} from '@/services/paymentService'
import { OrderValidationError } from '@/services/orderService'

const payItemsBody = z.object({
  itemIds: z.array(z.string().min(1)).min(1, 'No items selected'),
})

export const paymentsRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // POST /orders/pay-items — pay a batch of order items
  server.post('/orders/pay-items', {
    preHandler: server.requirePermission('canCashOut'),
  }, async (request: any, reply) => {
    const parsed = payItemsBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() })
    }

    const waiterId = request.user?.waiterId as string | undefined
    if (!waiterId) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    try {
      const result = await payItems(parsed.data.itemIds, waiterId)
      return reply.status(200).send(result)
    } catch (err) {
      if (err instanceof OrderValidationError) {
        return reply.status(err.statusCode).send({ error: err.message })
      }
      throw err
    }
  })

  // GET /events/:eventId/tables/open — tables with unpaid items + open sums
  server.get('/events/:eventId/tables/open', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    try {
      const tables = await listOpenTables(eventId)
      return reply.status(200).send(tables)
    } catch (err) {
      throw err
    }
  })

  // GET /events/:eventId/tables/:tableNumber/unpaid — orders of a table with paid/unpaid items
  server.get('/events/:eventId/tables/:tableNumber/unpaid', async (request, reply) => {
    const { eventId, tableNumber } = request.params as { eventId: string; tableNumber: string }
    try {
      const orders = await listUnpaidByTable(eventId, tableNumber)
      return reply.status(200).send(orders)
    } catch (err) {
      throw err
    }
  })
}
