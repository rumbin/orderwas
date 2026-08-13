import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/db/client'

const createWaiterBody = z.object({
  name: z.string().min(1),
  pin: z.string().min(1),
  printerIp: z.string().optional(),
  canCancel: z.boolean().optional(),
  canCashOut: z.boolean().optional(),
  canStatistics: z.boolean().optional(),
})

const updateWaiterBody = z.object({
  name: z.string().min(1).optional(),
  pin: z.string().min(1).optional(),
  printerIp: z.string().nullable().optional(),
  canCancel: z.boolean().optional(),
  canCashOut: z.boolean().optional(),
  canStatistics: z.boolean().optional(),
  active: z.boolean().optional(),
})

const toggleActiveBody = z.object({
  active: z.boolean(),
})

export const waitersRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // POST /api/events/:eventId/waiters — create waiter
  server.post('/api/events/:eventId/waiters', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const parsed = createWaiterBody.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    const { name, pin, printerIp, canCancel, canCashOut, canStatistics } = parsed.data

    try {
      const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
      if (!event) return reply.status(404).send({ error: 'Event not found' })
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message })
    }

    const waiter = await prisma.waiter.create({
      data: { name, pin, printerIp, canCancel, canCashOut, canStatistics, eventId },
    })
    return reply.status(201).send(waiter)
  })

  // GET /api/events/:eventId/waiters — list waiters for event
  server.get('/api/events/:eventId/waiters', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    try {
      const waiters = await prisma.waiter.findMany({ where: { eventId } })
      return reply.status(200).send(waiters)
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message })
    }
  })

  // GET /api/waiters/:id — single waiter
  server.get('/api/waiters/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const waiter = await prisma.waiter.findUnique({ where: { id } })
    if (!waiter) return reply.status(404).send({ error: 'Waiter not found' })
    return reply.status(200).send(waiter)
  })

  // PUT /api/waiters/:id — update waiter
  server.put('/api/waiters/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updateWaiterBody.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const waiter = await prisma.waiter.update({ where: { id }, data: parsed.data })
      return reply.status(200).send(waiter)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2025') return reply.status(404).send({ error: 'Waiter not found' })
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // DELETE /api/waiters/:id
  server.delete('/api/waiters/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.waiter.delete({ where: { id } })
      return reply.status(204).send()
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2025') return reply.status(404).send({ error: 'Waiter not found' })
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // PATCH /api/waiters/:id/active — toggle active flag
  server.patch('/api/waiters/:id/active', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = toggleActiveBody.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    try {
      const waiter = await prisma.waiter.update({ where: { id }, data: { active: parsed.data.active } })
      return reply.status(200).send(waiter)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2025') return reply.status(404).send({ error: 'Waiter not found' })
      return reply.status(400).send({ error: (err as Error).message })
    }
  })
}