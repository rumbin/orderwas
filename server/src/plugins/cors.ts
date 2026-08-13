import fp from 'fastify-plugin'
import cors from '@fastify/cors'

export const corsPlugin = fp(async (server) => {
  await server.register(cors, {
    origin: true, // Allow all origins in development
  })
})