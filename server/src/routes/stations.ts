import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/db/client'

const createStationSchema = z.object({
  name: z.string().min(1),
  printerIp: z.string().optional(),
  printerType: z.string().optional(),
  kitchenMonitor: z.boolean().optional(),
})

const updateStationSchema = z.object({
  name: z.string().min(1).optional(),
  printerIp: z.string().nullable().optional(),
  printerType: z.string().optional(),
  kitchenMonitor: z.boolean().optional(),
})

export default async function stationRoutes(server: FastifyInstance): Promise<void> {
  // Create station under an event
  server.post('/events/:eventId/stations', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const parsed = createStationSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() })
    }
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
    if (!event) {
      return reply.code(404).send({ error: 'Event not found' })
    }
    const station = await prisma.station.create({
      data: {
        name: parsed.data.name,
        eventId,
        ...(parsed.data.printerIp !== undefined ? { printerIp: parsed.data.printerIp } : {}),
        ...(parsed.data.printerType !== undefined ? { printerType: parsed.data.printerType } : {}),
        ...(parsed.data.kitchenMonitor !== undefined ? { kitchenMonitor: parsed.data.kitchenMonitor } : {}),
      },
    })
    return reply.code(201).send(station)
  })

  // List stations for an event
  server.get('/events/:eventId/stations', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
    if (!event) {
      return reply.code(404).send({ error: 'Event not found' })
    }
    const stations = await prisma.station.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    })
    return stations
  })

  // Get single station
  server.get('/stations/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const station = await prisma.station.findUnique({ where: { id } })
    if (!station) {
      return reply.code(404).send({ error: 'Station not found' })
    }
    return station
  })

  // Update station
  server.put('/stations/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updateStationSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() })
    }
    const station = await prisma.station.findUnique({ where: { id } })
    if (!station) {
      return reply.code(404).send({ error: 'Station not found' })
    }
    const updated = await prisma.station.update({
      where: { id },
      data: parsed.data,
    })
    return updated
  })

  // Delete station
  server.delete('/stations/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const station = await prisma.station.findUnique({ where: { id } })
    if (!station) {
      return reply.code(404).send({ error: 'Station not found' })
    }
    await prisma.station.delete({ where: { id } })
    return reply.code(204).send()
  })
}