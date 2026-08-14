import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    transactionOptions: {
      timeout: 30000,
    },
  })

// Enable WAL mode for better concurrent write performance (needed for
// tear-off number transactions running in parallel).
if (!globalForPrisma.prisma) {
  prisma.$executeRawUnsafe('PRAGMA journal_mode = WAL').catch(() => {})
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}