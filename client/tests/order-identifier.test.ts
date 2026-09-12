import { describe, it, expect } from 'vitest'
import { orderIdentifier, bonIsIdentifier, orderActorLabel } from '@/lib/orderIdentifier'

// Minimal translate stub: keys used by the helper.
const t = (key: string) =>
  ({
    'station.table': 'Tisch',
    'order.bonNumber': 'Bon',
    'order.counter': 'Theke',
  })[key] ?? key

describe('orderIdentifier', () => {
  it('labels a table order with the table number', () => {
    expect(orderIdentifier({ tableNumber: '12', pickupCode: null, tearOffNumber: 5 }, t)).toBe('Tisch 12')
  })

  it('labels a pickup order with its pickup code', () => {
    expect(orderIdentifier({ tableNumber: null, pickupCode: 'A7', tearOffNumber: 6 }, t)).toBe('A7')
  })

  it('labels a counter order with the Bon number', () => {
    expect(orderIdentifier({ tableNumber: null, pickupCode: null, tearOffNumber: 7 }, t)).toBe('Bon 7')
  })

  it('falls back to a dash when the order has no identifier at all', () => {
    expect(orderIdentifier({ tableNumber: null, pickupCode: null, tearOffNumber: null }, t)).toBe('—')
  })
})

describe('bonIsIdentifier', () => {
  it('is true for counter orders (no table, no pickup code)', () => {
    expect(bonIsIdentifier({ tableNumber: null, pickupCode: null })).toBe(true)
  })

  it('is false when a table or pickup code identifies the order', () => {
    expect(bonIsIdentifier({ tableNumber: '12', pickupCode: null })).toBe(false)
    expect(bonIsIdentifier({ tableNumber: null, pickupCode: 'A7' })).toBe(false)
  })
})

describe('orderActorLabel', () => {
  it('names the waiter for regular orders', () => {
    expect(orderActorLabel({ name: 'Alice', isCounter: false }, t)).toBe('Alice')
  })

  it('labels the counter login as the counter, not by its name', () => {
    // The waiter row is named "Theke" in practice, but the label must come from
    // the counter identity, so a renamed row still reads as the counter.
    expect(orderActorLabel({ name: 'Kasse 1', isCounter: true }, t)).toBe('Theke')
  })

  it('is empty without a waiter', () => {
    expect(orderActorLabel(null, t)).toBe('')
    expect(orderActorLabel(undefined, t)).toBe('')
  })
})
