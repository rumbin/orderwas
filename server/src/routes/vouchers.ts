import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  createVoucher,
  redeemVoucher,
  listVouchers,
  bulkCreateVouchers,
  expireVoucher,
  VoucherError,
} from '@/services/voucherService'

const createVoucherSchema = z.object({
  code: z.string().min(1),
  valueCents: z.number().int().min(0),
})

const redeemSchema = z.object({
  code: z.string().min(1),
  orderId: z.string().min(1),
})

const bulkCreateSchema = z.object({
  prefix: z.string().min(1),
  valueCents: z.number().int().min(0),
  count: z.number().int().min(1).max(1000),
  startNumber: z.number().int().optional(),
})

export const voucherRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // GET /events/:eventId/vouchers — list vouchers
  server.get('/events/:eventId/vouchers', async (request) => {
    const { eventId } = request.params as { eventId: string }
    const query = request.query as { status?: string }
    return listVouchers(eventId, query.status)
  })

  // POST /events/:eventId/vouchers — create single voucher
  server.post('/events/:eventId/vouchers', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const parsed = createVoucherSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    try {
      const voucher = await createVoucher(eventId, parsed.data.code, parsed.data.valueCents)
      return reply.status(201).send(voucher)
    } catch (err) {
      if (err instanceof VoucherError) return reply.status(err.statusCode).send({ error: err.message })
      throw err
    }
  })

  // POST /events/:eventId/vouchers/bulk — bulk create
  server.post('/events/:eventId/vouchers/bulk', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const parsed = bulkCreateSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const vouchers = await bulkCreateVouchers(
      eventId,
      parsed.data.prefix,
      parsed.data.valueCents,
      parsed.data.count,
      parsed.data.startNumber,
    )
    return reply.status(201).send({ count: vouchers.length, vouchers })
  })

  // POST /vouchers/redeem — redeem a voucher
  server.post('/vouchers/redeem', async (request, reply) => {
    const parsed = redeemSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    // Need eventId — derive from orderId
    const { prisma } = await import('@/db/client')
    const order = await prisma.order.findUnique({
      where: { id: parsed.data.orderId },
      select: { eventId: true },
    })
    if (!order) return reply.status(404).send({ error: 'Order not found' })

    try {
      const voucher = await redeemVoucher(order.eventId, parsed.data.code, parsed.data.orderId)
      return voucher
    } catch (err) {
      if (err instanceof VoucherError) return reply.status(err.statusCode).send({ error: err.message })
      throw err
    }
  })

  // POST /events/:eventId/vouchers/:code/expire — expire a voucher
  server.post('/events/:eventId/vouchers/:code/expire', async (request, reply) => {
    const { eventId, code } = request.params as { eventId: string; code: string }
    try {
      return await expireVoucher(eventId, code)
    } catch (err) {
      if (err instanceof VoucherError) return reply.status(err.statusCode).send({ error: err.message })
      throw err
    }
  })
}
