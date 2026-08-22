import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

describe('Waiter login flow', () => {
  let server: AppServer

  beforeAll(async () => {
    server = buildServer()
    await server.listen({ port: 0, host: '127.0.0.1' })
  })

  afterAll(async () => {
    await server.close()
  })

  beforeEach(async () => {
    // FK-safe cleanup
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })

  // Helper to create an event + waiter
  async function createEventWithWaiter(eventName: string, waiterName: string, pin: string) {
    const event = await prisma.event.create({ data: { name: eventName } })
    const station = await prisma.station.create({ data: { name: 'Bar', eventId: event.id } })
    const product = await prisma.product.create({
      data: { name: 'Beer', priceCents: 300, stationId: station.id },
    })
    const waiter = await prisma.waiter.create({
      data: { name: waiterName, pin, eventId: event.id },
    })
    return { event, station, product, waiter }
  }

  describe('POST /api/auth/login', () => {
    it('returns token + waiter info for valid credentials', async () => {
      const { waiter } = await createEventWithWaiter('Fest A', 'Alice', '1234')

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { waiterId: waiter.id, pin: '1234' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.token).toBeDefined()
      expect(typeof body.token).toBe('string')
      expect(body.waiter.id).toBe(waiter.id)
      expect(body.waiter.name).toBe('Alice')
      expect(body.waiter.eventId).toBeDefined()
      // Pin must NOT be leaked
      expect(body.waiter.pin).toBeUndefined()
    })

    it('returns 401 for wrong PIN', async () => {
      const { waiter } = await createEventWithWaiter('Fest B', 'Bob', '5678')

      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { waiterId: waiter.id, pin: '0000' },
      })

      expect(res.statusCode).toBe(401)
      const body = res.json()
      expect(body.error).toBeDefined()
    })

    it('returns 401 for non-existent waiter', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { waiterId: 'nonexistent-id', pin: '1234' },
      })

      expect(res.statusCode).toBe(401)
    })

    it('returns 400 for missing fields', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { waiterId: 'some-id' },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns waiter info for valid token', async () => {
      const { waiter } = await createEventWithWaiter('Fest C', 'Charlie', '1111')

      // Login first to get a token
      const loginRes = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { waiterId: waiter.id, pin: '1111' },
      })
      const { token } = loginRes.json()

      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.id).toBe(waiter.id)
      expect(body.name).toBe('Charlie')
      expect(body.pin).toBeUndefined()
    })

    it('returns 401 without token', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/auth/me' })
      expect(res.statusCode).toBe(401)
    })

    it('returns 401 for invalid token', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: 'Bearer fake-token' },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('Cross-event login isolation', () => {
    it('waiter from event A cannot log in with waiter from event B', async () => {
      const { waiter: alice } = await createEventWithWaiter('Festival Nord', 'Alice', '1234')
      const { waiter: bob } = await createEventWithWaiter('Festival Süd', 'Bob', '5678')

      // Alice logs in successfully with her own waiterId
      const loginA = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { waiterId: alice.id, pin: '1234' },
      })
      expect(loginA.statusCode).toBe(200)

      // Bob logs in successfully with his own waiterId
      const loginB = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { waiterId: bob.id, pin: '5678' },
      })
      expect(loginB.statusCode).toBe(200)

      // Alice's waiterId + Bob's PIN fails
      const crossLogin1 = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { waiterId: alice.id, pin: '5678' },
      })
      expect(crossLogin1.statusCode).toBe(401)

      // Bob's waiterId + Alice's PIN fails
      const crossLogin2 = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { waiterId: bob.id, pin: '1234' },
      })
      expect(crossLogin2.statusCode).toBe(401)

      // Verify each token is scoped to the correct event
      const aliceToken = loginA.json().token
      const bobToken = loginB.json().token

      const meA = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${aliceToken}` },
      })
      expect(meA.statusCode).toBe(200)
      expect(meA.json().eventId).toBe(alice.eventId)
      expect(meA.json().name).toBe('Alice')

      const meB = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${bobToken}` },
      })
      expect(meB.statusCode).toBe(200)
      expect(meB.json().eventId).toBe(bob.eventId)
      expect(meB.json().name).toBe('Bob')
    })
  })
})
