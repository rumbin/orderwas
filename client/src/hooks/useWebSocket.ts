import { useEffect, useRef } from 'react'
import { io as ioClient, type Socket } from 'socket.io-client'

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

export function useWebSocket(
  stationId: string | null,
  onOrderCreated: (payload: OrderEventPayload) => void,
  onOrderUpdated: (payload: OrderEventPayload) => void,
  onConnectionChange?: (connected: boolean) => void,
  eventId?: string | null,
) {
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!stationId) return

    const socket = ioClient({
      path: '/socket.io/',
      transports: ['websocket'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join:station', stationId)
      // Also join the event room: order:updated events are only broadcast there
      if (eventId) socket.emit('join:event', eventId)
      onConnectionChange?.(true)
    })

    socket.on('disconnect', () => {
      onConnectionChange?.(false)
    })

    socket.on('order:created', onOrderCreated)
    socket.on('order:updated', onOrderUpdated)
    socket.on('orderItem:status', onOrderUpdated) // treat as order update → reload

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [stationId, eventId, onOrderCreated, onOrderUpdated, onConnectionChange])
}