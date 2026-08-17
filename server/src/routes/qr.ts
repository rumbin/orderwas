import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import QRCode from 'qrcode'
import { prisma } from '@/db/client'

/**
 * QR code routes for table ordering.
 * Guests scan a QR code that encodes a URL like #/guest/:eventId/:tableToken
 * The token is a simple hash of event+table for identification.
 */
export const qrRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // GET /api/events/:eventId/qr/:tableNumber — generate QR code PNG for a table
  server.get('/events/:eventId/qr/:tableNumber', async (request, reply) => {
    const { eventId, tableNumber } = request.params as { eventId: string; tableNumber: string }

    // Verify event exists
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true } })
    if (!event) return reply.status(404).send({ error: 'Event not found' })

    // Generate a deterministic token from event+table
    const token = Buffer.from(`${eventId}:${tableNumber}`).toString('base64url')

    // The URL the QR code points to — use the current host
    const host = request.headers.host ?? 'localhost:3000'
    const protocol = request.headers['x-forwarded-proto'] ?? 'http'
    const url = `${protocol}://${host}/#/guest/${eventId}/${token}`

    const png = await QRCode.toBuffer(url, { type: 'png', width: 300, margin: 2 })

    reply.header('Content-Type', 'image/png')
    reply.header('Cache-Control', 'public, max-age=86400')
    return reply.send(png)
  })

  // GET /api/events/:eventId/qr-all — generate a page with all table QR codes
  server.get('/events/:eventId/qr-all', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true } })
    if (!event) return reply.status(404).send({ error: 'Event not found' })

    // Get all unique table numbers from orders
    const orders = await prisma.order.findMany({
      where: { eventId, tableNumber: { not: null } },
      select: { tableNumber: true },
      distinct: ['tableNumber'],
    })

    const tables = orders.map((o) => o.tableNumber!).filter(Boolean).sort()
    if (tables.length === 0) {
      // Provide some default tables if none exist yet
      for (let i = 1; i <= 20; i++) tables.push(String(i))
    }

    const host = request.headers.host ?? 'localhost:3000'
    const protocol = request.headers['x-forwarded-proto'] ?? 'http'

    // Generate QR codes as data URLs
    const qrCodes = await Promise.all(
      tables.map(async (table) => {
        const token = Buffer.from(`${eventId}:${table}`).toString('base64url')
        const url = `${protocol}://${host}/#/guest/${eventId}/${token}`
        const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1 })
        return { table, url, dataUrl }
      }),
    )

    return { event: event.name, tables: qrCodes }
  })

  // POST /api/guest/orders — public order endpoint (no auth, table from token)
  const guestOrderSchema = z.object({
    token: z.string().min(1),
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number().int().min(1).default(1),
      comment: z.string().optional(),
    })).min(1),
  })

  server.post('/guest/orders', async (request, reply) => {
    const parsed = guestOrderSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    // Decode token to get eventId + tableNumber
    let eventId: string
    let tableNumber: string
    try {
      const decoded = Buffer.from(parsed.data.token, 'base64url').toString()
      const [eid, table] = decoded.split(':')
      if (!eid || !table) throw new Error()
      eventId = eid
      tableNumber = table
    } catch {
      return reply.status(400).send({ error: 'Invalid token' })
    }

    // Verify event exists and is live
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, status: true } })
    if (!event) return reply.status(404).send({ error: 'Event not found' })

    // Find a system waiter for guest orders (or use first available)
    const waiter = await prisma.waiter.findFirst({
      where: { eventId, active: true },
      select: { id: true },
    })
    if (!waiter) return reply.status(400).send({ error: 'No active waiter found for this event' })

    // Validate products and calculate total
    const productIds = parsed.data.items.map((i) => i.productId)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, available: true },
      select: { id: true, priceCents: true },
    })
    if (products.length !== productIds.length) {
      return reply.status(400).send({ error: 'One or more products not found or unavailable' })
    }

    const productMap = new Map(products.map((p) => [p.id, p]))
    const totalCents = parsed.data.items.reduce(
      (sum, item) => sum + (productMap.get(item.productId)?.priceCents ?? 0) * item.quantity,
      0,
    )

    // Create order (using the existing createOrder logic)
    const { createOrder } = await import('@/services/orderService')
    try {
      const order = await createOrder({
        tableNumber,
        waiterId: waiter.id,
        eventId,
        items: parsed.data.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          comment: i.comment,
        })),
      })
      return reply.status(201).send({
        orderId: order.id,
        tearOffNumber: order.tearOffNumber,
        totalCents: order.totalCents,
      })
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message })
    }
  })
}
