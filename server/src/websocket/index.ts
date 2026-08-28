import { Server as SocketIOServer } from 'socket.io'
import type { Server as HTTPServer } from 'http'
import { EventEmitter } from 'events'

/**
 * Global event bus for decoupling services from Socket.io.
 * Services emit on this; the WebSocket module listens and forwards to clients.
 */
export const orderEvents = new EventEmitter()
orderEvents.setMaxListeners(50) // safety for multiple test suites

export interface OrderEventPayload {
  order: {
    id: string
    eventId: string
    tableNumber: string | null
    pickupCode: string | null
    tearOffNumber: number | null
    status: string
    totalCents: number
    items: Array<{
      id: string
      productId: string
      productName: string
      stationId: string
      quantity: number
      status: string
      comment: string | null
    }>
  }
}

let io: SocketIOServer | null = null

export interface WebSocketOptions {
  /** Verifies a JWT. Returns the payload on success or throws on failure. */
  verifyToken: (token: string) => Promise<unknown> | unknown
}

/**
 * Attaches Socket.io to an HTTP server.
 * Rooms: event:{eventId} and station:{stationId}.
 *
 * Auth: when AUTH_ENFORCED (or production), connections MUST present a valid
 * JWT — otherwise the connection is refused. Station/kitchen displays are
 * public screen pages that connect without a token, so enforcement is opt-in
 * (default off in dev/tests, matching the HTTP global guard).
 */
export function attachWebSocket(httpServer: HTTPServer, opts: WebSocketOptions): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: true },
    path: '/socket.io/',
  })

  const enforcedNow = () =>
    process.env.AUTH_ENFORCED === 'true' || process.env.NODE_ENV === 'production'

  io.use(async (socket, next) => {
    if (!enforcedNow()) return next()
    const token = (socket.handshake.auth as { token?: string })?.token
    if (!token) return next(new Error('Unauthorized'))
    try {
      await opts.verifyToken(token)
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    // Join event room
    socket.on('join:event', (eventId: string) => {
      socket.join(`event:${eventId}`)
    })

    // Join station room
    socket.on('join:station', (stationId: string) => {
      socket.join(`station:${stationId}`)
    })

    // Leave rooms
    socket.on('leave:event', (eventId: string) => {
      socket.leave(`event:${eventId}`)
    })
    socket.on('leave:station', (stationId: string) => {
      socket.leave(`station:${stationId}`)
    })
  })

  // Listen on the global event bus and forward to Socket.io rooms
  orderEvents.on('order:created', (payload: OrderEventPayload) => {
    if (!io) return
    io.to(`event:${payload.order.eventId}`).emit('order:created', payload)
    // Emit to each station that has items in this order
    const stationIds = new Set(payload.order.items.map((i) => i.stationId))
    for (const stationId of stationIds) {
      io.to(`station:${stationId}`).emit('order:created', payload)
    }
  })

  orderEvents.on('order:updated', (payload: OrderEventPayload) => {
    if (!io) return
    io.to(`event:${payload.order.eventId}`).emit('order:updated', payload)
  })

  orderEvents.on('orderItem:status', (payload: { orderId: string; eventId: string; itemId: string; status: string; stationId: string }) => {
    if (!io) return
    io.to(`event:${payload.eventId}`).emit('orderItem:status', payload)
    io.to(`station:${payload.stationId}`).emit('orderItem:status', payload)
  })

  return io
}

/**
 * Get the Socket.io instance (for testing or graceful shutdown).
 */
export function getIO(): SocketIOServer | null {
  return io
}

/**
 * Close the Socket.io server.
 */
export function closeIO(): Promise<void> {
  if (!io) return Promise.resolve()
  return new Promise((resolve) => {
    io!.close(() => {
      io = null
      resolve()
    })
  })
}