import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as eventService from '@/services/eventService'

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
    const event = await eventService.createEvent(parsed.data)
    return reply.code(201).send(event)
  })

  // List events
  server.get('/events', async () => {
    return eventService.listEvents()
  })

  // Get single event
  server.get('/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const event = await eventService.getEvent(id)
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
    const updated = await eventService.updateEvent(id, parsed.data)
    if (!updated) {
      return reply.code(404).send({ error: 'Event not found' })
    }
    return updated
  })

  // Delete event
  server.delete('/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const deleted = await eventService.deleteEvent(id)
    if (!deleted) {
      return reply.code(404).send({ error: 'Event not found' })
    }
    return reply.code(204).send()
  })
}
