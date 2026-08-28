import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  reorderStations,
  createStation,
  listStationsByEvent,
  getStation,
  updateStation,
  deleteStation,
} from '@/services/stationService'

const createStationSchema = z.object({
  name: z.string().min(1),
  printerId: z.string().optional(),
  kitchenMonitor: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  copyPrint: z.boolean().optional(),
})

const updateStationSchema = z.object({
  name: z.string().min(1).optional(),
  printerId: z.string().nullable().optional(),
  kitchenMonitor: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  copyPrint: z.boolean().optional(),
})

const reorderSchema = z.array(z.object({
  id: z.string(),
  sortOrder: z.number().int(),
})).min(1)

export default async function stationRoutes(server: FastifyInstance): Promise<void> {
  // POST /stations/reorder — bulk update sortOrder for stations
  server.post('/stations/reorder', { preHandler: server.requireAdmin }, async (request, reply) => {
    const parsed = reorderSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() })
    }
    await reorderStations(parsed.data)
    return { ok: true }
  })

  // Create station under an event
  server.post('/events/:eventId/stations', { preHandler: server.requireAdmin }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const parsed = createStationSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() })
    }
    const station = await createStation(eventId, parsed.data)
    if (!station) {
      return reply.code(404).send({ error: 'Event not found' })
    }
    return reply.code(201).send(station)
  })

  // List stations for an event
  server.get('/events/:eventId/stations', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const stations = await listStationsByEvent(eventId)
    if (!stations) {
      return reply.code(404).send({ error: 'Event not found' })
    }
    return stations
  })

  // Get single station
  server.get('/stations/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const station = await getStation(id)
    if (!station) {
      return reply.code(404).send({ error: 'Station not found' })
    }
    return station
  })

  // Update station
  server.put('/stations/:id', { preHandler: server.requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updateStationSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() })
    }
    const updated = await updateStation(id, parsed.data)
    if (!updated) {
      return reply.code(404).send({ error: 'Station not found' })
    }
    return updated
  })

  // Delete station
  server.delete('/stations/:id', { preHandler: server.requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const deleted = await deleteStation(id)
    if (!deleted) {
      return reply.code(404).send({ error: 'Station not found' })
    }
    return reply.code(204).send()
  })
}