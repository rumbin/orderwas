import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

describe('Auth routes', () => {
  let server: AppServer
  let eventId: string
  let waiterId: string

  beforeAll(async () => {
    server = buildServer()
    await server.listen({ port: 0, host: '127.0.0.1' })
  })

  afterAll(async () => {
    await server.close()
    await prisma.waiter.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    await prisma.waiter.deleteMany({})
    await prisma.event.deleteMany({})
    const ev = await prisma.event.create({ data: { name: 'Auth Test Event' } })
    eventId = ev.id
    const waiter = await prisma.waiter.create({
      data: { name: 'Alice', pin: '1234', eventId },
    })
    waiterId = waiter.id
  })

  // POST /api/auth/login
  it('POST /api/auth/login with correct pin returns 200 with token', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { waiterId, pin: '1234' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.token).toBeDefined()
    expect(typeof body.token).toBe('string')
    expect(body.waiter.id).toBe(waiterId)
    expect(body.waiter.name).toBe('Alice')
    // Pin must NOT be in the response
    expect(body.waiter.pin).toBeUndefined()
  })

  it('POST /api/auth/login with wrong pin returns 401', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { waiterId, pin: '9999' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('POST /api/auth/login with non-existent waiter returns 401', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { waiterId: 'nonexistent', pin: '1234' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('POST /api/auth/login with inactive waiter returns 401', async () => {
    const inactive = await prisma.waiter.create({
      data: { name: 'Bob', pin: '5678', eventId, active: false },
    })
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { waiterId: inactive.id, pin: '5678' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('POST /api/auth/login with missing fields returns 400', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { waiterId },
    })
    expect(res.statusCode).toBe(400)
  })

  // GET /api/auth/me
  it('GET /api/auth/me with valid token returns waiter without pin', async () => {
    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { waiterId, pin: '1234' },
    })
    const token = loginRes.json().token

    const res = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(waiterId)
    expect(body.name).toBe('Alice')
    expect(body.pin).toBeUndefined()
  })

  it('GET /api/auth/me without token returns 401', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
    })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/auth/me with invalid token returns 401', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: 'Bearer invalid-token' },
    })
    expect(res.statusCode).toBe(401)
  })

  // Pin secrecy on waiter endpoints
  it('GET /api/events/:eventId/waiters does not include pin in response', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/events/${eventId}/waiters`,
    })
    expect(res.statusCode).toBe(200)
    const waiters = res.json()
    expect(waiters).toHaveLength(1)
    waiters.forEach((w: Record<string, unknown>) => {
      expect(w.pin).toBeUndefined()
    })
  })

  it('GET /api/waiters/:id does not include pin in response', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/waiters/${waiterId}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.pin).toBeUndefined()
    expect(body.name).toBe('Alice')
  })

  // --- Admin PIN tests ---
  it('POST /api/auth/admin/login with default PIN returns 200 with token', async () => {
    // Default PIN is 'admin' (no DB setting, no ADMIN_PIN env)
    await prisma.systemSetting.deleteMany({ where: { key: 'admin_pin' } })
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/admin/login',
      payload: { pin: 'admin' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.token).toBeDefined()
    expect(typeof body.token).toBe('string')
  })

  it('POST /api/auth/admin/login with wrong PIN returns 401', async () => {
    await prisma.systemSetting.deleteMany({ where: { key: 'admin_pin' } })
    const res = await server.inject({
      method: 'POST',
      url: '/api/auth/admin/login',
      payload: { pin: 'wrong' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('PUT /api/auth/admin/pin changes the admin PIN', async () => {
    await prisma.systemSetting.deleteMany({ where: { key: 'admin_pin' } })
    // Login with default PIN
    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/auth/admin/login',
      payload: { pin: 'admin' },
    })
    const adminToken = loginRes.json().token

    // Change PIN
    const changeRes = await server.inject({
      method: 'PUT',
      url: '/api/auth/admin/pin',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newPin: 'secret123' },
    })
    expect(changeRes.statusCode).toBe(200)
    expect(changeRes.json().ok).toBe(true)

    // Old PIN no longer works
    const oldRes = await server.inject({
      method: 'POST',
      url: '/api/auth/admin/login',
      payload: { pin: 'admin' },
    })
    expect(oldRes.statusCode).toBe(401)

    // New PIN works
    const newRes = await server.inject({
      method: 'POST',
      url: '/api/auth/admin/login',
      payload: { pin: 'secret123' },
    })
    expect(newRes.statusCode).toBe(200)
    expect(newRes.json().token).toBeDefined()
  })

  it('PUT /api/auth/admin/pin rejects short PIN', async () => {
    await prisma.systemSetting.deleteMany({ where: { key: 'admin_pin' } })
    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/auth/admin/login',
      payload: { pin: 'admin' },
    })
    const adminToken = loginRes.json().token

    const res = await server.inject({
      method: 'PUT',
      url: '/api/auth/admin/pin',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { newPin: 'ab' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('PUT /api/auth/admin/pin without admin token returns 401', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/auth/admin/pin',
      payload: { newPin: 'secret123' },
    })
    expect(res.statusCode).toBe(401)
  })
})
