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

export interface AdminJwtPayload {
  admin: true
}

/**
 * Registers the JWT plugin and decorates the server with `authenticate`
 * and `requirePermission`.
 * Enforcement is opt-in: routes must call `server.authenticate` in their
 * config to require a token. The global guard is NOT applied automatically
 * until AUTH_ENFORCED=true, so existing tests keep passing.
 */
async function authPlugin(server: FastifyInstance): Promise<void> {
  // Security: never boot in production with the hardcoded default secret.
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production')
  }

  server.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'orderwas-dev-secret-change-me',
  })

  // Global auth guard (ARCHITECTURE.md §8): when AUTH_ENFORCED or in
  // production, every /api/* request requires a valid JWT except the
  // public allowlist below. This closes the per-route gate drift that left
  // 8 route files unprotected. Per-route preHandlers still add PERMISSION
  // granularity on top.
  const PUBLIC_PATHS = new Set([
    '/api/auth/login',
    '/api/auth/admin/login',
    '/api/guest/orders',
  ])

  // GET reads the pre-login pages need (event/waiter/station/product listing).
  // These expose only id+name config needed to render the Landing/Login/Guest flows.
  // Segments: /api/events[:?/:id], /api/events/:id/stations, /api/events/:id/waiters,
  //           /api/stations/:id/products
  function isPublicGet(url: string): boolean {
    if (url === '/api/events') return true
    if (url === '/api/events/') return true
    const segments = url.split('/').filter(Boolean) // e.g. ['api','events','<id>','stations']
    if (segments[0] !== 'api') return false
    if (segments[1] === 'events') {
      // allow /api/events (id optional, no rest)
      if (segments.length === 2) return true
      if (segments.length === 3) return true // /api/events/:id
      // allow .../stations or .../waiters only (no deeper nesting)
      if (segments.length === 4 && (segments[3] === 'stations' || segments[3] === 'waiters')) return true
    }
    if (segments[1] === 'stations' && segments.length === 4 && segments[3] === 'products') return true
    return false
  }

  server.addHook('onRequest', async (request, reply) => {
    const enforced =
      process.env.AUTH_ENFORCED === 'true' || process.env.NODE_ENV === 'production'
    if (!enforced) return
    const url = request.url.split('?')[0]
    if (url === '/health') return
    if (PUBLIC_PATHS.has(url)) return
    if (request.method === 'GET' && isPublicGet(url)) return
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  server.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  // Admin gate: requires JWT with { admin: true }
  server.decorate('requireAdmin', async (request: any, reply: any) => {
    try {
      const payload = (await request.jwtVerify()) as AdminJwtPayload
      if (!payload.admin) {
        return reply.status(403).send({ error: 'Forbidden: admin access required' })
      }
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
    requireAdmin: (request: any, reply: any) => Promise<void>
    requirePermission: (permission: keyof JwtPayload['permissions']) => (request: any, reply: any) => Promise<void>
  }
}
