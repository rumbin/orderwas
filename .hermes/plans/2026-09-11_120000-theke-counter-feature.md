# Theke (Counter) Feature — Implementation Plan (v2)

**Status:** Draft — awaiting Philipp's approval. **No implementation yet.**
**Date:** 2026-09-12 (revised after Philipp's answers to open questions)

---

## 0. Resolved Requirements (from Philipp)

1. **Bon numbers reset per event.** The existing per-event `lastTearOffNumber` counter already does this; test→live wipe also resets it to 0. Nothing extra needed.
2. **Counter sells the same products** as waiters for now. (Future: station-specific counters — out of scope, see §Open Points.)
3. **Counter receipts are identical to waiter receipts**, except: waiter name → counter name ("Theke"), table number → Bon (tear-off) number. *Note from code inspection:* receipts today **never print the waiter name** (`server/src/printer/escpos.ts` prints station name, Tisch/Abholcode, Bon-Nr, items, total). So requirement (a) applies to the **UI** (order lists, cashier view), not the printed receipt; requirement (b) means the receipt's identifier line must print `Bon: <n>` for counter orders instead of `Tisch: <x>` / `Abholcode: <y>`.

---

## 1. Concept & Core Design Decisions

### 1.1 The counter is a login identity, not a new module

**Decision:** The "Theke" is a **dedicated Waiter record** flagged `isCounter: true`, gated into existence by a new `Event.counterEnabled` boolean.

Rationale (DRY): the counter workflow is the waiter workflow with three differences (identifier, post-submit behavior, cashier view). By making the counter a waiter login we reuse *everything*: auth/PIN login, session store, JWT permissions, cart, product grid, WebSocket updates, print dispatch, order lifecycle, item-level payment.

- `Event.counterEnabled Boolean @default(false)` — admin toggle per event.
- When enabled: auto-create waiter `Theke` with `isCounter: true`, `canCashOut: true`, `canCancel: true`, `hidden: false`, PIN `0000` (admin can change it on the existing Waiters admin page).
- When disabled: delete the Theke waiter **only if it has no orders**; otherwise set `hidden: true` (FK safety — orders reference `waiterId`).
- **Counter mode in the UI is keyed off `waiter.isCounter`** (the logged-in identity), NOT off `event.counterEnabled`. A normal waiter logging in to a counter-enabled event sees the normal flow. This means zero changes to the session store and login flow beyond adding `isCounter` to the waiter select.
- UI label: whenever an order's waiter `isCounter` is true, display `t('order.counter')` ("Theke") instead of the waiter name. Never string-match on the name (rename-safe, i18n-safe).

### 1.2 The Bon number IS the tear-off number

**Decision:** No new order field. The Bon number entered at the counter is stored as the order's existing `tearOffNumber`.

- The server already atomically assigns `tearOffNumber = ++event.lastTearOffNumber` per order (shared sequence across waiters and counter — one event-wide sequence, which matches "Bon numbers reset per event").
- **Pre-fill:** the Bon input shows `event.lastTearOffNumber + 1` (advisory only — a concurrent waiter order may take that number first; the server's authoritative number comes back in the response and feeds the next pre-fill).
- **Manual entry:** the counter staff can overwrite the pre-fill with the number of the physical tear-off pad ticket. Server semantics for a submitted `tearOffNumber`:
  - must be a positive integer;
  - must not collide with an existing order of the same event → 409 otherwise;
  - the order stores the submitted value, and `event.lastTearOffNumber` is bumped to `max(current, submitted)` so the next pre-fill continues after the highest used number.

### 1.3 Order creation rule changes

Current validation (`routes/orders.ts` Zod + `orderService.createOrder`) demands **exactly one** of `tableNumber` / `pickupCode`. Counter orders have **neither**. New rule:

- **At most one** of `tableNumber` / `pickupCode` (Zod refine change).
- If **neither** is present → this must be a counter order: the referenced waiter must have `isCounter: true`, else 400. A counter order must carry `tearOffNumber` (the Bon); an auto-assigned number is acceptable too (pre-fill submitted as-is = the common case).
- **Single-unpaid-order invariant (server-enforced):** when the waiter is a counter, `createOrder` rejects with 409 if that counter waiter already has a non-cancelled, non-`paid` order. This makes "no new order until the previous one is paid" a real backend invariant, not just a disabled button.

### 1.4 Workflow comparison (what actually differs)

| Aspect | Waiter (unchanged) | Theke |
|---|---|---|
| Identifier input | Tisch (free text) | Bon (integer, pre-filled `last+1`, manually overridable) |
| Order record | `tableNumber` set | `tableNumber`/`pickupCode` null, `tearOffNumber` = Bon |
| After submit | Toast + jump to Kassieren with that table (existing behavior) | Jump to Kassieren showing the Bon order (same pattern, different data source) |
| Kassieren | Table switcher, any table | No switcher — always the (single) unpaid counter order |
| New order | Immediately | Blocked (UI banner + server 409) until full payment → auto-return to Neue Bestellung |
| Label in lists | Waiter name | "Theke" |
| Station display | `Tisch 12` | `Bon #n` |
| Receipt | `Tisch: 12  Bon-Nr: 34` | `Bon: 34` (no Tisch line) |

### 1.5 DRY strategy

- **OrderPage:** one page, conditional branches only in (a) CartBar input field, (b) submit validation, (c) post-submit payload, (d) cashier tab props, (e) blocked banner. No second page.
- **CashierView:** same component; counter mode = hide table switcher + fetch by counter endpoint instead of table endpoint. Item list, selection, calculator, pay bar, toasts reused as-is.
- **Shared display helper** `client/src/lib/orderIdentifier.ts`: `orderIdentifier(order, t)` → `Tisch 12` / pickup code / `Bon #n`; and `orderActorLabel(waiter, t)` → waiter name or "Theke". Used by StationDisplay (order view + product aggregation), Orders tab, CashierView header. Today `order.tableNumber ?? order.pickupCode ?? '?'` is duplicated in StationDisplay (twice) and Order.tsx Orders tab.
- **paymentService:** extract the order→`TableOrder[]` mapping from `listUnpaidByTable` into a private `mapToTableOrders()`; the new counter query reuses it.

---

## 2. Task Breakdown (TDD, commit per task, `npm run ci` per phase)

### Phase A — Backend

#### Task A1: Schema + types
- `server/prisma/schema.prisma`: `Event.counterEnabled Boolean @default(false)`; `Waiter.isCounter Boolean @default(false)`.
- Regenerate: `cd server && npx prisma db push --force-reset && npx prisma generate && npx prisma db seed` (seed stays counter-disabled by default so existing E2E is untouched).
- `client/src/api/types.ts`: add both fields (`Event.counterEnabled`, `Waiter.isCounter`).
- Ensure `isCounter` is included in every waiter select that reaches the client: `waiterSelect` in `routes/waiters.ts`, the auth login response, and `listOrdersByEvent`'s `waiter` include (needed for Theke labeling in order lists). **Never** add `pin` (AGENTS.md rule).
- Commit: `feat: add counterEnabled and isCounter flags`.

#### Task A2: eventService counter enable/disable (TDD)
- `server/tests/unit/` (or integration) first: enabling creates exactly one `isCounter` waiter (idempotent — a second enable must not duplicate); disabling deletes it when order-free, hides it when it has orders.
- Implement in `server/src/services/eventService.ts:updateEvent`.
- `server/src/routes/events.ts`: add `counterEnabled: z.boolean().optional()` to `updateEventSchema`.
- Commit: `feat: Theke waiter lifecycle on counterEnabled toggle`.

#### Task A3: createOrder counter path (TDD)
- Failing tests first (`server/tests/integration/orders*.ts`):
  1. counter waiter + no table + no pickup + bon → 201, `tearOffNumber` = submitted value, `tableNumber`/`pickupCode` null;
  2. counter waiter without explicit bon (omit field) → auto-increment as today;
  3. manual bon > current counter → event `lastTearOffNumber` bumped;
  4. duplicate bon → 409;
  5. non-counter waiter with neither table nor pickup → 400;
  6. counter waiter with a second unpaid order → 409;
  7. after the counter order is paid → new counter order → 201;
  8. cancelled counter order does not block → 201.
- Implement in `server/src/services/orderService.ts` (load waiter with `isCounter`, relax XOR, single-unpaid check + bon logic inside the existing transaction) and `routes/orders.ts` (Zod: `tearOffNumber: z.number().int().positive().optional()`, refine → "at most one").
- Commit: `feat: counter order creation with bon numbers`.

#### Task A4: Counter payment read endpoint (TDD)
- `paymentService.ts`: extract `mapToTableOrders()`; add `listUnpaidForCounter(eventId, counterWaiterId)` → same `TableOrder[]` shape, 0 or 1 order (latest with unpaid items).
- `routes/payments.ts`: `GET /events/:eventId/counter/unpaid` (any valid JWT; the client only calls it in counter mode). Thin route, service call.
- Commit: `feat: unpaid counter order endpoint`.

#### Task A5: Receipt identifier (TDD)
- Failing unit test in `server/tests/unit/` for `formatReceipt`: counter order (no table/pickup) → receipt contains `Bon: <n>` and no `Tisch:`/`Abholcode:` line.
- `server/src/printer/escpos.ts` identifier line: `tableNumber ? Tisch : pickupCode ? Abholcode : 'Bon: ' + tearOffNumber`.
- Commit: `feat: Bon identifier on counter receipts`.

### Phase B — Frontend

#### Task B1: Shared order identifier helper (TDD, client test)
- Create `client/src/lib/orderIdentifier.ts` with `orderIdentifier(order, t)` + `orderActorLabel(waiter?, t)`; unit test covers table / pickup / counter (null-null) cases.
- Refactor call sites: `StationDisplay.tsx` (order card header `data-testid="order-identifier"` + product-view `tables` array), `Order.tsx` Orders tab (both open + done lists — also switch the actor to `orderActorLabel`), `CashierView.tsx` order header.
- Check `KitchenMonitor.tsx` for the same `tableNumber ?? pickupCode` pattern and refactor if present.
- Commit: `refactor: shared order identifier helper`.

#### Task B2: i18n keys (all 3 files, parity test gates)
- `order.bonNumber`: DE "Bon" / EN "Bon" / FR "Bon" (domain term, like the receipt's "Bon-Nr").
- `order.bonPlaceholder`: "Bon-Nr." / "Bon no." / "N° de bon".
- `order.counter`: "Theke" / "Counter" / "Comptoir".
- `order.counterBlocked`: "Bitte zuerst den offenen Bon abkassieren." / "Please cash out the open bon first." / "Veuillez d'abord encaisser le bon ouvert."
- `order.toCashier`: "Zum Kassieren" / "Go to cashier" / "Aller à l'encaissement".
- `cashier.noOpenBon`: "Kein offener Bon" / "No open bon" / "Aucun bon ouvert".
- `admin.counterEnabled`: "Theke (Abholcounter)" / "Counter (pickup)" / "Comptoir (retrait)".
- Run `cd client && npx vitest run tests/i18n-parity.test.ts` until green.
- Commit: `feat: i18n keys for Theke feature`.

#### Task B3: CartBar bon input (client TDD)
- Props: add `isCounterMode`, `bonNumber`, `onBonChange`, `blocked`, `blockedHint`. Keep existing props for waiter mode untouched.
- Counter mode renders `type="number" inputmode="numeric"` bon input (`data-testid="bon-number-input"`) instead of the table input; `blocked` disables submit and shows the hint + (via Order.tsx) a "Zum Kassieren" action.
- Client test: renders bon input in counter mode, renders table input otherwise, submit disabled when blocked.
- Commit: `feat: bon input in CartBar for counter mode`.

#### Task B4: OrderPage counter flow
- `const isCounterMode = waiter.isCounter === true`.
- State: `bonNumber` (pre-filled from `event.lastTearOffNumber + 1` when entering counter mode / returning from cashier), `counterUnpaidOrder: Order | null`.
- On mount + after payment-return: query unpaid counter order (`api.getOrders(event.id)` filtered to `waiterId === waiter.id`, status not paid/cancelled — reuse the existing fetch; no new client API needed for the *banner*; the cashier tab uses the new endpoint).
- Submit (counter mode): `api.createOrder({ tearOffNumber: parseInt(bonNumber), waiterId, eventId, items })` — no `tableNumber`. On success: clear cart, set success toast with the **server-returned** `tearOffNumber`, pre-fill next bon = returned value + 1, switch to cashier tab (same `setTimeout` pattern as the waiter path).
- Blocked banner on Neue Bestellung when `counterUnpaidOrder` exists: hint text + button → cashier tab.
- After cashier reports full payment: return to `new` tab, refresh unpaid check + bon pre-fill.
- Client test: counter submit payload has no tableNumber; blocked banner shown when unpaid counter order exists.
- Commit: `feat: OrderPage counter mode flow`.

#### Task B5: CashierView counter mode
- Props: add `isCounterMode?: boolean`, `onCounterPaymentComplete?: () => void`.
- Counter mode: no table switcher (header shows `t('order.counter')` + Bon # via `orderIdentifier`); data from `GET /events/:eventId/counter/unpaid` (add `api.getCounterUnpaid(eventId)` to `client/src/api/client.ts`); poll on tab focus as today's table mode does via its own effects.
- After a successful `payItems` that leaves no unpaid items → call `onCounterPaymentComplete()`. If unpaid items remain (partial), stay. If the endpoint returns no order (already paid elsewhere), show `cashier.noOpenBon` empty state.
- `Order.tsx` renders `<CashierView isCounterMode onCounterPaymentComplete={...} />` when counter mode.
- Client test: counter mode hides table selector; payment-complete callback fires when order empties.
- Commit: `feat: CashierView counter mode`.

#### Task B6: Admin toggle
- `client/src/pages/admin/Events.tsx`: new "Theke" column — toggle button (green/gray) calling `api.updateEvent(id, { counterEnabled })` + `onChanged()`. Use `t('admin.counterEnabled')` as column title/aria-label.
- Commit: `feat: admin counter toggle`.

### Phase C — E2E + docs

#### Task C1: Playwright E2E `e2e/counter-flow.spec.ts`
Admin login → enable Theke on Testfest → logout → login as Theke (PIN 0000) → assert bon pre-fill visible → add product → submit → assert auto-switch to Kassieren showing the Bon order → attempt Neue Bestellung: submit disabled + banner → return to Kassieren → select all → pay → assert auto-return to Neue Bestellung → assert next pre-fill = previous + 1 → submit next order successfully.
- Commit: `test: e2e counter flow`.

#### Task C2: Docs
- `docs/ARCHITECTURE.md` §4: `Event.counterEnabled`, `Waiter.isCounter`, counter order shape (no table/pickup, bon = tearOffNumber, single-unpaid invariant).
- `docs/REQUIREMENTS.md`: add §17.6 "Theke / Abholcounter" requirement record.
- Commit: `docs: Theke counter feature`.

---

## 3. Verification

- Per task: the task's own tests; per phase: `npm run ci` (typecheck → unit → build → E2E) — local CI after every phase, per your standing convention.
- Manual smoke after Phase C: `npm run dev`, enable Theke in admin, run the E2E journey by hand against the seeded DB, verify a dummy-printer receipt shows `Bon: n` and no Tisch line. Re-seed afterwards (`npx prisma db push --force-reset && npx prisma db seed`).

## 4. Risks / Notes

- **Tear-off sequence is shared** between waiters and the counter (one event-wide counter). The Bon pre-fill can therefore be "stolen" by a concurrent waiter order — the server response remains authoritative. This matches the existing single-sequence design; a separate counter-scoped sequence would be a bigger schema change for no stated need.
- **Duplicate Bon guard:** manual entry colliding with an existing tear-off number → 409 with a clear message; the counter operator can correct the input.
- **Theke default PIN `0000`** — must be changed on the Waiters admin page for real events; noted in docs (v1 is LAN-only, consistent with existing seed PINs).
- **Future:** station-specific counters (multiple Theken, each bound to a station's products) — the `isCounter` flag + event gate keeps the door open (per-station counters would become `Station.isCounter` or a counter→station FK) but is explicitly out of scope now.
- Guest QR orders, pickupCode orders, voucher flows are untouched (their validation paths are disjoint from the counter path).

## 5. Files changed (summary)

- Server: `prisma/schema.prisma`, `services/eventService.ts`, `services/orderService.ts`, `services/paymentService.ts`, `routes/orders.ts`, `routes/events.ts`, `routes/payments.ts`, `routes/waiters.ts` (select only), `printer/escpos.ts`, `tests/**`
- Client: `api/types.ts`, `api/client.ts`, `lib/orderIdentifier.ts` (new), `components/CartBar.tsx`, `components/CashierView.tsx`, `pages/Order.tsx`, `pages/StationDisplay.tsx`, `pages/admin/Events.tsx`, `i18n/{de,en,fr}.json`, `tests/**`
- E2E: `e2e/counter-flow.spec.ts` (new)
- Docs: `docs/ARCHITECTURE.md`, `docs/REQUIREMENTS.md`
