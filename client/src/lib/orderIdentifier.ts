import type { Order, Waiter } from '@/api/types'

type Translate = (key: string) => string

type OrderIdentity = Pick<Order, 'tableNumber' | 'pickupCode' | 'tearOffNumber'>
type WaiterIdentity = Pick<Waiter, 'name' | 'isCounter'>

/**
 * Where an order is sold and delivered:
 *   table order   -> "Tisch 12"
 *   pickup order  -> its pickup code (Abholschein)
 *   counter order -> "Bon 7" — the tear-off number the guest holds
 *
 * Centralised so the waiter app, the station display and the cashier screen
 * all label orders the same way.
 */
export function orderIdentifier(order: OrderIdentity, t: Translate): string {
  if (order.tableNumber) return `${t('station.table')} ${order.tableNumber}`
  if (order.pickupCode) return order.pickupCode
  if (order.tearOffNumber != null) return `${t('order.bonNumber')} ${order.tearOffNumber}`
  return '—'
}

/**
 * True when the Bon *is* the order's identifier (counter order), i.e. the
 * tear-off number is already part of the label and must not be shown again.
 */
export function bonIsIdentifier(order: Pick<Order, 'tableNumber' | 'pickupCode'>): boolean {
  return !order.tableNumber && !order.pickupCode
}

/**
 * Who sold the order: the waiter's name, or the counter label for Theke
 * orders (the counter login must never show up as a person).
 */
export function orderActorLabel(
  waiter: WaiterIdentity | null | undefined,
  t: Translate,
): string {
  if (!waiter) return ''
  return waiter.isCounter ? t('order.counter') : waiter.name
}
