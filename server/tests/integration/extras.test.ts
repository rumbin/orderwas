import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { buildServer, type AppServer } from '@/index'
import { prisma } from '@/db/client'
import { formatReceipt, type ReceiptData, type PrinterConfig } from '@/printer/escpos'

describe('Product extras (Auswahl)', () => {
  let server: AppServer
  let eventId: string
  let stationId: string
  let bratwurstId: string
  let waiterId: string
  let sauceExtraId: string
  let ketchupOptionId: string
  let noMustardOptionId: string

  afterAll(async () => {
    await server?.close()
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.productExtraOption.deleteMany({})
    await prisma.productExtra.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    await prisma.orderItem.deleteMany({})
    await prisma.order.deleteMany({})
    await prisma.productExtraOption.deleteMany({})
    await prisma.productExtra.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.waiter.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})

    server = buildServer()
    await server.ready()

    const ev = await prisma.event.create({ data: { name: 'Extras Test' } })
    eventId = ev.id
    const st = await prisma.station.create({ data: { name: 'Grill', eventId } })
    stationId = st.id
    const product = await prisma.product.create({ data: { name: 'Bratwurst', priceCents: 450, stationId } })
    bratwurstId = product.id
    waiterId = (await prisma.waiter.create({ data: { name: 'Alice', pin: '1234', eventId } })).id

    // Create extra via API: sauce choice (radio)
    const extraRes = await server.inject({
      method: 'POST',
      url: `/api/products/${bratwurstId}/extras`,
      payload: {
        name: 'Soße',
        multiSelect: false,
        options: [
          { name: 'Ohne Senf', priceDeltaCents: 0 },
          { name: 'Mit Ketchup', priceDeltaCents: 50 },
        ],
      },
    })
    expect(extraRes.statusCode).toBe(201)
    const extra = extraRes.json()
    sauceExtraId = extra.id
    noMustardOptionId = extra.options.find((o: { name: string }) => o.name === 'Ohne Senf').id
    ketchupOptionId = extra.options.find((o: { name: string }) => o.name === 'Mit Ketchup').id
  })

  it('product GET includes extras with options', async () => {
    const res = await server.inject({ method: 'GET', url: `/api/products/${bratwurstId}` })
    expect(res.statusCode).toBe(200)
    const product = res.json()
    expect(product.extras).toHaveLength(1)
    expect(product.extras[0].name).toBe('Soße')
    expect(product.extras[0].options).toHaveLength(2)
    expect(product.extras[0].multiSelect).toBe(false)
  })

  it('order with option selection includes price delta in total', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/orders',
      payload: {
        tableNumber: '1',
        waiterId,
        eventId,
        items: [{
          productId: bratwurstId,
          quantity: 2,
          optionSelections: [{ extraId: sauceExtraId, optionId: ketchupOptionId }],
        }],
      },
    })
    expect(res.statusCode).toBe(201)
    const order = res.json()
    // 2 × 450 + 2 × 50 = 1000
    expect(order.totalCents).toBe(1000)

    // Options persisted on item as JSON
    const item = order.items[0]
    const options = JSON.parse(item.options)
    expect(options).toHaveLength(1)
    expect(options[0].extraName).toBe('Soße')
    expect(options[0].optionName).toBe('Mit Ketchup')
    expect(options[0].priceDeltaCents).toBe(50)
  })

  it('order with zero-delta option keeps base price', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/orders',
      payload: {
        tableNumber: '2',
        waiterId,
        eventId,
        items: [{
          productId: bratwurstId,
          quantity: 1,
          optionSelections: [{ extraId: sauceExtraId, optionId: noMustardOptionId }],
        }],
      },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().totalCents).toBe(450)
  })

  it('rejects option from wrong product (400)', async () => {
    // Create another product with its own extra
    const other = await prisma.product.create({ data: { name: 'Pommes', priceCents: 300, stationId } })
    const otherExtra = await server.inject({
      method: 'POST', url: `/api/products/${other.id}/extras`,
      payload: { name: 'Größe', options: [{ name: 'Klein' }, { name: 'Groß', priceDeltaCents: 100 }] },
    })
    const otherExtraId = otherExtra.json().id
    const otherOptionId = otherExtra.json().options[0].id

    const res = await server.inject({
      method: 'POST', url: '/api/orders',
      payload: {
        tableNumber: '3',
        waiterId,
        eventId,
        items: [{
          productId: bratwurstId, // Bratwurst, but option from Pommes' extra
          quantity: 1,
          optionSelections: [{ extraId: otherExtraId, optionId: otherOptionId }],
        }],
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects two options on radio extra (400)', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/orders',
      payload: {
        tableNumber: '4',
        waiterId,
        eventId,
        items: [{
          productId: bratwurstId,
          quantity: 1,
          optionSelections: [
            { extraId: sauceExtraId, optionId: noMustardOptionId },
            { extraId: sauceExtraId, optionId: ketchupOptionId },
          ],
        }],
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('multiSelect extra allows multiple options', async () => {
    // Add a checkbox extra
    const extrasRes = await server.inject({
      method: 'POST', url: `/api/products/${bratwurstId}/extras`,
      payload: {
        name: 'Extras',
        multiSelect: true,
        options: [{ name: 'Röstzwiebeln', priceDeltaCents: 30 }, { name: 'Curry', priceDeltaCents: 10 }],
      },
    })
    const multi = extrasRes.json()
    const opt1 = multi.options[0]
    const opt2 = multi.options[1]

    const res = await server.inject({
      method: 'POST', url: '/api/orders',
      payload: {
        tableNumber: '5',
        waiterId,
        eventId,
        items: [{
          productId: bratwurstId,
          quantity: 1,
          optionSelections: [
            { extraId: sauceExtraId, optionId: ketchupOptionId },
            { extraId: multi.id, optionId: opt1.id },
            { extraId: multi.id, optionId: opt2.id },
          ],
        }],
      },
    })
    expect(res.statusCode).toBe(201)
    // 450 + 50 + 30 + 10 = 540
    expect(res.json().totalCents).toBe(540)
  })

  it('ESC/POS receipt prints selected options under the item', () => {
    const config: PrinterConfig = { charsPerLine: 42, font: 'A', paperCut: 'partial' }
    const data: ReceiptData = {
      stationName: 'Grill',
      tableNumber: '1',
      pickupCode: null,
      tearOffNumber: 1,
      items: [{
        name: 'Bratwurst',
        quantity: 1,
        priceCents: 450,
        options: [{ extraName: 'Soße', optionName: 'Mit Ketchup', priceDeltaCents: 50 }],
      }],
      totalCents: 500,
      isTestMode: false,
      hidePrices: false,
    }
    const str = formatReceipt(data, config).toString('latin1')
    expect(str).toContain('1× Bratwurst')
    expect(str).toContain('+ Soße: Mit Ketchup')
  })

  it('DELETE /extras/:id removes the group', async () => {
    const res = await server.inject({ method: 'DELETE', url: `/api/extras/${sauceExtraId}` })
    expect(res.statusCode).toBe(204)

    const product = await server.inject({ method: 'GET', url: `/api/products/${bratwurstId}` })
    expect(product.json().extras).toHaveLength(0)
  })
})