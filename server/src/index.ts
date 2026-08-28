import Fastify, { type FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { resolve } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import eventRoutes from '@/routes/events'
import stationRoutes from '@/routes/stations'
import { waitersRoutes } from '@/routes/waiters'
import { ordersRoutes } from '@/routes/orders'
import { paymentsRoutes } from '@/routes/payments'
import { productsRoutes } from '@/routes/products'
import { printersRoutes } from '@/routes/printers'
import { configRoutes } from '@/routes/config'
import { authRoutes } from '@/routes/auth'
import { auditRoutes } from '@/routes/audit'
import { voucherRoutes } from '@/routes/vouchers'
import { qrRoutes } from '@/routes/qr'
import { layoutsRoutes } from '@/routes/layouts'
import authPlugin from '@/plugins/auth'
import { attachWebSocket } from '@/websocket'

export type AppServer = FastifyInstance

const corsPlugin = fp(async (server) => {
  await server.register(cors, {
    origin: true,
  })
})

export function buildServer(): AppServer {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'warn',
    },
  })

  server.register(corsPlugin)
  server.register(authPlugin)

  // API routes
  server.register(authRoutes, { prefix: '/api' })
  server.register(eventRoutes, { prefix: '/api' })
  server.register(stationRoutes, { prefix: '/api' })
  server.register(waitersRoutes, { prefix: '/api' })
  server.register(ordersRoutes, { prefix: '/api' })
  server.register(paymentsRoutes, { prefix: '/api' })
  server.register(productsRoutes, { prefix: '/api' })
  server.register(printersRoutes, { prefix: '/api' })
  server.register(configRoutes, { prefix: '/api' })
  server.register(auditRoutes, { prefix: '/api' })
  server.register(voucherRoutes, { prefix: '/api' })
  server.register(qrRoutes, { prefix: '/api' })
  server.register(layoutsRoutes, { prefix: '/api' })

  server.get('/health', async () => {
    return { status: 'ok' }
  })

  // Serve client build (production: single container, single port)
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const clientDist = resolve(__dirname, '../../client/dist')
  if (existsSync(clientDist)) {
    server.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
      wildcard: false, // let our SPA fallback handle routing
    })

    // SPA fallback: any non-API, non-file route serves index.html
    server.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/health')) {
        return reply.code(404).send({ error: 'Not found' })
      }
      return reply.sendFile('index.html')
    })
  }

  return server
}

async function main() {
  const server = buildServer()
  const port = Number(process.env.PORT ?? 3000)
  const host = process.env.HOST ?? '0.0.0.0'

  try {
    await server.listen({ port, host })
    // Attach WebSocket to the underlying HTTP server
    attachWebSocket(server.server)
    server.log.info(`Orderwas server running on http://${host}:${port}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

// Run only if executed directly (not imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}