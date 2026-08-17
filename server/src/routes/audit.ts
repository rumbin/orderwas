import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  listAuditLogs,
  settleStock,
  getStockHistory,
  getPeakTimes,
  getStationRevenue,
  getWaiterSummary,
  getProductConsumption,
} from '@/services/auditService'

export const auditRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // GET /api/events/:eventId/audit — list audit logs
  server.get('/events/:eventId/audit', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const query = request.query as { action?: string; entityType?: string; limit?: string; offset?: string }
    const logs = await listAuditLogs(eventId, {
      action: query.action,
      entityType: query.entityType,
      limit: query.limit ? parseInt(query.limit) : undefined,
      offset: query.offset ? parseInt(query.offset) : undefined,
    })
    return logs
  })

  // GET /api/events/:eventId/audit/stock/:productId — stock history for a product
  server.get('/events/:eventId/audit/stock/:productId', async (request, reply) => {
    const { eventId, productId } = request.params as { eventId: string; productId: string }
    return getStockHistory(eventId, productId)
  })

  // POST /api/products/:id/settle — stock settlement (physical count)
  const settleSchema = z.object({
    physicalCount: z.number().min(0),
  })

  server.post('/products/:id/settle', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = settleSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    // Extract actor from JWT if present
    let actorId: string | undefined
    let actorName: string | undefined
    try {
      const decoded = server.jwt.verify<{ waiterId: string }>(request.headers.authorization?.replace('Bearer ', '') ?? '')
      actorId = decoded.waiterId
    } catch {
      // No auth — system action
    }

    try {
      // Resolve eventId from product
      const { prisma } = await import('@/db/client')
      const product = await prisma.product.findUnique({
        where: { id },
        select: { station: { select: { eventId: true } } },
      })
      if (!product) return reply.status(404).send({ error: 'Product not found' })

      const updated = await settleStock(
        product.station.eventId,
        id,
        parsed.data.physicalCount,
        actorId,
        actorName,
      )
      return updated
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // POST /api/events/:eventId/settle — bulk stock settlement
  const bulkSettleSchema = z.object({
    settlements: z.array(z.object({
      productId: z.string(),
      physicalCount: z.number().min(0),
    })),
  })

  server.post('/events/:eventId/settle', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const parsed = bulkSettleSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    let actorId: string | undefined
    let actorName: string | undefined
    try {
      const decoded = server.jwt.verify<{ waiterId: string }>(request.headers.authorization?.replace('Bearer ', '') ?? '')
      actorId = decoded.waiterId
    } catch {
      // No auth
    }

    const results = []
    for (const s of parsed.data.settlements) {
      try {
        const updated = await settleStock(eventId, s.productId, s.physicalCount, actorId, actorName)
        results.push({ productId: s.productId, success: true, stockCount: updated.stockCount })
      } catch (err) {
        results.push({ productId: s.productId, success: false, error: (err as Error).message })
      }
    }
    return results
  })

  // GET /api/events/:eventId/report/peak-times — order counts by hour
  server.get('/events/:eventId/report/peak-times', async (request) => {
    const { eventId } = request.params as { eventId: string }
    return getPeakTimes(eventId)
  })

  // GET /api/events/:eventId/report/station-revenue — per-station revenue
  server.get('/events/:eventId/report/station-revenue', async (request) => {
    const { eventId } = request.params as { eventId: string }
    return getStationRevenue(eventId)
  })

  // GET /api/events/:eventId/report/waiters — per-waiter summary
  server.get('/events/:eventId/report/waiters', async (request) => {
    const { eventId } = request.params as { eventId: string }
    return getWaiterSummary(eventId)
  })

  // GET /api/events/:eventId/report/products — product consumption
  server.get('/events/:eventId/report/products', async (request) => {
    const { eventId } = request.params as { eventId: string }
    return getProductConsumption(eventId)
  })
}
