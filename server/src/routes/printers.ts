import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import * as printerService from '@/services/printerService'
import { formatTestPage, type PrinterConfig } from '@/printer/escpos'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import * as net from 'net'

const createPrinterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['network', 'ignore', 'dummy']).optional(),
  ip: z.string().optional(),
  charsPerLine: z.number().int().optional(),
  font: z.string().optional(),
  buzzer: z.boolean().optional(),
  paperCut: z.enum(['full', 'partial', 'none']).optional(),
})

const updatePrinterSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['network', 'ignore', 'dummy']).optional(),
  ip: z.string().nullable().optional(),
  charsPerLine: z.number().int().optional(),
  font: z.string().optional(),
  buzzer: z.boolean().optional(),
  paperCut: z.enum(['full', 'partial', 'none']).optional(),
})

export const printersRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // POST /events/:eventId/printers — create printer
  server.post('/events/:eventId/printers', async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const parsed = createPrinterSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    try {
      const printer = await printerService.createPrinter(eventId, parsed.data)
      return reply.status(201).send(printer)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2003') return reply.status(404).send({ error: 'Event not found' })
      return reply.status(400).send({ error: (err as Error).message })
    }
  })

  // GET /events/:eventId/printers — list printers for event
  server.get('/events/:eventId/printers', async (request) => {
    const { eventId } = request.params as { eventId: string }
    return printerService.listPrintersByEvent(eventId)
  })

  // GET /printers/:id — single printer
  server.get('/printers/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const printer = await printerService.getPrinter(id)
    if (!printer) return reply.status(404).send({ error: 'Printer not found' })
    return printer
  })

  // PUT /printers/:id — update printer
  server.put('/printers/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updatePrinterSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const updated = await printerService.updatePrinter(id, parsed.data)
    if (!updated) return reply.status(404).send({ error: 'Printer not found' })
    return updated
  })

  // DELETE /printers/:id — delete printer
  server.delete('/printers/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const deleted = await printerService.deletePrinter(id)
    if (!deleted) return reply.status(404).send({ error: 'Printer not found' })
    return reply.status(204).send()
  })

  // POST /printers/:id/test — test print (real ESC/POS)
  server.post('/printers/:id/test', async (request, reply) => {
    const { id } = request.params as { id: string }
    const printer = await printerService.getPrinter(id)
    if (!printer) return reply.status(404).send({ error: 'Printer not found' })

    const config: PrinterConfig = {
      charsPerLine: printer.charsPerLine,
      font: printer.font,
      paperCut: printer.paperCut as 'full' | 'partial' | 'none',
    }

    const buffer = formatTestPage(printer.name, config)

    if (printer.type === 'dummy') {
      // Log to file
      const dir = resolve(process.cwd(), 'tmp', 'printer-logs')
      mkdirSync(dir, { recursive: true })
      const filepath = resolve(dir, `test-${Date.now()}-${printer.name}.bin`)
      writeFileSync(filepath, buffer)
      return reply.status(200).send({
        message: 'Test print sent to dummy printer',
        logged: true,
        bytes: buffer.length,
        filepath,
      })
    }

    if (printer.type === 'network') {
      if (!printer.ip) {
        return reply.status(400).send({ error: 'Network printer has no IP configured' })
      }
      try {
        await sendTestToNetwork(printer.ip, 9100, buffer)
        return reply.status(200).send({
          message: `Test print sent to ${printer.ip}:9100`,
          bytes: buffer.length,
        })
      } catch (err) {
        return reply.status(502).send({
          error: `Printer unreachable: ${(err as Error).message}`,
        })
      }
    }

    // type === 'ignore' — no-op
    return reply.status(200).send({ message: 'Printer type is "ignore" — no test print sent' })
  })
}

function sendTestToNetwork(ip: string, port: number, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    socket.setTimeout(5000)
    socket.on('error', (err: Error) => {
      socket.destroy()
      reject(err)
    })
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error('Connection timed out'))
    })
    socket.on('connect', () => {
      socket.write(buffer, () => {
        socket.end()
        resolve()
      })
    })
    socket.connect(port, ip)
  })
}