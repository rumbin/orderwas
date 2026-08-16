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
    })

    socket.on('order:created', onOrderCreated)
    socket.on('order:updated', onOrderUpdated)

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [stationId, onOrderCreated, onOrderUpdated])
}
