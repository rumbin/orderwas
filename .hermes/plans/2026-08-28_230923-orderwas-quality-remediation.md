# OrderWas Quality Remediation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix all findings from the 2026-08-28 full-project review (security holes, broken CI, payment-model inconsistencies, DRY violations, test gaps, doc drift) with TDD and per-phase local CI.

**Architecture:** Backend-first security hardening (auth on routes + permission closure), then payment-model unification (single source of truth for "paid"), then DRY refactors (extract shared helpers, split Admin.tsx), then backfill tests for untested features, then doc reconciliation. Each phase ends with `npm run ci` green.

**Tech Stack:** Fastify 5, TypeScript strict, Prisma 5 + SQLite, Zod, Socket.io; React 18, Vite, zustand, react-i18next; Vitest, Playwright.

**Review context (2026-08-28, commit d916ebf):** typecheck ✅, 275 unit/integration tests ✅, build ✅, **E2E ❌ (2 failed, 3 skipped)**, i18n parity ✅ (but check is one-directional). 36 test files / 285 cases. The findings below are ordered by severity within each phase; phases are ordered by risk.

---

## PHASE 0 — CI is red: fix E2E auth breakage (blocking everything)

Root cause: commit `3e63c5a` added `requireAdmin` to events/printers routes and permission gates to orders routes, but E2E specs never authenticate → `POST /api/events` → 401. `npm run ci` fails on HEAD.

### Task 0.1: E2E helper `adminLogin` for specs

**Files:**
- Create: `e2e/helpers/auth.ts`
- Test: `e2e/smoke.spec.ts`, `e2e/order-lifecycle.spec.ts`

**Step 1:** Create helper that logs in as admin (default admin PIN from seed — check `server/src/routes/auth.ts` admin login + `server/prisma/seed.ts` for the seeded admin PIN / SystemSetting `admin_pin` fallback) and returns an `Authorization: Bearer <token>` header object.

```ts
// e2e/helpers/auth.ts
import type { APIRequestContext } from '@playwright/test'

const BASE = 'http://localhost:3000'

export async function adminHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${BASE}/api/auth/admin/login`, {
    data: { pin: process.env.E2E_ADMIN_PIN ?? '<seeded-default>' },
  })
  const body = await res.json()
  return { authorization: `Bearer ${body.token}` }
}

