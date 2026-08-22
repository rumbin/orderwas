import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { exportEvent, importEvent, type ImportData } from '@/services/configService'

export const configRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // GET /events/:eventId/export — export event configuration as JSON
  server.get('/events/:eventId/export', {
    preHandler: server.requireAdmin,
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const data = await exportEvent(eventId)
    if (!data) return reply.status(404).send({ error: 'Event not found' })
    return reply.status(200).send(data)
  })

  // POST /events/import — import event from JSON
  server.post('/events/import', {
    preHandler: server.requireAdmin,
  }, async (request, reply) => {
    const body = request.body as ImportData
    if (!body?.event?.name) {
      return reply.status(400).send({ error: 'Missing required field: event.name' })
    }
    if (!body?.stations || !Array.isArray(body.stations)) {
      return reply.status(400).send({ error: 'Missing required field: stations' })
    }
    try {
      const event = await importEvent(body)
      return reply.status(201).send(event)
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message })
    }
  })
}
