import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

/**
 * Global auth guard (ARCHITECTURE.md §8):
 * when AUTH_ENFORCED, all /api/* require a valid JWT except public allowlisted
 * paths. Runs in a dedicated server instance so it never affects the
 * default (unprotected) instance used by the rest of the suite.
 */
describe('Global auth guard', () => {
  let server: AppServer
  let eventId: string
  let waiterId: string
  let waiterToken: string
  let adminToken: string

  beforeAll(async () => {
    process.env.AUTH_ENFORCED = 'true'
    server = buildServer()
    await server.listen({ port: 0, host: '127.0.0.1' })
  })

  afterAll(async () => {
    delete process.env.AUTH_ENFORCED
    await server.close()
    await prisma.waiter.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    await prisma.waiter.deleteMany({})
    await prisma.event.deleteMany({})
    const ev = await prisma.event.create({ data: { name: 'Auth Guard Event' } })
    eventId = ev.id
    const waiter = await prisma.waiter.create({
      data: { name: 'Alice', pin: '1234', eventId, canCancel: true, canCashOut: true },
    })
    waiterId = waiter.id

    const login = await server.inject({ method: 'POST', url: '/api/auth/login', payload: { waiterId, pin: '1234' } })
    waiterToken = login.json().token
    const admin = await server.inject({ method: 'POST', url: '/api/auth/admin/login', payload: { pin: 'admin' } })
    adminToken = admin.json().token
  })

  it('health endpoint is public', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
  })

  it('login endpoints are public', async () => {
    const login = await server.inject({ method: 'POST', url: '/api/auth/login', payload: { waiterId, pin: '1234' } })
    expect(login.statusCode).toBe(200)
    const admin = await server.inject({ method: 'POST', url: '/api/auth/admin/login', payload: { pin: 'admin' } })
    expect(admin.statusCode).toBe(200)
  })

  it('gated route without token → 401', async () => {
    const res = await server.inject({ method: 'GET', url: `/api/events/${eventId}/orders` })
    expect(res.statusCode).toBe(401)
  })

  it('gated route with waiter token → 200', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/events/${eventId}/orders`,
      headers: { authorization: `Bearer ${waiterToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('admin route with waiter token → 403, with admin token → allowed', async () => {
    const withWaiter = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/waiters`,
      headers: { authorization: `Bearer ${waiterToken}` },
      payload: { name: 'Bob', pin: '9999' },
    })
    // waiter token passes the global hook (auth ok) but fails the admin permission gate
    expect(withWaiter.statusCode).toBe(403)

    const withAdmin = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/waiters`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Bob', pin: '9999' },
    })
    expect(withAdmin.statusCode).toBe(201)
  })

  it('invalid token → 401', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/events/${eventId}/orders`,
      headers: { authorization: 'Bearer not-a-real-token' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('refuses to boot in production without JWT_SECRET', async () => {
    const prev = process.env.NODE_ENV
    const prevSecret = process.env.JWT_SECRET
    process.env.NODE_ENV = 'production'
    delete process.env.JWT_SECRET
    try {
      const prod = buildServer()
      await expect(prod.ready()).rejects.toThrow(/JWT_SECRET must be set in production/)
      await prod.close().catch(() => {})
    } finally {
      process.env.NODE_ENV = prev
      if (prevSecret) process.env.JWT_SECRET = prevSecret
      else delete process.env.JWT_SECRET
      delete process.env.AUTH_ENFORCED
    }
  })
})