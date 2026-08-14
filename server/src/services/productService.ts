import { prisma } from '@/db/client'

/**
 * Creates a product under a station.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createProduct(stationId: string, data: any) {
  return prisma.product.create({ data: { stationId, ...data } })
}

/**
 * Lists products for a station, ordered by sortOrder then name.
 */
export async function listProductsByStation(stationId: string) {
  return prisma.product.findMany({
    where: { stationId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}

/**
 * Gets a single product.
 */
export async function getProduct(id: string) {
  return prisma.product.findUnique({ where: { id } })
}

/**
 * Updates a product.
 */
export async function updateProduct(id: string, data: Record<string, unknown>) {
  try {
    return await prisma.product.update({ where: { id }, data })
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'P2025') return null
    throw err
  }
}

/**
 * Deletes a product. Returns true if deleted.
 * Throws if the product is referenced by OrderItems (caller should handle 409).
 */
export async function deleteProduct(id: string): Promise<boolean> {
  const refCount = await prisma.orderItem.count({ where: { productId: id } })
  if (refCount > 0) {
    throw new ProductReferencedError('Product is referenced by orders and cannot be deleted')
  }
  try {
    await prisma.product.delete({ where: { id } })
    return true
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'P2025') return false
    throw err
  }
}

export class ProductReferencedError extends Error {
  statusCode = 409
}

/**
 * Expands a composite product's components into ingredient quantities.
 * Returns array of { ingredientId, ingredientName, quantity }.
 */
export async function expandComponents(compositeId: string) {
  const components = await prisma.productComponent.findMany({
    where: { compositeId },
    include: { ingredient: { select: { id: true, name: true } } },
  })
  return components.map((c) => ({
    ingredientId: c.ingredientId,
    ingredientName: c.ingredient.name,
    quantity: c.quantity,
  }))
}

/**
 * Adds component ingredients to a composite product.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addComponent(compositeId: string, ingredientId: string, quantity: number) {
  return prisma.productComponent.create({
    data: { compositeId, ingredientId, quantity },
  })
}
