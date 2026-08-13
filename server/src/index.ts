import Fastify, { type FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import cors from '@fastify/cors'

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

  server.get('/health', async () => {
    return { status: 'ok' }
  })

  return server
}

async function main() {
  const server = buildServer()
  const port = Number(process.env.PORT ?? 3000)
  const host = process.env.HOST ?? '0.0.0.0'

  try {
    await server.listen({ port, host })
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