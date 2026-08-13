import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/db/client'

const createEventSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['test', 'live']).optional(),
})

const updateEventSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['test', 'live']).optional(),
  hidePrices: z.boolean().optional(),
  tseEnabled: z.boolean().optional(),
})

export default async function eventRoutes(server: FastifyInstance): Promise<void> {
  // Create event
  server.post('/events', async (request, reply) => {
    const parsed = createEventSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() })
    }
    const event = await prisma.event.create({
      data: {
        name: parsed.data.name,
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      },
    })
    return reply.code(201).send(event)
  })

  // List events
  server.get('/events', async () => {
    const events = await prisma.event.findMany({ orderBy: { createdAt: 'asc' } })
    return events
  })

  // Get single event
  server.get('/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const event = await prisma.event.findUnique({ where: { id } })
    if (!event) {
      return reply.code(404).send({ error: 'Event not found' })
    }
    return event
  })

  // Update event
  server.put('/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updateEventSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() })
    }
    const event = await prisma.event.findUnique({ where: { id } })
    if (!event) {
      return reply.code(404).send({ error: 'Event not found' })
    }
    const updated = await prisma.event.update({
      where: { id },
      data: parsed.data,
    })
    return updated
  })

  // Delete event
  server.delete('/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const event = await prisma.event.findUnique({ where: { id } })
    if (!event) {
      return reply.code(404).send({ error: 'Event not found' })
    }
    await prisma.event.delete({ where: { id } })
    return reply.code(204).send()
  })
}