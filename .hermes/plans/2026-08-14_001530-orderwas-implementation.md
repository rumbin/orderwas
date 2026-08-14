# Orderwas Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build an open-source ordering system for club festivals (Vereinsfeste) — browser-based, offline-capable, with ESC/POS printer support.

**Architecture:** Monorepo with a Node.js/TypeScript backend (REST + WebSocket) and a React/Vite frontend (PWA). SQLite via Prisma (PostgreSQL-swappable). Money is integer cents. Thin routes, fat services. See **`docs/ARCHITECTURE.md`** — the binding architecture document.

**Tech Stack:**
- **Backend:** Node.js 20+, TypeScript, Fastify 5, Prisma ORM, SQLite (WAL), Socket.io, Zod
- **Frontend:** React 18, Vite 5, TypeScript, Tailwind CSS, react-i18next, zustand, PWA (vite-plugin-pwa)
- **Testing:** Vitest (unit + integration), Playwright (E2E)
- **Deployment:** Docker, docker-compose (single container, single port)
- **License:** GPL-3.0

---

## Revision History

- **2026-08-14 (v1):** Initial plan.
- **2026-08-14 (v2, glm-5.2 review):** Added Phase 1.7 (products CRUD, auth, service layer, money, tear-off, seed).
- **2026-08-14 (v3, kimi-k3 review):** Deep requirements re-review against orderjutsu-wiki-analysis. **Data model corrections:** Printer as first-class entity, ProductComponent (composite stock), Voucher entity, nullable tableNumber + pickupCode, integer cents everywhere, sammelbonId reserved. **Phase restructuring:** WebSocket merged into the station-display phase (was Phase 4) — a station display without live updates fails requirements §5.3.1 and the Phase-1 roadmap. Docker moved earlier (Phase 6). Explicit v1 non-goals documented (TSE, multi-tenant, floor plan). Task renumbering: phases now use letter-suffixed task IDs within phases (e.g. 2.1, 2.2) to stop the 12a/12e sprawl.

---

## Phase Overview

| Phase | Name | Delivers | Status |
|-------|------|----------|--------|
| 0 | Project Bootstrap | monorepo, tooling | ✅ done |
| 1 | Backend Core — Tracer Bullet | Event/Station/Waiter/Order APIs | ✅ done (with gaps) |
| 1.5 | Local CI Pipeline | typecheck, build, E2E, hooks | ✅ done |
| 1.7 | Backend Foundation Gaps | products CRUD, auth, services, cents, tear-off, seed | ⬜ next |
| 2 | Data Model Completion | Printer entity, ProductComponent, Voucher, pickup codes, schema migration | ⬜ |
| 3 | Frontend Core — Order Taking | login, product grid, cart, submit, PWA shell, dev admin page | ⬜ |
| 4 | Station Display + Real-Time + Printers | kitchen monitor (live), ESC/POS, print on order | ⬜ |
| 5 | Admin & Configuration | admin UI, CRUD pages, config export/import | ⬜ |
| 6 | Advanced Features | vouchers, stock, settlement, QR ordering, permissions | ⬜ |
| 7 | Polish | offline sync, i18n completion, Docker, docs | ⬜ |

**Key sequencing rationale:** Printing and live station displays are the product's core value — they land in Phase 4, before admin polish. Docker moves to Phase 7 but the client is served by Fastify from Phase 3 onward so the single-container topology is never in doubt.

---

## Phase 0: Project Bootstrap ✅ DONE

Tasks 1–3 complete. Monorepo with npm workspaces, Fastify+TS+Prisma+Vitest backend, React+Vite+Tailwind+Vitest frontend, GPL-3.0 LICENSE.

---

## Phase 1: Backend Core — Tracer Bullet ✅ DONE (with gaps tracked in 1.7)

Tasks 4–12 complete: Prisma schema (Event, Station, Product, Waiter, Order, OrderItem, AppLayout), CRUD routes for events/stations/waiters/orders, 35 integration tests passing.

**Known gaps carried into Phase 1.7/2:** no products CRUD route; Float money; pin leaked in responses; no auth; no service layer; tear-off not assigned; no Printer/ProductComponent/Voucher entities.

