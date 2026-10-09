import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  payItems,
  listOpenTables,
  listUnpaidByTable,
  listUnpaidForCounter,
} from '@/services/paymentService'
import { OrderValidationError, nextCounterBon } from '@/services/orderService'
import type { JwtPayload } from '@/plugins/auth'

const payItemsBody = z.object({
  itemIds: z.array(z.string().min(1)).min(1, 'No items selected'),
})

export const paymentsRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // POST /orders/pay-items — pay a batch of order items
  server.post('/orders/pay-items', {
    preHandler: server.requirePermission('canCashOut'),
  }, async (request, reply) => {
    const parsed = payItemsBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() })
    }

    const payload = (await request.jwtVerify()) as JwtPayload
    const waiterId = payload.waiterId
    if (!waiterId) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    try {
      const result = await payItems(parsed.data.itemIds, waiterId, payload.eventId)
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
    const tables = await listOpenTables(eventId)
    return reply.status(200).send(tables)
  })

  // GET /events/:eventId/tables/:tableNumber/unpaid — orders of a table with paid/unpaid items
  server.get('/events/:eventId/tables/:tableNumber/unpaid', async (request, reply) => {
    const { eventId, tableNumber } = request.params as { eventId: string; tableNumber: string }
    const orders = await listUnpaidByTable(eventId, tableNumber)
    return reply.status(200).send(orders)
  })

  // GET /events/:eventId/counter/unpaid — the open counter (Theke) order, if any.
  // The counter cashes out one Bon at a time, so there is never a selection:
  // this returns the most recent unpaid counter order (0 or 1 entries).
  server.get('/events/:eventId/counter/unpaid', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const orders = await listUnpaidForCounter(eventId)
    return reply.status(200).send(orders)
  })

  // GET /events/:eventId/counter/next-bon — the number to pre-fill on the order page.
  // The next Bon is whatever follows the last order registered at this counter
  // (never a stored max: a fresh tear-off block starts at 1 again, and the
  // operator may override the pre-filled number per order).
  server.get('/events/:eventId/counter/next-bon', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    return reply.status(200).send({ nextBon: await nextCounterBon(eventId) })
  })
}
