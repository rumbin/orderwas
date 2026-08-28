import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/db/client'

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

export default async function stationRoutes(server: FastifyInstance): Promise<void> {
  // POST /stations/reorder — bulk update sortOrder for stations
  const reorderSchema = z.array(z.object({
    id: z.string(),
    sortOrder: z.number().int(),
  })).min(1)

  server.post('/stations/reorder', { preHandler: server.requireAdmin }, async (request, reply) => {
    const parsed = reorderSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() })
    }
    await prisma.$transaction(
      parsed.data.map(({ id, sortOrder }) =>
        prisma.station.update({ where: { id }, data: { sortOrder } })
      )
    )
    return { ok: true }
  })

  // Create station under an event
  server.post('/events/:eventId/stations', { preHandler: server.requireAdmin }, async (request, reply) => {
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
        ...('printerId' in parsed.data ? { printerId: parsed.data.printerId } : {}),
        ...('kitchenMonitor' in parsed.data ? { kitchenMonitor: parsed.data.kitchenMonitor } : {}),
        ...('sortOrder' in parsed.data ? { sortOrder: parsed.data.sortOrder } : {}),
        ...('copyPrint' in parsed.data ? { copyPrint: parsed.data.copyPrint } : {}),
      },
      include: { printer: true },
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
      orderBy: { sortOrder: 'asc' },
      include: { printer: true },
    })
    return stations
  })

  // Get single station
  server.get('/stations/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const station = await prisma.station.findUnique({
      where: { id },
      include: { printer: true },
    })
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
    const station = await prisma.station.findUnique({ where: { id } })
    if (!station) {
      return reply.code(404).send({ error: 'Station not found' })
    }
    const updated = await prisma.station.update({
      where: { id },
      data: parsed.data,
      include: { printer: true },
    })
    return updated
  })

  // Delete station
  server.delete('/stations/:id', { preHandler: server.requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const station = await prisma.station.findUnique({ where: { id } })
    if (!station) {
      return reply.code(404).send({ error: 'Station not found' })
    }
    await prisma.station.delete({ where: { id } })
    return reply.code(204).send()
  })
}