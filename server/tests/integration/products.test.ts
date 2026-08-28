import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

describe('Product CRUD routes', () => {
  let server: AppServer
  let eventId: string
  let stationId: string
  let adminHeaders: { authorization: string }

  beforeAll(async () => {
    server = buildServer()
    await server.listen({ port: 0, host: '127.0.0.1' })
    adminHeaders = { authorization: `Bearer ${server.jwt.sign({ admin: true }, { expiresIn: '8h' })}` }
  })

  afterAll(async () => {
    await server.close()
    // Delete in FK-safe order: orderItems → orders → products → waiters → stations → events
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
    const ev = await prisma.event.create({ data: { name: 'Product Test Event' } })
    eventId = ev.id
    const station = await prisma.station.create({ data: { name: 'Bar', eventId } })
    stationId = station.id
  })

  // POST /api/stations/:stationId/products
  it('POST creates a product under a station', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/stations/${stationId}/products`,
      payload: { name: 'Bier', priceCents: 300, taxRateBps: 2000 },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeDefined()
    expect(body.name).toBe('Bier')
    expect(body.priceCents).toBe(300)
    expect(body.taxRateBps).toBe(2000)
    expect(body.stationId).toBe(stationId)
    expect(body.available).toBe(true)
    expect(body.isVoucher).toBe(false)
    expect(body.addable).toBe(true)
    expect(body.stockMode).toBe('none')
  })

  it('POST accepts optional fields', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/stations/${stationId}/products`,
      payload: {
        name: 'Schnitzel',
        priceCents: 850,
        shortName: 'Schni',
        taxRateBps: 1000,
        isVoucher: false,
        addable: true,
        stockMode: 'tracked',
        stockCount: 50,
        sortOrder: 5,
      },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.shortName).toBe('Schni')
    expect(body.stockMode).toBe('tracked')
    expect(body.stockCount).toBe(50)
    expect(body.sortOrder).toBe(5)
  })

  it('POST returns 400 for missing name', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/stations/${stationId}/products`,
      payload: { priceCents: 300 },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST returns 400 for missing priceCents', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/stations/${stationId}/products`,
      payload: { name: 'Bier' },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST returns 404 for non-existent station', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/stations/nonexistent/products',
      payload: { name: 'Bier', priceCents: 300 },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(404)
  })

  // GET /api/stations/:stationId/products
  it('GET lists products for a station sorted by sortOrder', async () => {
    await prisma.product.create({ data: { name: 'B', priceCents: 200, stationId, sortOrder: 2 } })
    await prisma.product.create({ data: { name: 'A', priceCents: 100, stationId, sortOrder: 1 } })
    await prisma.product.create({ data: { name: 'C', priceCents: 300, stationId, sortOrder: 3 } })

    const res = await server.inject({
      method: 'GET',
      url: `/api/stations/${stationId}/products`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(3)
    expect(body.map((p: { name: string }) => p.name)).toEqual(['A', 'B', 'C'])
  })

  it('GET returns 404 for non-existent station', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/stations/nonexistent/products',
    })
    expect(res.statusCode).toBe(404)
  })

  // GET /api/products/:id
  it('GET /api/products/:id returns a single product', async () => {
    const created = await prisma.product.create({ data: { name: 'Cola', priceCents: 250, stationId } })

    const res = await server.inject({
      method: 'GET',
      url: `/api/products/${created.id}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(created.id)
    expect(body.name).toBe('Cola')
    expect(body.priceCents).toBe(250)
  })

  it('GET /api/products/:id returns 404 for missing product', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/products/nonexistent',
    })
    expect(res.statusCode).toBe(404)
  })

  // PUT /api/products/:id
  it('PUT updates a product', async () => {
    const created = await prisma.product.create({ data: { name: 'Bier', priceCents: 300, stationId } })

    const res = await server.inject({
      method: 'PUT',
      url: `/api/products/${created.id}`,
      payload: { name: 'Helles Bier', priceCents: 350, available: false, sortOrder: 10 },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.name).toBe('Helles Bier')
    expect(body.priceCents).toBe(350)
    expect(body.available).toBe(false)
    expect(body.sortOrder).toBe(10)
  })

  it('PUT returns 404 for missing product', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/products/nonexistent',
      payload: { name: 'Nope' },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(404)
  })

  // DELETE /api/products/:id
  it('DELETE removes a product', async () => {
    const created = await prisma.product.create({ data: { name: 'Water', priceCents: 100, stationId } })

    const res = await server.inject({
      method: 'DELETE',
      url: `/api/products/${created.id}`,
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(204)

    const exists = await prisma.product.findUnique({ where: { id: created.id } })
    expect(exists).toBeNull()
  })

  it('DELETE returns 404 for missing product', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: '/api/products/nonexistent',
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(404)
  })

  it('DELETE returns 409 when product is referenced by an OrderItem', async () => {
    const product = await prisma.product.create({ data: { name: 'Bier', priceCents: 300, stationId } })
    // Create a waiter and an order that references this product
    const waiter = await prisma.waiter.create({ data: { name: 'Alice', pin: '1234', eventId } })
    await prisma.order.create({
      data: {
        tableNumber: '1',
        waiterId: waiter.id,
        eventId,
        items: { create: [{ productId: product.id, quantity: 2 }] },
      },
    })

    const res = await server.inject({
      method: 'DELETE',
      url: `/api/products/${product.id}`,
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(409)
  })

  it('PATCH /api/products/reorder updates sortOrder for products in a station', async () => {
    const p1 = await prisma.product.create({ data: { name: 'P1', priceCents: 100, stationId, sortOrder: 0 } })
    const p2 = await prisma.product.create({ data: { name: 'P2', priceCents: 200, stationId, sortOrder: 1 } })

    const res = await server.inject({
      method: 'PATCH',
      url: '/api/products/reorder',
      headers: adminHeaders,
      payload: { stationId, productIds: [p2.id, p1.id] },
    })
    expect(res.statusCode).toBe(200)

    const list = await (await server.inject({ method: 'GET', url: `/api/stations/${stationId}/products` })).json()
    expect(list.map((p: { name: string }) => p.name)).toEqual(['P2', 'P1'])
  })

  it('PATCH /api/products/reorder rejects empty product list (400)', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/products/reorder',
      headers: adminHeaders,
      payload: { stationId, productIds: [] },
    })
    expect(res.statusCode).toBe(400)
  })
})
