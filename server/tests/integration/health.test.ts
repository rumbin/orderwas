import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildServer, type AppServer } from '@/index'

describe('Health check', () => {
  let server: AppServer

  beforeAll(async () => {
    server = buildServer()
    await server.listen({ port: 0, host: '127.0.0.1' })
  })

  afterAll(async () => {
    await server.close()
  })

  it('GET /health returns 200 with status ok', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })
})