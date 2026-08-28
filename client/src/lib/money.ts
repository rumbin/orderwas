/**
 * Shared cents → EUR formatting. The single place money is formatted for
 * display; every component/page that shows a price imports this instead of
 * re-implementing the de-DE Intl.NumberFormat call.
 */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}