import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  getAdminPin,
  setAdminPin,
  findWaiterForLogin,
  getMeWaiter,
} from '@/services/authService'

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
    const validPin = await getAdminPin()
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
    await setAdminPin(newPin)
    return reply.status(200).send({ ok: true })
  })

  // POST /api/auth/login — verify waiter PIN, return JWT
  server.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const { waiterId, pin } = parsed.data

    const waiter = await findWaiterForLogin(waiterId)

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
      const waiter = await getMeWaiter(payload.waiterId)
      if (!waiter) return reply.status(404).send({ error: 'Waiter not found' })
      return reply.status(200).send(waiter)
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  })
}