---

## Phase 1.5: Local CI Pipeline ✅ DONE

Tasks 12a–12d complete: root `typecheck`/`ci` scripts, build verification, Playwright smoke E2E, pre-commit hooks (plain git hooks, no external tools).

---

## Phase 1.7: Backend Foundation Gaps

> Fixes correctness bugs and lays groundwork. No schema-breaking changes here except cents migration prep — the big schema rework is Phase 2.

### Task 1.7.1: Products CRUD route

**Objective:** REST CRUD for products under a station. The client API client already calls these endpoints; backend never implemented them.

**Files:**
- Create: `server/src/routes/products.ts`
- Create: `server/tests/integration/products.test.ts`
- Modify: `server/src/index.ts` (register route)

**Endpoints:**
- `POST /api/stations/:stationId/products` — create (name, price, taxRate, shortName, isVoucher, addable, stockMode, stockCount, sortOrder)
- `GET /api/stations/:stationId/products` — list, ordered by sortOrder
- `GET /api/products/:id` — single
- `PUT /api/products/:id` — update
- `DELETE /api/products/:id` — delete (409 if referenced by OrderItems)

**TDD Steps:**
1. Test: POST creates product → 201 with body
2. Test: GET lists products for station → 200 array sorted by sortOrder
3. Test: PUT updates price → 200
4. Test: DELETE removes product → 204
5. Test: POST to non-existent stationId → 404
6. Test: DELETE product referenced by an OrderItem → 409
7. Run — FAIL
8. Implement with Zod validation
9. Run — PASS
10. Commit: `feat: product CRUD API`

---

### Task 1.7.2: Integer cents for money

**Objective:** Replace Float with Int cents for price/total; taxRate as basis points. Rounding-safe on SQLite.

**Decision (final):** `priceCents Int`, `totalCents Int`, `taxRateBps Int` (2000 = 20.00%). API exposes cents; client formats. `stockCount` stays `Decimal` (0.5L beer is legitimate).

**Files:**
- Modify: `server/prisma/schema.prisma` (Product.price→priceCents Int, Order.total→totalCents Int, Product.taxRate→taxRateBps Int @default(2000))
- Modify: `server/src/routes/orders.ts` (integer total math)
- Modify: `server/tests/integration/orders.test.ts` (prices in cents; add €3.50×3 = 1050 cents regression test)
- Modify: `server/tests/helpers/setup.ts` (beer 300 cents, schnitzel 800 cents)
- Modify: `client/src/api/types.ts` (priceCents: number, totalCents: number)

**TDD Steps:**
1. Write test: order 3× product at 350 cents → totalCents = 1050 exactly
2. Run — FAIL (schema has Float)
3. Migrate schema: `npx prisma db push --force-reset` (dev DB is disposable per DESIGN-DECISIONS)
4. Update code to integer math
5. Run — PASS (all existing tests updated to cents)
6. Commit: `fix: integer cents for all monetary values`

---

### Task 1.7.3: Auth — waiter login endpoint + pin secrecy

**Objective:** `POST /api/auth/login` verifies pin server-side, returns JWT. Pin never appears in any response.

**Files:**
- Create: `server/src/routes/auth.ts`
- Create: `server/src/plugins/auth.ts` (Fastify decorator: `server.authenticate` onRequest hook)
- Create: `server/tests/integration/auth.test.ts`
- Modify: `server/src/routes/waiters.ts` (all reads use `select` excluding `pin`)
- Modify: `server/package.json` (add `@fastify/jwt`)

**Decisions (final):** JWT stateless, 24h expiry, claims `{waiterId, eventId, permissions}`. Secret from env `JWT_SECRET` with dev default. Guarded: everything under `/api` except `/api/auth/login` and (later) guest QR endpoints. Guard wiring happens in Task 1.7.3 but is **permissive until Phase 3** (existing tests keep passing; enforcement flag `AUTH_ENFORCED=false` default until frontend sends tokens).

