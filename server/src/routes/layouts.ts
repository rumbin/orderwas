import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/db/client'

const layoutSelect = {
  id: true,
  eventId: true,
  waiterId: true,
  columns: true,
  rows: true,
  buttons: true,
  createdAt: true,
  updatedAt: true,
} as const

const createLayoutSchema = z.object({
  waiterId: z.string().optional(),
  columns: z.number().int().min(1).max(20).optional(),
  rows: z.number().int().min(1).max(50).optional(),
  buttons: z.string().optional(), // JSON string
})

const updateLayoutSchema = z.object({
  columns: z.number().int().min(1).max(20).optional(),
  rows: z.number().int().min(1).max(50).optional(),
  buttons: z.string().optional(),
})

export const layoutsRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // GET /events/:eventId/layouts — list layouts for an event
  server.get('/events/:eventId/layouts', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
    if (!event) return reply.status(404).send({ error: 'Event not found' })

    const layouts = await prisma.appLayout.findMany({
      where: { eventId },
      select: layoutSelect,
    })
    return reply.status(200).send(layouts)
  })

  // POST /events/:eventId/layouts — create a layout
  server.post('/events/:eventId/layouts', { preHandler: server.authenticate }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const parsed = createLayoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
    if (!event) return reply.status(404).send({ error: 'Event not found' })

    const { waiterId, columns, rows, buttons } = parsed.data
    const layout = await prisma.appLayout.create({
      data: {
        eventId,
        waiterId: waiterId ?? null,
        columns: columns ?? 3,
        rows: rows ?? 5,
        buttons: buttons ?? '[]',
      },
      select: layoutSelect,
    })
    return reply.status(201).send(layout)
  })

  // PUT /layouts/:id — update a layout
  server.put('/layouts/:id', { preHandler: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updateLayoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    try {
      const layout = await prisma.appLayout.update({
        where: { id },
        data: parsed.data,
        select: layoutSelect,
      })
      return reply.status(200).send(layout)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2025') return reply.status(404).send({ error: 'Layout not found' })
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // DELETE /layouts/:id — delete a layout
  server.delete('/layouts/:id', { preHandler: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.appLayout.delete({ where: { id } })
      return reply.status(204).send()
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2025') return reply.status(404).send({ error: 'Layout not found' })
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // GET /waiters/:waiterId/layout — get waiter's layout (fallback to event default)
  server.get('/waiters/:waiterId/layout', async (request, reply) => {
    const { waiterId } = request.params as { waiterId: string }
    const waiter = await prisma.waiter.findUnique({ where: { id: waiterId }, select: { id: true, eventId: true } })
    if (!waiter) return reply.status(404).send({ error: 'Waiter not found' })

    // Try waiter-specific layout first
    const waiterLayout = await prisma.appLayout.findFirst({
      where: { waiterId, eventId: waiter.eventId },
      select: layoutSelect,
    })
    if (waiterLayout) return reply.status(200).send(waiterLayout)

    // Fallback to event default (null waiterId)
    const defaultLayout = await prisma.appLayout.findFirst({
      where: { eventId: waiter.eventId, waiterId: null },
      select: layoutSelect,
    })
    if (defaultLayout) return reply.status(200).send(defaultLayout)

    // Fallback to any layout for the event (first one)
    const anyLayout = await prisma.appLayout.findFirst({
      where: { eventId: waiter.eventId },
      select: layoutSelect,
    })
    return reply.status(200).send(anyLayout ?? null)
  })
}
