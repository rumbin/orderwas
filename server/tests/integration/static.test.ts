import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildServer, type AppServer } from '@/index'

describe('Static file serving (Task 3.8)', () => {
  let server: AppServer

  beforeAll(async () => {
    server = buildServer()
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  it('GET /health returns JSON', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
    const body = res.json()
    expect(body.status).toBe('ok')
  })

  it('GET /api/nonexistent returns JSON 404 (not SPA fallback)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/nonexistent' })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/json')
  })

  it('GET /api/events returns JSON (API still works)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/events' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
    expect(Array.isArray(res.json())).toBe(true)
  })
})