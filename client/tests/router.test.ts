import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { matchRoute } from '@/router'

describe('matchRoute', () => {
  it('matches exact path', () => {
    expect(matchRoute('/order', '/order')).toEqual({})
  })

  it('matches params', () => {
    expect(matchRoute('/station/:id', '/station/abc123')).toEqual({ id: 'abc123' })
  })

  it('returns null on mismatch', () => {
    expect(matchRoute('/order', '/orders')).toBeNull()
  })

  it('returns null on different length', () => {
    expect(matchRoute('/station/:id', '/station/abc/items')).toBeNull()
  })
})

// We can't test useRouter hook directly without a full DOM environment
// (hashchange events), but we test matchRoute which is the core logic.