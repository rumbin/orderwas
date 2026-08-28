import { describe, it, expect } from 'vitest'
import { formatPrice } from '@/lib/money'

describe('formatPrice', () => {
  it('formats integer cents as EUR with de-DE decimal comma', () => {
    expect(formatPrice(300)).toBe('3,00\u00a0€')
  })

  it('handles zero', () => {
    expect(formatPrice(0)).toBe('0,00\u00a0€')
  })

  it('groups thousands with a dot', () => {
    expect(formatPrice(123456)).toBe('1.234,56\u00a0€')
  })

  it('handles a single cent', () => {
    expect(formatPrice(1)).toBe('0,01\u00a0€')
  })
})