import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { prisma } from '@/db/client'
import { expandComponents, addComponent } from '@/services/productService'

describe('ProductComponent (composite products)', () => {
  let stationId: string
  let compositeId: string

  afterAll(async () => {
    await prisma.productComponent.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})
  })

  beforeEach(async () => {
    await prisma.productComponent.deleteMany({})
    await prisma.product.deleteMany({})
    await prisma.station.deleteMany({})
    await prisma.event.deleteMany({})

    const ev = await prisma.event.create({ data: { name: 'Composite Test' } })
    const station = await prisma.station.create({ data: { name: 'Küche', eventId: ev.id } })
    stationId = station.id

    // Base ingredients
    const schnitzel = await prisma.product.create({ data: { name: 'Schnitzel', priceCents: 0, stationId, stockMode: 'tracked', stockCount: 10 } })
    const pommes = await prisma.product.create({ data: { name: 'Pommes', priceCents: 0, stationId, stockMode: 'tracked', stockCount: 20 } })

    // Composite product
    const composite = await prisma.product.create({ data: { name: 'Schnitzel + Pommes', priceCents: 1200, stationId, stockMode: 'composite' } })
    compositeId = composite.id

    await addComponent(compositeId, schnitzel.id, 1)
    await addComponent(compositeId, pommes.id, 1)
  })

  it('expandComponents returns ingredients with quantities', async () => {
    const components = await expandComponents(compositeId)
    expect(components).toHaveLength(2)
    const names = components.map((c) => c.ingredientName).sort()
    expect(names).toEqual(['Pommes', 'Schnitzel'])
    components.forEach((c) => expect(c.quantity).toBe(1))
  })

  it('addComponent adds another ingredient with decimal quantity', async () => {
    const beer = await prisma.product.create({ data: { name: 'Bier 1L', priceCents: 0, stationId, stockMode: 'tracked', stockCount: 5 } })
    await addComponent(compositeId, beer.id, 0.5)

    const components = await expandComponents(compositeId)
    expect(components).toHaveLength(3)
    const beerComponent = components.find((c) => c.ingredientName === 'Bier 1L')
    expect(beerComponent?.quantity).toBe(0.5)
  })

  it('deleting composite product cascades to components', async () => {
    await prisma.product.delete({ where: { id: compositeId } })
    const remaining = await prisma.productComponent.findMany({ where: { compositeId } })
    expect(remaining).toHaveLength(0)
  })
})