export async function waiterHeaders(request: APIRequestContext, waiterId: string, pin: string) {
  const res = await request.post(`${BASE}/api/auth/login`, { data: { waiterId, pin } })
  const body = await res.json()
  return { authorization: `Bearer ${body.token}` }
}
```

**Step 2:** Update both specs to pass `extraHeaders`/`headers` on every admin-route call (event/printer/station/product/extra/waiter creation in setup).

**Step 3:** Run `npx playwright test --config e2e/playwright.config.ts` → all pass.

**Step 4:** Commit: `fix(e2e): authenticate specs against admin-gated routes`

### Task 0.2: Verify `npm run ci` is green end-to-end

Run: `npm run ci`. Expected: typecheck ✅, 275+ tests ✅, build ✅, E2E ✅ (7/7, none skipped).
Commit (if anything else needed fixing): `fix(ci): restore green pipeline on HEAD`.

---

## PHASE 1 — CRITICAL security fixes (auth closure)

Findings: **8 of 13 route files have zero auth gates** (stations, products, waiters, printers, vouchers, layouts, audit, qr). `PATCH /orders/:id` accepts `status:'paid'/'cancelled'` unauthenticated — bypasses `canCashOut`/`canCancel`. ARCHITECTURE.md §8 promises "onRequest hook guards all /api/*" but `AUTH_ENFORCED` exists only in a comment. WebSocket lets any client join any room. `JWT_SECRET` defaults to a hardcoded string.

### Task 1.1: Global auth hook — implement what ARCHITECTURE.md §8 documents

**Objective:** Every `/api/*` route requires a valid JWT (waiter or admin) except an explicit public allowlist.

**Files:**
- Modify: `server/src/plugins/auth.ts`
- Test: `server/tests/integration/auth-guard.test.ts` (new)

**Design (per ARCHITECTURE.md §8):**
- Allowlist: `/health`, `/api/auth/login`, `/api/auth/admin/login`, guest QR endpoint `POST /api/guest/orders` (token-in-URL model, stays public), and in **test mode** (NODE_ENV=test / AUTH_ENFORCED unset in vitest env) — decide with a failing test first.
- Register a Fastify `onRequest` hook in the auth plugin (or app-level in `server/src/index.ts`) that skips allowlisted paths and otherwise calls `request.jwtVerify()`, replying 401 on failure.
- Because ~40 existing integration tests call routes without tokens, gate enforcement on env: `AUTH_ENFORCED=true` enables the global hook; default **on** in production (`NODE_ENV=production`), off in vitest (set `AUTH_ENFORCED=false` in `server/tests/setup` env or vitest config). This keeps the existing suite green while new tests opt in.

```ts
// sketch — server/src/plugins/auth.ts
const PUBLIC_PATHS = new Set([
  '/health',
  '/api/auth/login',
  '/api/auth/admin/login',
])
server.addHook('onRequest', async (request, reply) => {
  const enforced = process.env.AUTH_ENFORCED === 'true' || process.env.NODE_ENV === 'production'
  if (!enforced) return
  const url = request.url.split('?')[0]
  if (PUBLIC_PATHS.has(url)) return
  if (url.startsWith('/api/guest/')) return // token-in-URL
  try { await request.jwtVerify() } catch { return reply.status(401).send({ error: 'Unauthorized' }) }
})
```

**Step 1 (failing test):** new suite spins `buildServer()` with `AUTH_ENFORCED=true` env, asserts: GET `/api/events` → 401; GET `/api/events` with valid waiter token → 200; GET `/health` → 200; POST `/api/guest/orders` with garbage token → 400/404 (not 401-for-locked-route).
**Step 2:** Implement hook. **Step 3:** `npm -w server run test` green (old tests unaffected because vitest env doesn't set AUTH_ENFORCED).
**Step 4:** Commit: `feat(auth): global onRequest guard per ARCHITECTURE.md §8 (AUTH_ENFORCED)`

### Task 1.2: Close the `PATCH /orders/:id` permission bypass

**Objective:** Status transitions that are permission-gated on dedicated endpoints must not be reachable via the generic PATCH.

**Files:**
- Modify: `server/src/routes/orders.ts:37-39,84-98`
- Test: `server/tests/integration/orderLifecycle.test.ts` (add cases) or new `order-status-permissions.test.ts`

**Step 1 (failing tests):**
1. PATCH `/orders/:id` with `{status:'paid'}` using a token **without** `canCashOut` → 403.
2. Same with `canCashOut` → 200. (Or, if simpler and more honest: restrict the generic PATCH's status enum to `['open','preparing','partial','done']` and force paid/cancelled through the dedicated endpoints — **preferred**, one consistent state machine.)
3. Unauthenticated PATCH → 401.

**Step 2 (implementation, preferred design):**
```ts
const updateOrderStatusBody = z.object({
  status: z.enum(['open', 'preparing', 'partial', 'done']), // paid/cancelled removed
})
```
plus `preHandler: server.authenticate` on the PATCH route. `updateOrderStatus` service keeps its own validation. Update `client/src/api/client.ts` `updateOrderStatus` doc-comment if it mentions paid/cancelled.

**Step 3:** Update the two existing tests in `orders.test.ts:194-223` that PATCH status unauthenticated — they must now expect 401/403 or use tokens.

**Step 4:** Commit: `fix(auth): remove paid/cancelled from generic order PATCH, require auth`

### Task 1.3: Permission gates on the 8 ungated route files

**Objective:** Every mutating endpoint gets a gate; reads get at least `authenticate`.

**Files:**
- Modify: `server/src/routes/{stations,products,waiters,printers,vouchers,layouts,audit,qr}.ts`
- Test: extend auth-guard suite with a table-driven "route × method × expected" test using tokens with/without permissions.

**Gate matrix (minimal, consistent with existing patterns):**

| Route file | Reads (GET) | Mutations |
|---|---|---|
| stations.ts | `authenticate` | `requireAdmin` |
| products.ts | `authenticate` | `requireAdmin` (stock adjust/settle can stay `requirePermission('canCashOut')` if used by waiters — check UI callers first; admin UI is the only caller today → `requireAdmin`) |
| waiters.ts | `authenticate` (list needs waiter-select for login screen — keep public? **No**: login screen needs waiter list per event → keep `GET /events/:id/waiters` public or authenticated-only; decide via test: login page calls it before token exists → **keep this one GET public**, everything else gated) |
| printers.ts | `authenticate` | `requireAdmin` |
| vouchers.ts | `authenticate` | `requireAdmin` |
| layouts.ts | `authenticate` | `authenticate` (waiters edit own layout) |
| audit.ts | `requirePermission('canStatistics')` | `requireAdmin` (settle) |
| qr.ts | `authenticate` (QR gen) | guest order POST stays public (token-in-URL) |

**Important UI check before finalizing:** Login.tsx calls `api.getWaiters(eventId)` before any token exists, and Landing/GuestOrder may fetch events/stations/products unauthenticated. Audit every `client/src/api/client.ts` method → server route → UI caller, and put exactly those pre-login reads on the public allowlist (likely: `GET /api/events`, `GET /api/events/:id`, `GET /api/events/:id/stations`, `GET /api/events/:id/waiters`, guest GETs). Everything else gated. Document the final allowlist in ARCHITECTURE.md §8.

**Step 1 (failing test):** table-driven: for each gated route, no-token → 401; wrong-permission token → 403; right token → 200/201.
**Step 2:** Apply preHandlers. **Step 3:** Full server suite + client suite green (client tests mock the API layer, so unaffected). **Step 4:** Commit: `feat(auth): permission gates across stations/products/waiters/printers/vouchers/layouts/audit/qr`

### Task 1.4: WebSocket auth

**Objective:** Only authenticated clients join event/station rooms.

**Files:**
- Modify: `server/src/websocket/index.ts`
- Test: `server/tests/integration/websocket.test.ts` (extend)

**Design:** socket.io handshake auth: client sends `{ auth: { token } }`; server verifies JWT with the same secret (reuse `server.jwt.verify` via `fastify.jwt` instance — pass the secret or a verify fn into `attachWebSocket`). Invalid/missing token → `next(new Error('unauthorized'))`. Rooms unchanged. Client: `client/src/hooks/useWebSocket.ts` passes the session token in `ioClient({ auth: { token } })`.

**Step 1 (failing test):** connect without token → connect_error; with valid token + `join:event` → receives broadcast.
**Step 2:** Implement server + client change. **Step 3:** websocket.test.ts + client suite green. **Step 4:** Commit: `feat(ws): JWT auth on socket.io connections`

### Task 1.5: Fail fast on missing JWT_SECRET in production

**Files:** `server/src/plugins/auth.ts`, `server/src/index.ts`
**Step 1 (failing test):** start server with `NODE_ENV=production` and no `JWT_SECRET` → expect startup error mentioning JWT_SECRET.
**Step 2:** `if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production')` before plugin registration.
**Step 3:** Test + suite green. **Step 4:** Commit: `fix(auth): refuse to boot in production without JWT_SECRET`

---

## PHASE 2 — Payment model unification (HIGH, money correctness)

Findings: `markPaid` (order-level) and `payItems` (item-level) are disconnected: order-level pay does NOT set `items.paidAt`; `payItems` doesn't validate items belong to actor's event; validation runs outside the transaction (double-payment race); `markPaid`/`reopen`/generic status update write **no audit logs**; `payments.ts` uses `request: any` and has dead try/catch blocks; no payment tests at all.

### Task 2.1: `markPaid` sets item-level payment state + audit log

**Objective:** One source of truth: an order is `paid` ⇔ all non-cancelled items have `paidAt` set.

**Files:**
- Modify: `server/src/services/orderService.ts` (`markPaid`, `reopenOrder`)
- Test: `server/tests/integration/payments.test.ts` (new)

**Step 1 (failing tests):**
- `markPaid` then `GET /events/:id/tables/open` → table no longer listed.
- All items have `paidAt !== null` and `paidByWaiterId` set after order-level pay.
- `reopenOrder` after `markPaid` clears `paidAt`/`paidByWaiterId` (re-openable for cashier mistakes).
- Audit log contains `payment.collected` (order-level: action `order.paid`) after markPaid; `order.reopened` after reopen.

**Step 2:**
```ts
export async function markPaid(id: string, actorWaiterId?: string) {
  // existing status guard ...
  const order = await prisma.$transaction(async (tx) => {
    const now = new Date()
    await tx.orderItem.updateMany({
      where: { orderId: id, status: { not: 'cancelled' }, paidAt: null },
      data: { paidAt: now, ...(actorWaiterId ? { paidByWaiterId: actorWaiterId } : {}) },
    })
    return tx.order.update({ where: { id }, data: { status: 'paid' } })
  })
  // emit + logAudit('order.paid') — reuse emitOrderUpdated helper (see Task 2.4)
}
```

**Step 3:** Server suite green. **Step 4:** Commit: `fix(payments): markPaid sets item paidAt, adds audit trail`

### Task 2.2: `payItems` — event ownership + race-safe validation

**Objective:** Fix cross-event payment and double-payment race.

**Files:**
- Modify: `server/src/services/paymentService.ts:34-134`
- Test: `server/tests/integration/payments.test.ts` (extend)

**Step 1 (failing tests):**
- payItems with itemIds from a different event than the actor's → 409/403 (409 per error convention).
- Concurrent `Promise.all([payItems([id]), payItems([id])])` → exactly one succeeds (200), other 409.
- payItems on cancelled item → 409 (exists already? verify; keep).

**Step 2:** Move validation into the transaction with a conditional update:
```ts
const result = await prisma.$transaction(async (tx) => {
  const items = await tx.orderItem.findMany({
    where: { id: { in: uniqueIds } },
    include: { order: { select: { eventId: true } }, product: { select: { priceCents: true } } },
  })
  if (items.length !== uniqueIds.length) throw new OrderValidationError('Items not found', 404)
  for (const item of items) {
    if (item.order.eventId !== actorEventId) throw new OrderValidationError('Item belongs to another event', 409)
    if (item.status === 'cancelled') throw new OrderValidationError(`Item ${item.id} is cancelled`, 409)
    if (item.paidAt) throw new OrderValidationError(`Item ${item.id} is already paid`, 409)
  }
  // sum computed inside tx from server data
  const res = await tx.orderItem.updateMany({
    where: { id: { in: uniqueIds }, paidAt: null },   // race-safe: only unpaid rows match
    data: { paidAt: now, paidByWaiterId: actorWaiterId },
  })
  if (res.count !== uniqueIds.length) throw new OrderValidationError('Item already paid (concurrent payment)', 409)
  // remaining-count → status update, as today
})
```
Actor's event comes from `request.user.eventId` (JWT claim) — pass it in; drop the separate waiter lookup or keep for name.

**Step 3:** Suite green. **Step 4:** Commit: `fix(payments): event ownership check + race-safe payItems inside transaction`

### Task 2.3: Audit logs for money-relevant actions

**Objective:** markPaid, reopen, status updates audited like cancel/transfer already are.

**Files:** `server/src/services/orderService.ts` (markPaid, reopenOrder, updateOrderStatus)
**Step 1 (failing tests):** after PATCH status / pay / reopen → audit rows with `action` ∈ {`order.statusChanged`, `order.paid`, `order.reopened`} and before/after data.
**Step 2:** Add `logAudit` calls (fire-and-forget like existing ones). **Step 3:** Green. **Step 4:** Commit: `feat(audit): log order paid/reopened/status changes`

### Task 2.4: DRY — extract `emitOrderUpdated` + shared selects

**Objective:** Kill the 5× copy-pasted `orderEvents.emit('order:updated', {...})` payload block and the 3× duplicated Prisma `include` (order-with-items select).

**Files:**
- Create: `server/src/services/orderEvents.ts` (or extend `server/src/websocket/index.ts` exports)
- Modify: `server/src/services/orderService.ts` (all emit sites), `server/src/services/paymentService.ts`

```ts
// server/src/services/orderEvents.ts
import { orderEvents } from '@/websocket'
import type { Order, OrderItem, Prisma } from '@prisma/client'

export const orderWithItemsInclude = {
  items: { include: { product: { select: { id: true, name: true, priceCents: true, stationId: true, color: true } } } },
} satisfies Prisma.OrderInclude

export function emitOrderUpdated(order: Order & { items: OrderItem[] }) {
  orderEvents.emit('order:updated', { order: { id: order.id, eventId: order.eventId, tableNumber: order.tableNumber, pickupCode: order.pickupCode, tearOffNumber: order.tearOffNumber, status: order.status, totalCents: order.totalCents, items: [] } })
}
```
Replace all 5 emit sites (orderService ×4, paymentService ×1). Replace the 3 duplicated `include` objects in listOrdersByEvent/getOrder/createOrder with `orderWithItemsInclude`.
**Test:** existing websocket.test.ts + orderLifecycle tests prove emits still fire (they assert on socket events). Run suite → green.
**Commit:** `refactor(server): extract emitOrderUpdated + shared order include`

### Task 2.5: payments route cleanup

**Files:** `server/src/routes/payments.ts`
- Remove `request: any` → type via `request.user` (Fastify type declaration already exists in auth plugin).
- Remove dead `try { ... } catch (err) { throw err }` wrappers (GET endpoints).
- GET `/events/:eventId/tables/open` + `.../unpaid` get `requirePermission('canCashOut')` (Phase 1 matrix had audit reads gated; cashier tables are cashier-only).
**Test:** typecheck + existing payments tests. **Commit:** `refactor(payments): typed request, drop dead code, gate cashier reads`

---

## PHASE 3 — Correctness fixes (HIGH)

### Task 3.1: Stock check inside the order transaction

**Finding:** `createOrder` runs `checkStockAvailability` **outside** the transaction, then decrements inside — TOCTOU race → negative stock under concurrent orders.

**Files:** `server/src/services/orderService.ts:115-156`, `server/src/services/stockService.ts`
**Step 1 (failing test):** two concurrent `createOrder` calls each requesting the last unit of a tracked product (`Promise.all`) → exactly one 409 "Insufficient stock", stockCount ends at 0, never −1.
**Step 2:** Move the check inside `$transaction` using `tx` (make `checkStockAvailability` accept a client param defaulting to `prisma`, like decrement/restore already do).
**Step 3:** Green. **Step 4:** Commit: `fix(stock): check availability inside order transaction (TOCTOU)`

### Task 3.2: `expandComponents` uses the transaction client

**Finding:** `decrementStock`/`restoreStock` call `expandComponents(productId)` which queries via the global `prisma` client, not the passed `tx` — reads escape the transaction snapshot.

**Files:** `server/src/services/productService.ts:75-85`, `server/src/services/stockService.ts`
**Step 1 (failing test — hard to observe; at minimum assert behavior stays correct):** unit test that decrement of a composite product inside a rolled-back transaction leaves stock unchanged (rollback safety) — currently passes by luck of SQLite isolation; acceptable as regression guard.
**Step 2:** Thread the client: `expandComponents(compositeId, client = prisma)`; stockService passes `tx`.
**Step 3:** Green. **Step 4:** Commit: `fix(stock): expandComponents reads within transaction client`

### Task 3.3: Voucher redemption race + createVoucher uniqueness

**Finding:** `redeemVoucher` read-then-update without transaction/atomic guard → concurrent redemption can double-redeem. `createVoucher` check-then-create has the same pattern (unique constraint exists → catch P2002 instead).
**Files:** `server/src/services/voucherService.ts`
**Step 1 (failing tests):**
- `Promise.all([redeemVoucher(code), redeemVoucher(code)])` → exactly one succeeds.
- Creating a duplicate code → 409 (via P2002 catch), not 500.
**Step 2:**
```ts
const updated = await prisma.voucher.updateMany({
  where: { id: voucher.id, status: 'active' },   // conditional — only active rows match
  data: { status: 'redeemed', redeemedOrderId: orderId, redeemedAt: new Date() },
})
if (updated.count === 0) throw new VoucherError('Voucher is not active (concurrent redemption)', 409)
```
`createVoucher`: drop pre-check, catch `P2002` → 409.
**Step 3:** Green. **Step 4:** Commit: `fix(vouchers): atomic redemption + P2002 handling on create`

### Task 3.4: Schema hardening — hot-path indexes + cascade

**Finding:** No `@@index` on `Order.eventId`, `Order.waiterId`, `Order.tableNumber`, `OrderItem.orderId`, `OrderItem.paidAt`, `OrderItem.productId`, `Product.stationId`, `Voucher.eventId`, `AppLayout.eventId`; `OrderItem.product` relation lacks explicit onDelete (default Restrict is actually correct — deleting a product with order items should be blocked; verify product delete route handles P2003 → 409 "product in use" instead of 500); `AppLayout` has no relation to Event (orphan risk).

**Files:** `server/prisma/schema.prisma`
**Step 1:** Add indexes:
```prisma
model Order {
  @@index([eventId, status])
  @@index([waiterId])
  @@index([tableNumber])
}
model OrderItem {
  @@index([orderId])
  @@index([paidAt])
  @@index([productId])
}
model Product {
  @@index([stationId])
}
model AppLayout {
  @@index([eventId])
  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@index([eventId])   // plus Event.layouts AppLayout[] backrel
}
```
**Step 2:** `cd server && npx prisma db push --force-reset && npx prisma generate && npx prisma db seed`, full server suite green, **re-seed after tests** (convention).
**Step 3:** Check product-delete route handles P2003 (FK restrict from OrderItem) with a failing test → 409 instead of 500.
**Step 4:** Commit: `feat(schema): hot-path indexes, AppLayout event relation, cascade cleanup`

### Task 3.5: QR guest order route hardening

**Finding:** `qr.ts` guest orders attributed to `waiter.findFirst({ active: true })` — an **arbitrary** active waiter; no tests; endpoint logic (token decode, price computation, stock decrement, print dispatch?) all in the route file.
**Files:** `server/src/routes/qr.ts`, new `server/src/services/guestOrderService.ts`
**Step 1 (failing tests):** valid guest order (token for table) → 201 with correct totalCents; invalid token → 400; event not live → 404; product unavailable → 400; insufficient stock → 409.
**Step 2:** Extract logic to `guestOrderService.createGuestOrder(eventId, tableToken, items)`; waiter attribution: use a dedicated seeded system/ghost waiter (e.g. name "Gast", per event, created on demand) — never findFirst on arbitrary waiters. Reuse `createOrder` internals where possible (price snapshot, stock, tear-off) instead of duplicating.
**Step 3:** Green. **Step 4:** Commit: `fix(qr): guest orders via dedicated ghost waiter, extracted service + tests`

---

## PHASE 4 — DRY / cleanliness refactors (MEDIUM)

### Task 4.1: Shared money formatter (client)

**Finding:** `formatPrice` copy-pasted **9×** (8 identical `Intl.NumberFormat('de-DE')` + 1 hand-rolled `(cents/100).toFixed(2)}€` in Admin.tsx:651 which drops locale formatting).
**Files:**
- Create: `client/src/lib/money.ts` — `export function formatPrice(cents: number): string`
- Modify: all 8 files (CalculatorModal, CashierView, ProductSection, CartBar, TableSwitcherModal, Orders, Order, GuestOrder) + Admin.tsx.
**Test:** new `client/tests/money.test.ts` — formats 300 → "3,00 €", 0 → "0,00 €", 123456 → "1.234,56 €" (de-DE).
**Commit:** `refactor(client): single formatPrice in lib/money`

### Task 4.2: Split Admin.tsx (823 lines → 5 modules)

**Finding:** 5 components in one file: Admin (tab shell + login gate), AdminProducts (233-533), ProductEditModal (534-713), AdminExport (713-769), AdminSettings (769+). Same monolith pattern Order.tsx was cured of in commit `6d69751`.
**Files:**
- Create: `client/src/pages/admin/AdminProducts.tsx`, `ProductEditModal.tsx`, `AdminExport.tsx`, `AdminSettings.tsx`
- Modify: `client/src/pages/Admin.tsx` (shell only)
**Constraint:** pure move refactor — no behavior changes. Verify with build + existing tests + manual smoke of each admin tab.
**Commit:** `refactor(client): split Admin.tsx into admin/ modules`

### Task 4.3: Route layer thinning (rule #1: no Prisma in routes)

**Finding:** 7 route files contain direct Prisma calls: layouts (10), stations (11), products (7), waiters (7), qr (6), auth (4), audit (1), vouchers (1).
**Files:** move logic into the matching services (stationService/createStationService, productService, waiterService, layoutService, authService, auditService, voucherService); routes become parse → call → respond.
**Constraint:** behavior-preserving; move the existing integration tests' assertions still pass untouched (they hit HTTP, not services). Do file-by-file with a commit each: `refactor(routes): thin <file> — move Prisma to service`.
Order: layouts → stations → waiters → products → auth → audit → vouchers → qr (qr mostly handled in Task 3.5).

### Task 4.4: API client cleanup

**Finding:** `client/src/api/client.ts` — 5 methods take a redundant `token` param and manually set headers (the request wrapper already injects Authorization from the session store); `createOrder` item type lacks `optionSelections` (server supports it — Order.tsx already sends it, relying on TS blind spot); several `any[]` return types (audit logs, stock history, reports).
**Files:** `client/src/api/client.ts`, `client/src/api/types.ts` (add `AuditLogEntry`, report types), callers in Order.tsx/Orders.tsx/CashierView.tsx (drop token args).
**Test:** client suite green (tests mock `api` module — update mocks if signatures changed).
**Commit:** `refactor(client): typed API client, drop redundant token params, optionSelections in createOrder type`

### Task 4.5: Remove dead/unused things

- `client/src/i18n`: `common.done` exists in EN/FR but not DE and is unused → remove from EN/FR.
- **Parity check upgrade (both directions):** move the parity script from AGENTS.md prose into `client/tests/i18n-parity.test.ts` (fails on any direction mismatch: DE↔EN, DE↔FR) so it runs in every `npm test`.
- `taxRateBps`: stored + exported + imported by configService but **never used in any calculation**. v1 receipts show gross only → keep the field (future tax split is a documented v2 feature) but note it in ARCHITECTURE.md as reserved. (Removing would break config export/import round-trip tests.)
- Dead code scan: `server/src/services/orderService.ts` exports `TxClient` (check usage — remove if unused), unused imports across client (run `npx tsc --noEmit` + manual grep).
**Commit:** `chore: remove dead i18n key, add bidirectional parity test, prune unused exports`

---

## PHASE 5 — Test backfill for untested features (HIGH for convention compliance)

Convention: *every fix ships with an integration test* — the last 3 feature areas shipped with zero.

### Task 5.1: payments integration suite (if not already covered by Phase 2 tasks)
`server/tests/integration/payments.test.ts`: payItems happy path + sum math **with options** (extras priceDelta), 404 unknown items, 409 cancelled/already-paid, event mismatch, concurrency; listOpenTables grouping (multiple orders same table, mixed paid/unpaid), listUnpaidByTable shape. Target: ~15 cases.

### Task 5.2: audit + reports integration suite
`server/tests/integration/audit.test.ts`: audit list filter (action/entityType), stock history for product, settle single + bulk, peak-times shape, station-revenue math (integer cents), waiter summary, product consumption. Target: ~12 cases.

### Task 5.3: QR guest ordering suite (covered in Task 3.5 tests; verify + extend for stock refusal and print behavior).

### Task 5.4: Reorder endpoints
`POST /stations/reorder`, `PATCH /products/reorder`: validation (missing ids → 400), persistence, effect on GET list ordering, FK error → 404. ~6 cases.

### Task 5.5: Replace fake Admin replica test with real component tests
**Finding:** `client/tests/admin-products.test.tsx` renders `TestAdminProducts` — a hand-written replica inside the test file — not the real Admin.tsx. False confidence.
**Files:** `client/src/pages/admin/AdminProducts.tsx` (from Task 4.2), `client/tests/admin-products.test.tsx` (rewrite against real component, mock `@/api/client`).
Cover: render product list per station, price edit + saved state, toggle available, delete confirm, color picker, extras display. ~8 cases.

### Task 5.6: Client tests for CashierView + GuestOrder
- `client/tests/cashier-view.test.tsx`: table list with open sums, select table → items with line totals (options math), select items → sum, pay flow calls `api.payItems` with right ids, calculator change math.
- `client/tests/guest-order.test.tsx`: renders products (hidePrices variant), add to cart, submit calls API with table token.
~10 cases each. Split files per vitest worker-hang convention (never render OrderPage + cart mutations sequentially in one file).

### Task 5.7: E2E journeys (highest-value gaps)
Add to `e2e/`:
- `cashier.spec.ts`: login canCashOut waiter → cashier tab → open tables → pay items → table disappears.
- `guest.spec.ts`: QR URL → guest order → submit → appears in station display (uses same event as lifecycle spec; separate event to avoid interference).
- `admin.spec.ts`: admin login → create station + product + waiter; edit product price; delete product.
~3-4 tests each. Note: E2E runs against the shared dev DB — create dedicated events per spec and clean up (pattern already used in order-lifecycle.spec.ts).

### Task 5.8: Race-condition regression tests (concurrent payItems covered in 2.2; add concurrent order creation tear-off uniqueness + concurrent voucher redemption from 3.3) — assert unique tearOffNumbers under `Promise.all` burst.

---

## PHASE 6 — Documentation reconciliation (MEDIUM)

### Task 6.1: ARCHITECTURE.md
- §8 Auth: replace the aspirational text with the **implemented** model (global hook + allowlist from Task 1.3, AUTH_ENFORCED semantics, WebSocket auth from 1.4, admin PIN source).
- Add §"Payments" (or extend Data Model): item-level paidAt as source of truth, order.status derived semantics, markPaid/payItems unified behavior.
- §Data model: add AppLayout relation, new indexes, note `taxRateBps` reserved-for-v2.
- Remove/update stale plan link if `.hermes/plans/2026-08-14…` no longer reflects reality (keep as history, mark superseded by this plan).

### Task 6.2: REQUIREMENTS.md
- Mark implemented vs deferred per the review's Section C table: payment splitting across methods = deferred v2; Excel/PDF export = deferred; offline/PWA sync = v2; TEST-mode receipt labeling — check current behavior and document.
- Add payment lifecycle (item-level cashier) to functional list — it's built but undocumented.

### Task 6.3: README.md
- Quickstart (install → prisma push + seed → npm run dev → URLs), test matrix (npm run ci), the AUTH_ENFORCED/JWT_SECRET env vars, admin PIN default + how to change, license section verify (GPL-3.0 present).

### Task 6.4: AGENTS.md
- Update the i18n parity section: point to the automated `client/tests/i18n-parity.test.ts` (bidirectional) instead of the manual node one-liner.
- Update "What This Is" line to mention payments/cashier.
- Update repository layout (admin/ modules).

### Task 6.5: skills/orderwas/development/SKILL.md
- Sync conventions with the new auth model (how to add a route: pick gate, add to allowlist only if pre-login), payment source-of-truth rule, parity test location.

---

## Verification (per phase, per user convention)

After **every** task: `npm -w server run test` and/or `npm -w client run test` (whichever side changed).
After **every** phase: `npm run typecheck && npm test && npm run build && npm run test:e2e` (= `npm run ci`), then **re-seed the DB** (`cd server && npx prisma db push --force-reset && npx prisma db seed`) so the dev environment stays consistent.

Final acceptance criteria:
1. `npm run ci` green including E2E.
2. No unauthenticated access to any non-allowlisted `/api/*` route (table-driven test proves it).
3. `PATCH /orders/:id` cannot set `paid`/`cancelled`.
4. Order-level pay and item-level pay agree (paid ⇔ all items paidAt).
5. Concurrency tests pass (payItems, stock, voucher redeem, tear-off uniqueness).
6. Payments/audit/QR/reorder have integration suites; Admin tested against real component.
7. `formatPrice` exists exactly once; Admin.tsx < 150 lines (shell); zero Prisma imports in `server/src/routes/*` (except auth plugin internals).
8. ARCHITECTURE.md §8 matches implementation; i18n parity enforced bidirectionally by a test in `npm test`.
9. Docs updated (REQUIREMENTS status column, README quickstart, AGENTS.md).

---

## Risks / Trade-offs / Open Questions

1. **AUTH_ENFORCED default-off in dev/tests** — pragmatic (keeps 40+ existing tests green) but means dev runs unprotected until Phase 1 ends. Alternative: flip every existing test to send tokens (large diff, high churn). Recommendation: land 1.1–1.3, then a follow-up chore pass to make the suite token-aware and flip the default to on.
2. **Global hook vs per-route preHandler** — per-route is more explicit but is exactly what led to 8 forgotten files. Global hook + allowlist is the pattern ARCHITECTURE.md already documents; per-route gates then only add *permission* granularity.
3. **Public allowlist for pre-login reads** — Login/Landing pages need events/stations/waiters before a token exists. On a festival LAN this is acceptable (v1 threat model: network semi-trusted, PINs are the credential). Documented explicitly in ARCHITECTURE.md. If undesired, pre-login pages would need a public "bootstrap" endpoint returning only id+name — out of scope here.
4. **Restricting PATCH status enum** (Task 1.2 preferred design) changes the API surface; the client only ever sends the four allowed statuses (verify by grepping client `updateOrderStatus` calls before merging).
5. **Guest waiter attribution** (Task 3.5) introduces a ghost waiter per event — visible in waiter lists unless filtered (`hidden: true` — reuse the existing flag; verify login screen filters hidden waiters).
6. **SQLite concurrency tests** — `Promise.all` races are timing-dependent; SQLite WAL serializes writes, so tests assert the *guard* works (conditional updateMany count), not the scheduler. Keep assertions deterministic: exactly one success, one 409.
7. **Admin split + real-component tests** depend on Task 4.2 landing before 5.5.
8. **E2E against shared dev DB** — specs must create + clean their own events (existing pattern); two `npm run dev` sessions could collide; note in README that E2E expects a clean-ish DB or auto-seeds.
9. **Subagent timeouts during review** (backend/frontend/docs reviewers hit API limits) — those areas were re-verified directly by the parent; residual risk of missed findings is low but nonzero. The plan covers everything found by both the parent and the tests reviewer.
