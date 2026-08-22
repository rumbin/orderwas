import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@/db/client'

const loginSchema = z.object({
  waiterId: z.string().min(1),
  pin: z.string().min(1),
})

const adminLoginSchema = z.object({
  pin: z.string().min(1),
})

export const authRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // POST /api/auth/admin/login — verify admin PIN, return admin JWT
  server.post('/auth/admin/login', async (request, reply) => {
    const parsed = adminLoginSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { pin } = parsed.data
    // Check DB setting first, fallback to env, fallback to 'admin'
    const dbSetting = await prisma.systemSetting.findUnique({ where: { key: 'admin_pin' } })
    const validPin = dbSetting?.value ?? process.env.ADMIN_PIN ?? 'admin'
    if (pin !== validPin) {
      return reply.status(401).send({ error: 'Wrong PIN' })
    }

    const token = server.jwt.sign({ admin: true }, { expiresIn: '8h' })
    return reply.status(200).send({ token })
  })

  // PUT /api/auth/admin/pin — change admin PIN (requires admin auth)
  server.put('/auth/admin/pin', { preHandler: server.requireAdmin }, async (request, reply) => {
    const { newPin } = request.body as { newPin: string }
    if (!newPin || newPin.length < 3) {
      return reply.status(400).send({ error: 'PIN must be at least 3 characters' })
    }
    await prisma.systemSetting.upsert({
      where: { key: 'admin_pin' },
      update: { value: newPin },
      create: { key: 'admin_pin', value: newPin },
    })
    return reply.status(200).send({ ok: true })
  })

  // POST /api/auth/login — verify waiter PIN, return JWT
  server.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { waiterId, pin } = parsed.data

    const waiter = await prisma.waiter.findUnique({
      where: { id: waiterId },
      select: {
        id: true,
        name: true,
        pin: true,
        eventId: true,
        canCancel: true,
        canCashOut: true,
        canStatistics: true,
        canCreateWaiters: true,
        canTransfer: true,
        isStationWaiter: true,
        active: true,
      },
    })

    if (!waiter || !waiter.active) return reply.status(401).send({ error: 'Invalid credentials' })
    if (waiter.pin !== pin) return reply.status(401).send({ error: 'Invalid credentials' })

    const token = server.jwt.sign({
      waiterId: waiter.id,
      eventId: waiter.eventId,
      permissions: {
        canCancel: waiter.canCancel,
        canCashOut: waiter.canCashOut,
        canStatistics: waiter.canStatistics,
        canCreateWaiters: waiter.canCreateWaiters,
        canTransfer: waiter.canTransfer,
        isStationWaiter: waiter.isStationWaiter,
      },
    })

    // Return token + waiter info WITHOUT pin
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pin: _, ...waiterWithoutPin } = waiter
    return reply.status(200).send({ token, waiter: waiterWithoutPin })
  })

  // GET /api/auth/me — return current waiter from JWT
  server.get('/auth/me', async (request, reply) => {
    try {
      const payload = await request.jwtVerify() as { waiterId: string }
      const waiter = await prisma.waiter.findUnique({
        where: { id: payload.waiterId },
        select: {
          id: true,
          name: true,
          eventId: true,
          printerId: true,
          pickupCode: true,
          printsImmediately: true,
          canCancel: true,
          canCashOut: true,
          canStatistics: true,
          canCreateWaiters: true,
          canTransfer: true,
          isStationWaiter: true,
          hidden: true,
          autoSammelbon: true,
          active: true,
        },
      })
      if (!waiter) return reply.status(404).send({ error: 'Waiter not found' })
      return reply.status(200).send(waiter)
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  })
}
