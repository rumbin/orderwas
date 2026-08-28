import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  listLayoutsByEvent,
  createLayout,
  updateLayout,
  deleteLayout,
  getWaiterLayout,
} from '@/services/layoutService'

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
    const layouts = await listLayoutsByEvent(eventId)
    if (!layouts) return reply.status(404).send({ error: 'Event not found' })
    return reply.status(200).send(layouts)
  })

  // POST /events/:eventId/layouts — create a layout
  server.post('/events/:eventId/layouts', { preHandler: server.authenticate }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const parsed = createLayoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const layout = await createLayout(eventId, parsed.data)
    if (!layout) return reply.status(404).send({ error: 'Event not found' })
    return reply.status(201).send(layout)
  })

  // PUT /layouts/:id — update a layout
  server.put('/layouts/:id', { preHandler: server.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updateLayoutSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    try {
      const layout = await updateLayout(id, parsed.data)
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
      await deleteLayout(id)
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
    const result = await getWaiterLayout(waiterId)
    if (!result.found) return reply.status(404).send({ error: 'Waiter not found' })
    return reply.status(200).send(result.layout)
  })
}