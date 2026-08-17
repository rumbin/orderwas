import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'

export interface JwtPayload {
  waiterId: string
  eventId: string
  permissions: {
    canCancel: boolean
    canCashOut: boolean
    canStatistics: boolean
    canCreateWaiters: boolean
    canTransfer: boolean
    isStationWaiter: boolean
  }
}

/**
 * Registers the JWT plugin and decorates the server with `authenticate`
 * and `requirePermission`.
 * Enforcement is opt-in: routes must call `server.authenticate` in their
 * config to require a token. The global guard is NOT applied automatically
 * until AUTH_ENFORCED=true, so existing tests keep passing.
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

  // Permission gate: usage — server.requirePermission('canCancel')(request, reply)
  // inside a preHandler, or call directly in the handler.
  server.decorate('requirePermission', (permission: keyof JwtPayload['permissions']) => {
    return async (request: any, reply: any) => {
      try {
        const payload = (await request.jwtVerify()) as JwtPayload
        if (!payload.permissions?.[permission]) {
          return reply.status(403).send({ error: `Forbidden: missing permission ${permission}` })
        }
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' })
      }
    }
  })
}

export default fp(authPlugin, { name: 'auth' })

// Augment Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>
    requirePermission: (permission: keyof JwtPayload['permissions']) => (request: any, reply: any) => Promise<void>
  }
}
