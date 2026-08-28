import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'

describe('Voucher routes', () => {
  let server: AppServer
  let eventId: string
  let adminHeaders: { authorization: string }
  let redeemHeaders: { authorization: string }

  beforeAll(async () => {
    server = buildServer()
    await server.listen({ port: 0, host: '127.0.0.1' })
  })

  afterAll(async () => {
    await server.close()
    await prisma.auditLog.deleteMany({})
    await prisma.voucher.deleteMany({})
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({})
    await prisma.voucher.deleteMany({})
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})

    const ev = await prisma.event.create({ data: { name: 'Voucher Test' } })
    eventId = ev.id
    // Voucher create/bulk/expire are admin-gated; redeem requires any authenticated token.
    adminHeaders = { authorization: `Bearer ${server.jwt.sign({ admin: true }, { expiresIn: '8h' })}` }
    redeemHeaders = { authorization: `Bearer ${server.jwt.sign({ waiterId: 'voucher-redeemer' })}` }
  })

  it('POST creates a voucher', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/vouchers`,
      payload: { code: 'GUT001', valueCents: 500 },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.code).toBe('GUT001')
    expect(body.valueCents).toBe(500)
    expect(body.status).toBe('active')
  })

  it('POST rejects duplicate voucher code', async () => {
    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/vouchers`,
      payload: { code: 'GUT001', valueCents: 500 },
      headers: adminHeaders,
    })
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/vouchers`,
      payload: { code: 'GUT001', valueCents: 300 },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toContain('already exists')
  })

  it('GET lists vouchers', async () => {
    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/vouchers`,
      payload: { code: 'GUT001', valueCents: 500 },
      headers: adminHeaders,
    })
    const res = await server.inject({
      method: 'GET',
      url: `/api/events/${eventId}/vouchers`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
  })

  it('POST bulk creates vouchers', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/vouchers/bulk`,
      payload: { prefix: 'BON', valueCents: 1000, count: 5, startNumber: 1 },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().count).toBe(5)

    const list = await server.inject({ method: 'GET', url: `/api/events/${eventId}/vouchers` })
    expect(list.json()).toHaveLength(5)
  })

  it('POST redeems a voucher', async () => {
    // Create waiter + order for redemption
    const station = await prisma.station.create({ data: { name: 'Bar', eventId } })
    const product = await prisma.product.create({ data: { name: 'Bier', priceCents: 300, stationId: station.id } })
    const waiter = await prisma.waiter.create({ data: { name: 'Alice', pin: '1234', eventId } })

    // Create voucher
    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/vouchers`,
      payload: { code: 'GUT001', valueCents: 500 },
      headers: adminHeaders,
    })

    // Create order
    const order = await prisma.order.create({
      data: {
        tableNumber: '1',
        waiterId: waiter.id,
        eventId,
        totalCents: 300,
        items: { create: [{ productId: product.id, quantity: 1 }] },
      },
    })

    // Redeem voucher
    const res = await server.inject({
      method: 'POST',
      url: '/api/vouchers/redeem',
      payload: { code: 'GUT001', orderId: order.id },
      headers: redeemHeaders,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('redeemed')
    expect(res.json().redeemedOrderId).toBe(order.id)
  })

  it('POST redeem rejects already-redeemed voucher', async () => {
    const station = await prisma.station.create({ data: { name: 'Bar', eventId } })
    const product = await prisma.product.create({ data: { name: 'Bier', priceCents: 300, stationId: station.id } })
    const waiter = await prisma.waiter.create({ data: { name: 'Alice', pin: '1234', eventId } })

    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/vouchers`,
      payload: { code: 'GUT001', valueCents: 500 },
      headers: adminHeaders,
    })

    const order = await prisma.order.create({
      data: {
        tableNumber: '1', waiterId: waiter.id, eventId, totalCents: 300,
        items: { create: [{ productId: product.id, quantity: 1 }] },
      },
    })

    // First redemption succeeds
    await server.inject({
      method: 'POST',
      url: '/api/vouchers/redeem',
      payload: { code: 'GUT001', orderId: order.id },
      headers: redeemHeaders,
    })

    // Second redemption fails (conflict after first redeem)
    const res = await server.inject({
      method: 'POST',
      url: '/api/vouchers/redeem',
      payload: { code: 'GUT001', orderId: order.id },
      headers: redeemHeaders,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toContain('redeemed')
  })

  it('POST expires a voucher', async () => {
    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/vouchers`,
      payload: { code: 'GUT001', valueCents: 500 },
      headers: adminHeaders,
    })

    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/vouchers/GUT001/expire`,
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('expired')
  })

  it('POST concurrent redemptions of the same voucher → exactly one succeeds', async () => {
    const station = await prisma.station.create({ data: { name: 'Bar', eventId } })
    const product = await prisma.product.create({ data: { name: 'Bier', priceCents: 300, stationId: station.id } })
    const waiter = await prisma.waiter.create({ data: { name: 'Alice', pin: '1234', eventId } })

    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/vouchers`,
      payload: { code: 'RACE', valueCents: 500 },
      headers: adminHeaders,
    })
    const order = await prisma.order.create({
      data: {
        tableNumber: '1', waiterId: waiter.id, eventId, totalCents: 300,
        items: { create: [{ productId: product.id, quantity: 1 }] },
      },
    })

    const results = await Promise.all([
      server.inject({ method: 'POST', url: '/api/vouchers/redeem', payload: { code: 'RACE', orderId: order.id }, headers: redeemHeaders }),
      server.inject({ method: 'POST', url: '/api/vouchers/redeem', payload: { code: 'RACE', orderId: order.id }, headers: redeemHeaders }),
    ])
    const codes = results.map((r) => r.statusCode).sort()
    expect(codes.filter((c) => c === 200).length).toBe(1)
    expect(codes.some((c) => c === 400 || c === 409)).toBe(true)
  })

  it('POST duplicate voucher code → 409 (not 500)', async () => {
    await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/vouchers`,
      payload: { code: 'DUP', valueCents: 500 },
      headers: adminHeaders,
    })
    const res = await server.inject({
      method: 'POST',
      url: `/api/events/${eventId}/vouchers`,
      payload: { code: 'DUP', valueCents: 900 },
      headers: adminHeaders,
    })
    expect(res.statusCode).toBe(409)
  })
})
