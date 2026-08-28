import type { APIRequestContext } from '@playwright/test'

const BASE = 'http://localhost:3000'

/**
 * Returns an Authorization header set for the default admin PIN.
 * The admin login route is public; any subsequently-gated route then works.
 */
export async function adminHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${BASE}/api/auth/admin/login`, {
    data: { pin: process.env.E2E_ADMIN_PIN ?? 'admin' },
  })
  const body = await res.json()
  if (!body?.token) {
    throw new Error(`Admin login failed: ${JSON.stringify(body)}`)
  }
  return { authorization: `Bearer ${body.token}` }
}

/**
 * Returns an Authorization header set for a waiter login.
 */
export async function waiterHeaders(
  request: APIRequestContext,
  waiterId: string,
  pin: string,
): Promise<Record<string, string>> {
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { waiterId, pin },
  })
  const body = await res.json()
  if (!body?.token) {
    throw new Error(`Waiter login failed for ${waiterId}: ${JSON.stringify(body)}`)
  }
  return { authorization: `Bearer ${body.token}` }
}