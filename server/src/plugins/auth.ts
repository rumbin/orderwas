import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'

/**
 * Registers the JWT plugin and decorates the server with `authenticate`.
 * Enforcement is opt-in: routes must call `server.authenticate` in their
 * config to require a token. The global guard is NOT applied automatically
 * until AUTH_ENFORCED=true (Phase 3), so existing tests keep passing.
 */
async function authPlugin(server: FastifyInstance): Promise<void> {
  server.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'orderwas-dev-secret-change-me',
  })

  server.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  })
}

export default fp(authPlugin, { name: 'auth' })

// Augment Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>
  }
}