**TDD Steps:**
1. Test: POST login with correct waiterId+pin → 200 `{token, waiter}` (waiter without pin)
2. Test: wrong pin → 401
3. Test: non-existent waiter → 401 (not 404 — don't leak existence)
4. Test: GET `/api/auth/me` with Bearer token → 200 waiter sans pin
5. Test: GET `/api/auth/me` without token → 401
6. Test: GET `/api/events/:id/waiters` response has no `pin` key anywhere
7. Implement
8. Run — PASS
9. Commit: `feat: auth login endpoint, JWT plugin, pin secrecy`

---

### Task 1.7.4: Service layer extraction

**Objective:** Move business logic out of routes into `server/src/services/`. Binding rule: routes never import Prisma directly after this task.

**Files:**
- Create: `server/src/services/eventService.ts`
- Create: `server/src/services/orderService.ts`
- Create: `server/src/services/productService.ts`
- Create: `server/src/services/waiterService.ts`
- Create: `server/tests/unit/orderService.test.ts`
- Modify: all four route files to delegate

**TDD Steps:**
1. Unit test: `orderService.createOrder` returns order with correct totalCents
2. Unit test: rejects empty items, non-existent product/waiter/event
3. Refactor routes to thin shells (Zod → service → response)
4. All 35+ existing integration tests still PASS (no behavior change)
5. Commit: `refactor: extract service layer from routes`

---

### Task 1.7.5: Tear-off number auto-increment

**Objective:** Per-event atomic tear-off counter assigned on order creation.

**Files:**
- Modify: `server/prisma/schema.prisma` (Event.lastTearOffNumber Int @default(0))
- Modify: `server/src/services/orderService.ts`
- Modify: `server/tests/unit/orderService.test.ts`

**TDD Steps:**
1. Test: first order in event → tearOffNumber 1, second → 2
2. Test: two events have independent sequences
3. Test: two concurrent creates get distinct numbers (Promise.all, assert set size 2)
4. Implement with `prisma.$transaction`: `event.update({data: {lastTearOffNumber: {increment: 1}}})` then use returned value
5. Run — PASS
6. Commit: `feat: atomic per-event tear-off numbers`

---

### Task 1.7.6: Seed data script

**Objective:** One-command dev database with a complete, realistic event.

**Files:**
- Create: `server/prisma/seed.ts`
- Modify: `server/package.json` (`"prisma": {"seed": "tsx prisma/seed.ts"}`)

**Contents:** Event "Testfest"; stations Bar/Küche/Kaffee; ~15 products with real cent prices (350, 200, 850…); waiters Alice/1234, Bob/5678; one AppLayout.

**Steps:**
1. Write seed using Prisma client (idempotent: wipe + recreate the named event)
2. `npx prisma db push --force-reset && npx prisma db seed`
3. Verify via API: events/stations/products/waiters all list
4. Commit: `feat: development seed data`

---

## Phase 2: Data Model Completion

> Schema rework derived from the wiki-analysis gap review. One migration, done now — before the frontend writes against the API — so the client never sees the old shapes.

### Task 2.1: Printer entity + migration

**Objective:** Printers as first-class entities; Station/Waiter reference them by FK.

**Schema:**
```prisma
model Printer {
  id           String   @id @default(cuid())
  name         String
  type         String   @default("network") // "network" | "ignore" | "dummy"
  ip           String?
  charsPerLine Int      @default(42)
  font         String   @default("A")
  buzzer       Boolean  @default(false)
  paperCut     String   @default("partial") // "full" | "partial" | "none"
  eventId      String
  event        Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  stations     Station[]
  waiters      Waiter[]
  altFor       StationAltPrinter[]
}

model StationAltPrinter {  // alternative printers per table range / pickup code (wiki §9)
  id          String  @id @default(cuid())
  stationId   String
  station     Station @relation(fields: [stationId], references: [id], onDelete: Cascade)
  printerId   String
  printer     Printer @relation(fields: [printerId], references: [id])
  tableFrom   String?
  tableTo     String?
  pickupCode  String?
}
```
Station: replace `printerIp`/`printerType` with `printerId String?` FK. Waiter: same for its optional printer.

**TDD Steps:**
1. Test: create printer, assign to station, read station includes printer
2. Test: alt printer with table range persists
3. Migrate schema, update affected routes/services/tests
4. Run full suite — PASS
5. Commit: `feat: first-class Printer entity with station/waiter FKs`

---

### Task 2.2: Printer CRUD routes

**Objective:** `/api/events/:eventId/printers` CRUD + `POST /api/printers/:id/test` (stub — real print lands in Phase 4; stub returns 200 for dummy, 501 for network until then).

**TDD:** standard CRUD pattern (create/list/get/update/delete + 404s). Commit: `feat: printer CRUD API`

---

### Task 2.3: ProductComponent for composite products

**Objective:** Join table enabling `stockMode: "composite"` to actually work in Phase 6.

**Schema:**
```prisma
model ProductComponent {
  id           String  @id @default(cuid())
  compositeId  String
  composite    Product @relation("Composite", fields: [compositeId], references: [id], onDelete: Cascade)
  ingredientId String
  ingredient   Product @relation("Ingredient", fields: [ingredientId], references: [id])
  quantity     Float   // decimal quantities allowed (0.5L beer)
}
```
Product gets `components ProductComponent[] @relation("Composite")` and `usedIn ProductComponent[] @relation("Ingredient")`.

**TDD Steps:**
1. Test: create composite "Schnitzel+Pommes" with components 1× Schnitzel + 1× Pommes
2. Test: `productService.expandComponents(compositeId)` returns ingredient quantities
3. Implement service expansion helper now (used by stock in Phase 6)
4. Commit: `feat: composite product components`

---

### Task 2.4: Voucher entity

**Objective:** Redemption-tracking entity for the voucher system (Phase 6 consumes it; schema lands now).

**Schema:**
```prisma
model Voucher {
  id              String   @id @default(cuid())
  eventId         String
  event           Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  code            String
  valueCents      Int
  status          String   @default("active") // "active" | "redeemed" | "expired"
  redeemedOrderId String?
  createdAt       DateTime @default(now())
  redeemedAt      DateTime?
  @@unique([eventId, code])
}
```

**TDD:** model test — create, unique (eventId, code) constraint, status transitions. Commit: `feat: voucher entity`

---

### Task 2.5: Pickup codes + nullable tableNumber

**Objective:** Support Abholscheine/Bonkasse modes: orders without table numbers.

**Schema changes:**
- `Order.tableNumber String?` (was required)
- `Order.pickupCode String?`
- `Waiter.pickupCode String?` (Abholkennzeichen — waiter's orders skip table entry)
- `Order.sammelbonId String?` (reserved for Phase 6 collective receipts)

**Validation rule (Zod, in orderService):** exactly one of `tableNumber` or `pickupCode` must be present.

**TDD Steps:**
1. Test: order with tableNumber only → OK
2. Test: order with pickupCode only → OK, gets tearOffNumber
3. Test: neither → 400; both → 400
4. Migrate, update service + tests
5. Commit: `feat: pickup-code orders, nullable table numbers`

---

### Task 2.6: Event test→live wipe

**Objective:** Wiki §14 business rule: switching test→live deletes all orders (and later vouchers/messages) for that event.

**TDD Steps:**
1. Test: event with orders, PUT status test→live → orders gone, tear-off counter reset
2. Test: live→test keeps data (no rule against it)
3. Implement in `eventService.setStatus` with transaction
4. Commit: `feat: test→live transition wipes event orders`

---

### Task 2.7: Client types sync

**Objective:** Regenerate `client/src/api/types.ts` to match the new API shapes (cents, Printer, nullable tableNumber, pickupCode). Update `client/src/api/client.ts` with printer endpoints.

**TDD:** client typecheck + existing client tests pass. Commit: `chore: sync client types with Phase 2 schema`

---

## Phase 3: Frontend Core — Order Taking

> Prereq: seed script (1.7.6) provides data; auth (1.7.3) provides login. From this phase on, `AUTH_ENFORCED=true` and the client sends tokens.

### Task 3.1: Hash-based routing shell

**Objective:** Minimal router without a dependency: `#/` login, `#/order`, `#/orders`, `#/admin` (dev), `#/station/:id` (Phase 4). Hash routing avoids server-side route config in the single-container deployment.

**Files:** Create `client/src/router.tsx`, modify `App.tsx`.
**TDD:** renders login at `#/`; navigates on hashchange. Commit: `feat: hash routing shell`

---

### Task 3.2: Waiter login page

**Objective:** Select event → select waiter → enter PIN → store token+session in zustand.

**Files:** Create `client/src/pages/Login.tsx`; modify `stores/session.ts` (token, persist to localStorage).
**TDD Steps:**
1. Test: renders event selector populated from API
2. Test: waiter list loads after event select
3. Test: correct PIN → token stored, navigate to `#/order`
4. Test: wrong PIN → error message (i18n key `login.wrongPin`)
5. Implement mobile-first, large touch targets
6. Commit: `feat: waiter login page`

---

### Task 3.3: Order page — product grid

**Objective:** Products grouped by station, rendered as a touch grid (min 44×44px targets), tap to add to cart.

**Files:** Create `client/src/pages/Order.tsx`, `client/src/components/ProductGrid.tsx`.
**TDD Steps:**
1. Test: grid renders products grouped by station
2. Test: tap product → cart store gains item
3. Test: tap again → quantity increments
4. Test: unavailable products (`available=false`) hidden/disabled
5. Commit: `feat: product selection grid`

---

### Task 3.4: Order page — cart + submit

**Objective:** Cart summary with quantities/total (formatted from cents), table number OR pickup code input, submit → POST → success feedback → cart cleared.

**TDD Steps:**
1. Test: cart shows items, quantities, formatted total (de-DE €)
2. Test: submit with table number → API called, success message, cart cleared
3. Test: submit without table number (and no pickup mode) → validation error
4. Test: API error → error banner, cart preserved
5. Commit: `feat: order cart and submission`

---

### Task 3.5: Waiter order overview

**Objective:** Waiter's own orders with status badges (open/preparing/partial/paid/cancelled), pull to refresh.

**TDD:** list renders; badges map statuses; filter to current waiter. Commit: `feat: waiter order overview`

---

### Task 3.6: Dev admin setup page

**Objective:** Bare-bones `#/admin` page: create event, stations, products, waiters, printers — so the full flow is drivable without curl. Not the Phase-5 admin UI; forms only, no styling polish.

**TDD:** create event → station → product → waiter via UI, then login flow works against created data. Commit: `feat: dev admin setup page`

---

### Task 3.7: PWA manifest + service worker

**Objective:** Installable PWA shell (online-only data for now; offline order queue is Phase 7).

**Files:** Modify `client/vite.config.ts` (vite-plugin-pwa), create `client/public/manifest.json` + icons.
**Steps:** configure plugin, manifest (name, theme, icons), verify installable in Lighthouse. Commit: `feat: PWA manifest and service worker`

---

### Task 3.8: Serve client from Fastify

**Objective:** Production topology: Fastify serves `client/dist` via `@fastify/static` with SPA fallback to index.html. Single port, single container — the Docker shape from here on.

**TDD:** integration test: GET `/` → 200 text/html; GET `/api/health` still JSON. Commit: `feat: serve client build from Fastify`

---

## Phase 4: Station Display + Real-Time + Printers

> The product's core value. WebSocket is in THIS phase (merged from old Phase 4): a station display without live updates fails requirements §5.3.1.

### Task 4.1: WebSocket server

**Objective:** Socket.io attached to the Fastify server; rooms `event:{id}` and `station:{id}`; emit `order:created` / `order:updated` / `orderItem:status` from services.

**Files:** Create `server/src/websocket/index.ts`; modify `services/orderService.ts` (post-commit emit hooks); create `server/tests/integration/websocket.test.ts`.
**TDD Steps:**
1. Test: client joins event room, receives `order:created` after POST /api/orders
2. Test: PATCH order status → `order:updated`
3. Test: station room receives only orders containing its station's items
4. Commit: `feat: WebSocket order events`

---

### Task 4.2: Station display — order view (live)

**Objective:** `#/station/:id` page: open items for the station grouped by order, oldest first, wait-time counter, "Erledigt" per item → PATCH item status. Live updates via WebSocket — no refresh.

**TDD Steps:**
1. Test: renders open orders sorted oldest-first with table/pickup identifier
2. Test: new order appears without reload (mock socket event)
3. Test: mark item done → status PATCH → item leaves list
4. Commit: `feat: live station order display`

---

### Task 4.3: Station display — product view

**Objective:** Aggregation toggle: per-product totals across open orders with table numbers (batch prep view, wiki §7).

**TDD:** products with total quantities; per-table breakdown. Commit: `feat: station product aggregation view`

---

### Task 4.4: ESC/POS receipt formatting

**Objective:** `printerService.formatReceipt(order, station, printer)` → ESC/POS buffer: station header, table/pickup + tear-off number, items with quantities/comments, total (unless event.hidePrices), TEST watermark when event.status=test, chars-per-line wrap, paper cut command.

**Files:** Create `server/src/printer/escpos.ts`, `server/tests/unit/escpos.test.ts`. Library: `node-thermal-printer` (per risk table).
**TDD Steps:**
1. Test: buffer contains table number, item lines, total
2. Test: station name as header; long product names wrap at charsPerLine
3. Test: test-mode event → "TEST" line present; hidePrices → no prices
4. Commit: `feat: ESC/POS receipt formatting`

---

### Task 4.5: Print dispatch on order creation

**Objective:** Post-commit hook in orderService: group items by station → per station, resolve printer (alt-printer rules by table range/pickup code → primary) → send. `ignore` → skip; `dummy` → log to file; network → TCP 9100. Print failure never fails the order; failed jobs logged (retry queue is Phase 7 hardening).

**TDD Steps:**
1. Test: drinks order → job to bar printer only
2. Test: mixed order → jobs to bar + kitchen, each with only its items
3. Test: alt printer for table range receives the job instead of primary
4. Test: dummy printer logs; network failure swallowed + logged, order still 201
5. Commit: `feat: automatic station receipt printing`

---

### Task 4.6: Printer test-print endpoint (real)

**Objective:** `POST /api/printers/:id/test` prints a test page (replaces Task 2.2 stub): printer name, font, chars-per-line ruler, cut.

**TDD:** dummy → 200 with logged payload; unreachable network printer → 502 with error. Commit: `feat: printer test print`

---

## Phase 5: Admin & Configuration

### Task 5.1: Admin layout + navigation

Sidebar: Veranstaltungen, Kellner, Stationen, Produkte, Drucker, Export. Admin PIN gate (env `ADMIN_PIN`, JWT admin claim). Commit: `feat: admin layout and navigation`

### Task 5.2: Admin — event management

List with test/live badges, create form, test→live toggle with wipe warning dialog. Commit: `feat: admin event management`

### Task 5.3: Admin — stations + products

Station CRUD with printer assignment + kitchen-monitor toggle; product CRUD per station with price-in-cents input (€ display), sortOrder, availability. Commit: `feat: admin station and product management`

### Task 5.4: Admin — waiters + printers

Waiter CRUD with PIN set/reset, permission checkboxes, pickup code; printer CRUD with test-print button. Commit: `feat: admin waiter and printer management`

### Task 5.5: Configuration export/import

`GET /api/events/:id/export` → JSON (stations, products, waiters sans pins, printers, layouts). `POST /api/events/import` → creates event from JSON. Round-trip test: export→import→export is idempotent. Commit: `feat: configuration export/import`

---

## Phase 6: Advanced Features

### Task 6.1: Voucher system

Voucher products + Bonkasse flow: sell vouchers (prints tear-off), redeem by code (status active→redeemed, links order). Uses Task 2.4 entity. Commit: `feat: voucher system`

### Task 6.2: Stock management

Tracked stock decrement on order (already hooked in 1.7.4 service — enable checks), composite expansion via ProductComponent, stock=0 → unavailable, app-side stock adjustment. Commit: `feat: stock management`

### Task 6.3: Settlement and reporting

Per-waiter cash summary (expected cash incl. unpaid), per-event per-station revenue, CSV export. Commit: `feat: settlement and reporting`

### Task 6.4: QR code table ordering

`qrcode` lib: per-table PNG endpoint; guest page `#/guest/:eventId/:tableToken` (unguessable token per table) → order with `status: pending` → waiter confirms → normal flow. Commit: `feat: QR guest ordering`

### Task 6.5: Kitchen monitor — full-screen order view

Big-type wall display variant of station display with wait-time sorting and click-to-complete. Commit: `feat: kitchen monitor view`

### Task 6.6: App layout customization

Admin grid editor (columns×rows, color, product mapping) → waiter app renders saved layout. Commit: `feat: customizable app layout`

### Task 6.7: Waiter permissions + transfers

Enforce canCancel/canCashOut/canTransfer in services; order transfer between waiters; Sammelbon collective receipts (uses reserved `sammelbonId`). Commit: `feat: waiter permissions, transfers, collective receipts`

---

## Phase 7: Polish

### Task 7.1: Offline order queue

IndexedDB queue with client-generated idempotency keys (unique on Order), background sync on reconnect, conflict-free retry. Commit: `feat: offline order queue with sync`

### Task 7.2: Print retry queue

Failed print jobs persisted (table or file queue), retried with backoff, admin visibility. Commit: `feat: print job retry queue`

### Task 7.3: i18n completion

Audit: no hardcoded strings (test), de complete, en+fr complete, language switcher. Commit: `feat: i18n completion de/en/fr`

### Task 7.4: Docker deployment

Multi-stage Dockerfile (build client → production server serving static), docker-compose with SQLite volume, ARM variant documented for Raspberry Pi. Verify `docker compose up` → healthy. Commit: `feat: Docker deployment`

### Task 7.5: Documentation

README: architecture diagram (from docs/ARCHITECTURE.md), dev setup, deployment (Docker + RPi), contributor guide. Keep ARCHITECTURE.md in sync. Commit: `docs: README and setup guides`

---

## Validation

After each phase:
```bash
npm run typecheck && npm test && npm run build   # local CI (pre-commit runs this too)
npm run test:e2e                                  # with dev servers running
npm run dev                                       # manual smoke:
# 1. Seed: npx prisma db seed (server/)
# 2. http://localhost:5173 → login as Alice/1234
# 3. Take order → appears live on station display (#/station/:id)
# 4. Receipt printed (dummy printer log)
# 5. Mark items done → disappears from station view
```

---

## Risks and Tradeoffs

| Risk | Mitigation |
|------|------------|
| Money rounding | **Resolved:** integer cents (Task 1.7.2) |
| PIN leaks | **Resolved in plan:** Task 1.7.3 pin secrecy + auth |
| Missing products CRUD | **Resolved in plan:** Task 1.7.1 |
| Tear-off race condition | Prisma transaction with atomic increment (Task 1.7.5) |
| ESC/POS library compatibility | node-thermal-printer; test with Epson TM-T20; dummy driver for dev |
| Real-time on flaky WiFi | Socket.io reconnects; offline queue (7.1); optimistic UI |
| SQLite concurrency (20+ waiters) | WAL mode; single-writer is fine at this scale; stress test in Phase 4 |
| PWA offline complexity | Online-only until Phase 7; idempotency keys make sync safe |
| QR guest-order abuse | Unguessable per-table tokens; waiter confirmation gate |
| Scope creep (TSE, floor plan, multi-tenant) | Explicit non-goals in ARCHITECTURE.md §10 |

## Open Questions

1. ~~Frontend framework~~ — **React** ✅
2. ~~State management~~ — **zustand** ✅
3. ~~ORM~~ — **Prisma** ✅
4. ~~Test framework~~ — **Vitest** ✅
5. ~~License~~ — **GPL-3.0** ✅
6. ~~Monetary representation~~ — **integer cents** ✅ (Task 1.7.2)
7. **Admin auth model** — single env `ADMIN_PIN` sufficient for v1? (assumed yes; multi-user admin deferred with Veranstalter entity)
8. **Guest QR ordering payment** — confirm-then-pay-at-table assumed; no cashless integration in v1
