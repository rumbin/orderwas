import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { io as ioClient, type Socket } from 'socket.io-client'
import { attachWebSocket, closeIO } from '@/websocket'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'
import { createTestData, cleanupTestData, type TestData } from '../helpers/setup'

describe('WebSocket order events', () => {
  let server: AppServer
  let baseUrl: string
  let client: Socket
  let data: TestData

  beforeAll(async () => {
    server = buildServer()
    await server.listen({ port: 0, host: '127.0.0.1' })
    // Attach WebSocket to the underlying HTTP server (normally done in main())
    attachWebSocket(server.server)
    const address = server.server.address()
    const port = typeof address === 'object' && address ? address.port : 3000
    baseUrl = `http://127.0.0.1:${port}`

    // Create test data
    data = await createTestData(server)

    // Connect Socket.io client
    client = ioClient(baseUrl, { path: '/socket.io/', transports: ['websocket'] })
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve())
      client.on('connect_error', (err) => reject(err))
      setTimeout(() => reject(new Error('Socket.io connection timeout')), 5000)
    })
  }, 20000)

  afterAll(async () => {
    if (client) client.disconnect()
    await closeIO()
    if (data) await cleanupTestData(data)
    await server.close()
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })

  it('client receives order:created after POST /api/orders', async () => {
    // Join the event room
    client.emit('join:event', data.event.id)

    // Wait for join to be processed
    await new Promise((r) => setTimeout(r, 100))

    // Set up listener before creating the order
    const eventPromise = new Promise<Record<string, unknown>>((resolve) => {
      client.on('order:created', (payload: Record<string, unknown>) => resolve(payload))
    })

    // Create an order via API
    const res = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '99',
        waiterId: data.waiter.id,
        eventId: data.event.id,
        items: [{ productId: data.products.beer.id, quantity: 2 }],
      },
    })
    expect(res.statusCode).toBe(201)

    // Wait for the WebSocket event
    const payload = await eventPromise
    const order = payload.order as Record<string, unknown>
    expect(order.eventId).toBe(data.event.id)
    expect(order.tableNumber).toBe('99')
    expect(order.items).toBeDefined()
  }, 15000)

  it('client receives order:updated after PATCH /api/orders/:id', async () => {
    // Create an order first
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '88',
        waiterId: data.waiter.id,
        eventId: data.event.id,
        items: [{ productId: data.products.beer.id, quantity: 1 }],
      },
    })
    const orderId = (createRes.json() as Record<string, unknown>).id as string

    // Set up listener
    const eventPromise = new Promise<Record<string, unknown>>((resolve) => {
      client.on('order:updated', (payload: Record<string, unknown>) => resolve(payload))
    })

    // Update order status
    await server.inject({
      method: 'PATCH',
      url: `/api/orders/${orderId}`,
      payload: { status: 'paid' },
    })

    const payload = await eventPromise
    const order = payload.order as Record<string, unknown>
    expect(order.id).toBe(orderId)
    expect(order.status).toBe('paid')
  }, 15000)

  it('station room receives orders containing its station items only', async () => {
    // Create a second station with a product
    const station2 = await prisma.station.create({
      data: { name: 'Kitchen', eventId: data.event.id },
    })
    const foodProduct = await prisma.product.create({
      data: { name: 'Schnitzel', priceCents: 800, stationId: station2.id },
    })

    // Connect a client that joins only the kitchen station room
    const kitchenClient = ioClient(baseUrl, { path: '/socket.io/', transports: ['websocket'] })
    await new Promise<void>((resolve) => {
      kitchenClient.on('connect', () => resolve())
    })
    kitchenClient.emit('join:station', station2.id)
    await new Promise((r) => setTimeout(r, 100))

    // Listen for orders
    const kitchenPromise = new Promise<Record<string, unknown>>((resolve) => {
      kitchenClient.on('order:created', (payload: Record<string, unknown>) => resolve(payload))
    })

    // Create an order with a bar item (should NOT reach kitchen)
    await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '77',
        waiterId: data.waiter.id,
        eventId: data.event.id,
        items: [{ productId: data.products.beer.id, quantity: 1 }],
      },
    })

    // Create an order with a kitchen item (SHOULD reach kitchen)
    await server.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        tableNumber: '66',
        waiterId: data.waiter.id,
        eventId: data.event.id,
        items: [{ productId: foodProduct.id, quantity: 1 }],
      },
    })

    const payload = await kitchenPromise
    const order = payload.order as Record<string, unknown>
    expect(order.tableNumber).toBe('66') // the kitchen order, not the bar order

    kitchenClient.disconnect()

    // Cleanup — FK-safe order
    await prisma.orderItem.deleteMany({ where: { productId: foodProduct.id } }).catch(() => {})
    await prisma.orderItem.deleteMany({ where: { productId: data.products.beer.id } }).catch(() => {})
    await prisma.order.deleteMany({ where: { eventId: data.event.id } }).catch(() => {})
    await prisma.product.delete({ where: { id: foodProduct.id } })
    await prisma.station.delete({ where: { id: station2.id } })
  }, 15000)
})