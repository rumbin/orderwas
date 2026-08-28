# Order → Payment → Delivery Lifecycle Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Streamline the lifecycle: order → print → prepare → deliver → per-table item-level payment collection (Kassieren), with a 3-section waiter screen.

**Architecture:** Payment becomes an **item-level** concern (new `paidAt`/`paidByWaiterId` fields on `OrderItem`), orthogonal to the kitchen status axis (`open/prepared/delivered/cancelled`). A new `paymentService` owns the business logic behind 3 new endpoints. Client gets a new `CashierView` with table-switcher and calculator modals. The waiter screen is restructured into 3 sections.

**Tech Stack:** Fastify 5 + Prisma (server), React 18 + zustand + Tailwind (client), integer cents everywhere (AGENTS.md rule #4).

---

## Current State (verified)

- `OrderItem.status`: `"open" | "prepared" | "delivered" | "cancelled"` — kitchen axis only, no payment tracking.
- `orderService.markPaid(id)` flips the **whole order** to `paid` — not item-level, no batch payment.
- `POST /orders/:id/pay` exists (requires `canCashOut`), used by the (removed) Bezahlen button.
- Waiter screen (`client/src/pages/Order.tsx`): tabs `new | open | done`, each list tab has a "nur meine" checkbox.
- Order creation already prints (`dispatchOrderPrints`) and emits `order:created` → station displays update. **No change needed for step 1 of the workflow.**
- JWT payload contains `waiterId` (auth.ts `JwtPayload`) — actor logging is available via `request.user`.
- Item price = `(product.priceCents + Σ options.priceDeltaCents) × quantity` (options stored as JSON on item).

## Key Decisions

1. **`paidAt DateTime?` + `paidByWaiterId String?` on OrderItem** — not a new status value. Payment is orthogonal to preparation (an item can be `prepared` AND paid). Order auto-transitions to `paid` when all non-cancelled items are paid (audit-logged, WebSocket-emitted).
2. **Permission gate stays:** pay endpoints require `canCashOut` (Alice: yes, Bob: no — matches seed). "Any waiter" in the workflow = any waiter *with* cash-out permission; who collected is logged per item via `paidByWaiterId` + audit log.
3. **Table-centric queries server-side** — the client asks "what's unpaid at table 5?" and "which tables have open sums?", never computes sums over full order lists.
4. **Pickup orders (pickupCode, no table) are out of scope** for Kassieren v1 (workflow is per-table). Open question at the end.
5. **Split calculation:** `n` parts = floor division, remainder cents distributed to the first parts (1001¢ ÷ 3 → 334/334/333). Pure client-side display, server does not care.

---

## Phase A — Backend: Payment Model + API

### Task A1: Schema — paidAt / paidByWaiterId on OrderItem

**Files:**
- Modify: `server/prisma/schema.prisma` (OrderItem model, ~line 165)

```prisma
model OrderItem {
  id        String   @id @default(cuid())
  orderId   String
  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId String
  product   Product  @relation(fields: [productId], references: [id])
  quantity  Int      @default(1)
  status    String   @default("open") // "open" | "prepared" | "delivered" | "cancelled"
  comment   String?
  options   String?  // JSON: [{extraName, optionName, priceDeltaCents}]
  paidAt      DateTime? // null = unpaid; set when payment collected
  paidByWaiterId String? // waiter who collected the payment (FK-free string, waiter may be deleted later)
}
```

**Steps:**
1. Patch schema.
2. `cd server && npx prisma db push --force-reset && npx prisma generate && npx prisma db seed`
3. Verify: `node check-colors`-style script or `npx prisma studio` — expect seed to succeed.
4. Commit: `feat(schema): item-level payment fields`

### Task A2: paymentService — payItems + table queries

**Files:**
- Create: `server/src/services/paymentService.ts`
- Test: `server/tests/integration/payment.test.ts` (write FIRST, TDD)

**Service functions:**

```typescript
// payItems: mark a batch of order items as paid.
// - validates: all item ids exist, none already paid, none cancelled
// - sets paidAt=now, paidByWaiterId=actorWaiterId
// - for each affected order: if all non-cancelled items paid → order.status='paid'
//   else if some paid → order.status stays/becomes 'partial'
// - emits order:updated per affected order (station displays refresh)
// - audit log: action 'order.itemsPaid', afterData {itemIds, sumCents, actorId}
export async function payItems(itemIds: string[], actorWaiterId: string): Promise<{
  paidCount: number
  sumCents: number
  updatedOrders: { id: string; status: string }[]
}>

// listOpenTables: distinct tables with ≥1 unpaid, non-cancelled item
// in non-cancelled orders. Includes open sum per table.
export async function listOpenTables(eventId: string): Promise<
  { tableNumber: string; openSumCents: number; orderCount: number }[]
>

// listUnpaidByTable: orders of this table that still have ≥1 unpaid,
// non-cancelled item. Fully paid orders are EXCLUDED. Each returned order
// carries ALL its non-cancelled items — paid ones included, flagged via
// paidAt — so the client can gray them out inside the order group.
export async function listUnpaidByTable(eventId: string, tableNumber: string): Promise<
  { orderId: string; tearOffNumber: number | null; waiterName: string; createdAt: Date;
    items: { id: string; productName: string; quantity: number; status: string;
             comment: string | null; options: string | null; lineTotalCents: number;
             paidAt: Date | null }[] }[]
>
```

**lineTotalCents** = `(product.priceCents + Σ JSON.parse(options).priceDeltaCents) × quantity` — reuse the option-parsing pattern from `orderService.createOrder`.

**Status rules (order):** `allPaid → 'paid'`, `somePaid → 'partial'` (both already in `VALID_STATUSES`).

**TDD steps:**
1. Write `server/tests/integration/payment.test.ts` (Fastify inject like existing suites, FK-safe cleanup in beforeEach):
   - pay 2 of 5 items → order status `partial`, items have paidAt set
   - pay remaining items → order status `paid`
   - paying an already-paid item → 409 OrderValidationError
   - paying a cancelled item → 409
   - listOpenTables sums only unpaid items, groups by table
   - listUnpaidByTable returns orders from multiple waiters at same table, only unpaid items
   - listUnpaidByTable: order with some paid items → order included, paid items present with paidAt set, unpaid items have paidAt null
   - listUnpaidByTable: fully paid order → EXCLUDED from response
   - audit log entry created with actor
2. Run `npm -w server run test -- tests/integration/payment.test.ts` → expect FAIL.
3. Implement `paymentService.ts`.
4. Re-run → PASS. Commit.

### Task A3: Routes — 3 endpoints

**Files:**
- Modify: `server/src/routes/orders.ts` (or create `server/src/routes/payments.ts` and register it — prefer new file, payments are a domain)
- Modify: `server/src/index.ts` (register route plugin)

```typescript
// POST /orders/pay-items  (requirePermission('canCashOut'))
// body: { itemIds: string[] }  (nonempty)
// actor = (request.user as JwtPayload).waiterId
// → 200 { paidCount, sumCents, updatedOrders }

// GET /events/:eventId/tables/open
// → 200 [{ tableNumber, openSumCents, orderCount }]  (public like other GETs for now)

// GET /events/:eventId/tables/:tableNumber/unpaid
// → 200 [order-with-unpaid-items] (see A2 shape)
```

Zod schemas at top of file; routes thin (parse → service call → send). Reuse `OrderValidationError` → status-code mapping.

**Steps:** extend the A2 test file to cover routes via inject (401 without token when AUTH_ENFORCED, 200 happy path, 400 on empty itemIds). Run, pass, commit.

---

## Phase B — Client: CashierView

### Task B1: API client methods

**Files:**
- Modify: `client/src/api/client.ts`

```typescript
payItems: (itemIds: string[], token: string) =>
  request<{ paidCount: number; sumCents: number; updatedOrders: { id: string; status: string }[] }>('/orders/pay-items', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ itemIds }) }),
getOpenTables: (eventId: string) =>
  request<{ tableNumber: string; openSumCents: number; orderCount: number }[]>(`/events/${eventId}/tables/open`),
getUnpaidByTable: (eventId: string, tableNumber: string) =>
  request<UnpaidTableOrder[]>(`/events/${eventId}/tables/${encodeURIComponent(tableNumber)}/unpaid`),
```

Add `UnpaidTableOrder` type to `client/src/api/types.ts` (+ `paidAt`/`paidByWaiterId` on `OrderItem` interface). Commit.

### Task B2: CashierView component (core)

**Files:**
- Create: `client/src/components/CashierView.tsx`

**Props:** `{ initialTable: string | null }` — reads event/token/waiter from session store.

**State:** `tableNumber`, `orders` (unpaid by table), `selected: Set<itemId>`, `loading`, `paying`, `calculatorOpen`, `tableModalOpen`, `lastPayment: { sumCents, receivedCents } | null`.

**Layout (mobile-first, matches station-view dark/light classes):**

```
┌──────────────────────────────────────────┐
│ [Tisch 5 ▾]              (opens modal)   │  ← header row, tappable
├──────────────────────────────────────────┤
│ #12 (Alice, 14:32)                       │  ← order group (tear-off, waiter, time)
│   ☐ 2× Bier            6,00 €            │  ← item row: tap = toggle selection
│   ☑ 1× Schnitzel mit   12,00 €           │     (paid → grayed out, NOT selectable)
│   2× Cola              5,00 €   ✓ bezahlt│  ← paid row: grayed, no checkbox
│ #14 (Bob, 14:40)                          │
│   ☐ 1× Cola             2,50 €           │
├──────────────────────────────────────────┤
│ ☑ Alle auswählen                         │  ← select-all (unpaid only!)
│──────────────────────────────────────────│
│ Summe: 20,50 €   [🧮]           [Bezahlt] │  ← sticky bottom bar
└──────────────────────────────────────────┘
```

**Item grouping & display rules:**
- Items are grouped under their originating order (#tear-off, waiter name, time) — never flattened across orders.
- **Paid items stay visible** inside their order group, but rendered grayed out (`opacity-50 text-gray-400` style + ✓ bezahlt badge), no checkbox, not tappable.
- **Fully paid orders are NOT shown** — the server excludes them (A2), so a fully paid order disappears from the list after refresh.

- Selection toggle: row tap flips item in `selected` — **only unpaid rows** are toggleable; sum = Σ selected lineTotalCents (recomputed in render).
- **Select-all**: checkbox sets `selected` = all *unpaid* item ids (never paid ones); unchecking clears.
- **Bezahlt button** (green, right): disabled when `selected.size === 0` or paying → `api.payItems([...selected], token)` → on success: clear selection, reload unpaid list, set `lastPayment` for the Rückgeld banner, keep table. Newly paid items now show grayed; if the order became fully paid it drops off; if table now fully paid → show empty state.
- Empty state: "Keine offenen Posten an diesem Tisch" + hint to switch table.
- Load via `useEffect` on `[tableNumber]`; if `initialTable` set on mount, preselect it.

**Steps:** implement, typecheck, manual smoke via dev server, commit.

### Task B3: Table-switcher modal

**Files:**
- Modify: `client/src/components/CashierView.tsx` (or `client/src/components/TableSwitcherModal.tsx` if it grows — keep in CashierView file while < 100 lines)

- Trigger: the `[Tisch N ▾]` header button.
- Portal-based modal (pattern from `UserMenu.tsx` — fixed positioning, zIndex 99999, `menuRef` outside-click guard).
- Content: list from `api.getOpenTables(eventId)` → rows `Tisch 5 — 38,00 € (3 Bestellungen)`, tap switches `tableNumber` + closes.
- Refresh list each time it opens.
- i18n keys: `cashier.tables`, `cashier.openSum`.

### Task B4: Calculator modal (Rückgeld + split)

**Files:**
- Create: `client/src/components/CalculatorModal.tsx`

- Trigger: 🧮 button next to the sum.
- Shows: current payment sum, numeric input "Erhalten" (euro keypad-friendly `inputMode="decimal"`, parse to cents via string math — **never float**: parse `€,¢` text like "20,50" → 2050).
- **Rückgeld** = received − sum; red if negative ("Fehlbetrag"), green if ≥ 0.
- Split buttons `÷2` `÷3`: show per-part amounts (floor + remainder distribution, Task decision #5) below.
- Pure display — no server call; closing the modal does not clear the entered amount while CashierView stays mounted (`receivedCents` state lives in CashierView, passed down).

### Task B5: Wire into Order.tsx — 3 sections + post-submit jump

**Files:**
- Modify: `client/src/pages/Order.tsx`

1. Tab type: `'new' | 'cashier' | 'orders'` (replace `new|open|done`). Tab bar labels: `order.tabNew` (Neue Bestellung), `order.tabCashier` (Kassieren), `order.tabOrders` (Bestellungen).
2. After successful `handleSubmit`: `setTab('cashier')` + `setCashierTable(tableNumber)` (the just-ordered table). Success toast stays (7 s auto-dismiss, existing).
3. `{tab === 'cashier' && <CashierView initialTable={cashierTable} />}`.
4. **Bestellungen tab** merges old open+done lists into ONE view with the existing `onlyMyOrders` toggle at top:
   - Section "Offen" (ascending by tearOff #, existing open filter incl. all-items-done logic)
   - Divider + Section "Abgeschlossen" (descending, existing done filter incl. `fertig` badge)
   - Cancel button stays on open own orders.
5. Keep: UserMenu, station nav in 'new' tab, cart bar, variant dialog — untouched.

### Task B6: WebSocket refresh (optional polish)

**Files:**
- Modify: `client/src/components/CashierView.tsx`

Subscribe `useWebSocket(event.id)` like StationDisplay does; on `order:updated` → reload unpaid list (another waiter may have paid items). Skip if `useWebSocket` hook API makes this awkward — manual refresh via pull-to-reload is acceptable v1; note in commit message.

---

## Phase C — i18n (parity rule!)

### Task C1: All new keys in DE/EN/FR

**Files:** `client/src/i18n/de.json`, `en.json`, `fr.json` — new `cashier` section:

| key | DE | EN | FR |
|---|---|---|---|
| `order.tabCashier` | Kassieren | Cashier | Encaisser |
| `order.tabOrders` | Bestellungen | Orders | Commandes |
| `cashier.title` | Kassieren | Cashier | Encaissement |
| `cashier.selectTable` | Tisch wechseln | Change table | Changer de table |
| `cashier.openSum` | Offen | Open | À payer |
| `cashier.selectAll` | Alle auswählen | Select all | Tout sélectionner |
| `cashier.sum` | Summe | Total | Total |
| `cashier.paid` | Bezahlt | Paid | Payé |
| `cashier.calculator` | Rechner | Calculator | Calculatrice |
| `cashier.received` | Erhalten | Received | Reçu |
| `cashier.change` | Rückgeld | Change | Monnaie |
| `cashier.changeMissing` | Fehlbetrag | Missing | Manquant |
| `cashier.split2` / `cashier.split3` | Teilung ÷2 / ÷3 | Split ÷2 / ÷3 | Partage ÷2 / ÷3 |
| `cashier.noOpenItems` | Keine offenen Posten an diesem Tisch | No open items at this table | Aucun poste ouvert à cette table |
| `cashier.orders` | orders | commandes | commandes |
| `cashier.paymentSuccess` | Zahlung erfasst | Payment recorded | Paiement enregistré |
| `cashier.itemPaid` | bezahlt | paid | payé |

Run the parity script from AGENTS.md — must print ✅ before commit.

---

## Phase D — Tests & Verification

### Task D1: Client tests (mind the vitest hang!)

**Files:**
- Create: `client/tests/cashier-view.test.tsx` — **rendering only** (header, order groups with unpaid + grayed paid rows, sum, disabled Bezahlt, fully-paid order absent)
- Create: `client/tests/cashier-selection.test.tsx` — **one interaction test** (tap unpaid item → sum updates; select-all selects only unpaid; tapping a paid row does nothing)
- Create: `client/tests/cashier-pay.test.tsx` — **one interaction test** (Bezahlt → payItems called with unpaid ids only, list reloads, paid item now grayed)
- Create: `client/tests/calculator.test.tsx` — split math + Rückgeld display (pure component render + input)

**Rule from 2026-08-24 incident:** each file gets its own vitest worker; at most ONE cart/state-mutating interaction test per file; `mockReset()` + re-apply in `beforeEach`; no `vi.clearAllMocks()`.

Calculator split test vectors: `1001 → [334, 334, 333]`, `600 → [300, 300]`, `500 ÷ 3 → [167, 167, 166]`.

### Task D2: Full verification gate

```bash
cd /home/biephi/hermine/orderwas
npm run typecheck                     # both workspaces
npm -w server run test                # 242 + new payment tests
cd client && npx vitest run           # 33 + new cashier tests
cd .. && npm run build                # dist builds
node -e "<AGENTS.md parity script>"   # i18n ✅
cd server && npx prisma db push --force-reset && npx prisma generate && npx prisma db seed
```

**Manual E2E (dev server):** login Alice → order 2×Bier + 1×Schnitzel at Tisch 5 → submit → screen jumps to Kassieren, Tisch 5 preselected, 3 items listed under their order group → select 2 items → sum 18,00 € → 🧮 enter 20,00 → Rückgeld 2,00 € → ÷2 shows 9,00 € → Bezahlt → the 2 paid items now show GRAYED with ✓ bezahlt inside the order group, Schnitzel remains selectable → pay rest → order group disappears (fully paid), table drops from switcher modal. Login Bob → Kassieren → sees Tisch 5 rows from Alice's order (if Bob lacks canCashOut: 403 → document that seed Bob needs `canCashOut: true` OR keep and note; **decision: add `canCashOut: true` to Bob in seed.ts** so both test waiters can cashier).

**Seed change (part of A1 step 2):** `server/prisma/seed.ts` — Bob gets `canCashOut: true`.

---

## Risks / Open Questions

- **Pickup-code orders** (no table) can't be paid in Kassieren v1 — follow-up if needed.
- **Payment receipts printing** (Kassenbon) not requested — future task; `dispatchOrderPrints` pattern is reusable.
- **Concurrent payment** (two waiters pay same item simultaneously): `payItems` must re-check paid state inside the transaction → 409 to the loser; client reloads on error.
- **`OrderItem.paidByWaiterId`** is a plain string (no FK) so waiter deletion doesn't cascade payment history; audit log holds the authoritative actor name snapshot.
- WebSocket-driven refresh of CashierView is best-effort (B6) — manual reload fallback exists.

## Task Order

A1 → A2 → A3 → B1 → B2 → B3 → B4 → B5 → (B6) → C1 → D1 → D2 → final commit + seed.
