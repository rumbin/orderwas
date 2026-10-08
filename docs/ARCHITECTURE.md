# Orderwas — Architecture

**Status:** Living document. Update when module boundaries, data flow, or deployment topology change.
**Last updated:** 2026-09-12 (Theke counter mode)

---

## 1. System Overview

Orderwas is an open-source ordering and receipt-printing system for club festivals (Vereinsfeste). It is a **Bestellsystem/Boniersystem**, explicitly **not a cash register** (no TSE fiscal compliance in v1 — see §10 Non-Goals).

**Deployment unit:** a single server (Raspberry Pi or any Linux/Docker host) on a dedicated festival WiFi/LAN. No internet required during operation.

```
┌──────────────────────────── FESTIVAL LAN ───────────────────────────┐
│                                                                     │
│   Waiter phones (PWA)     Station displays (PWA)    Admin laptop    │
│        │                       │                        │           │
│        └───────────┬───────────┴──────────┬─────────────┘           │
│                    │ HTTP / WebSocket     │                         │
│            ┌───────▼──────────────────────▼───────┐                 │
│            │         Orderwas Server              │                 │
│            │  Fastify (REST) + Socket.io (WS)     │                 │
│            │  ┌────────────────────────────────┐  │                 │
│            │  │ Services (business logic)      │  │                 │
│            │  │  order · event · product ·     │  │                 │
│            │  │  printer · voucher · stock     │  │                 │
│            │  └────────────────────────────────┘  │                 │
│            │  Prisma ORM ──► SQLite (WAL mode)    │                 │
│            └───────┬──────────────────────────────┘                 │
│                    │ TCP 9100 (ESC/POS)                             │
│        ┌───────────┼───────────┐                                    │
│        ▼           ▼           ▼                                    │
│   Bar printer  Kitchen printer  Dummy/log printer                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Repository Layout

```
orderwas/
├── server/                  # Backend — Node.js 20+, TypeScript, Fastify 5
│   ├── src/
│   │   ├── index.ts         # buildServer() + main() entry
│   │   ├── routes/          # HTTP layer ONLY: parse (Zod) → call service → respond
│   │   ├── services/        # ALL business logic; unit-testable without HTTP
│   │   ├── printer/         # ESC/POS formatting + network transport + dummy driver
│   │   ├── websocket/       # Socket.io setup, room management, event emission
│   │   ├── plugins/         # Fastify plugins (cors, auth)
│   │   └── db/client.ts     # Prisma client singleton
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts          # Dev seed data
│   └── tests/{unit,integration,helpers}
├── client/                  # Frontend — React 18, Vite 5, Tailwind, PWA
│   ├── src/
│   │   ├── api/             # fetch client + shared types (mirror of API shapes)
│   │   ├── stores/          # zustand: session, cart
│   │   ├── pages/           # route-level screens
│   │   ├── components/      # reusable UI
│   │   ├── hooks/
│   │   └── i18n/            # de.json (primary), en.json, fr.json
│   └── tests/
├── e2e/                     # Playwright smoke + flows
├── docker/                  # Dockerfile, docker-compose.yml
├── scripts/                 # pre-commit hook, install-hooks.sh
└── docs/                    # REQUIREMENTS, DESIGN-DECISIONS, ARCHITECTURE (this file)
```

---

## 3. Layering Rules (binding)

1. **Routes are thin.** A route handler does exactly three things: validate input with Zod, call one service method, map the result/error to an HTTP response. No Prisma calls in routes. *Exception (verified after Phase 0):* `server/src/routes/qr.ts` — the QR-*generation* GETs (`GET /api/events/:id/qr/:tableNumber`, `GET /api/events/:id/qr-all`) still query Prisma directly to verify the event and list table numbers. The guest-order POST path (`POST /api/guest/orders`) does **not** — it delegates to `services/guestOrderService.ts`. This is the single documented deviation; all other route files are Prisma-free.
2. **Services own business logic.** Order total calculation, tear-off number assignment, stock decrement, print dispatch, WebSocket emission, test→live data wipe. Services are plain async functions taking Prisma client (or a tx) as an argument — unit-testable without Fastify.
3. **Side effects fan out from services, not routes.** Creating an order in `orderService.create()` triggers, in one transaction + post-commit hooks: persist → assign tear-off → decrement stock → dispatch print jobs → emit `order:created`.
4. **The client never receives secrets.** Waiter `pin` is write-only: accepted on create/update, verified by `/api/auth/login`, never selected into any response.

---

## 4. Data Model

SQLite via Prisma. **Money is integer cents everywhere** (`priceCents`, `totalCents`) — the only rounding-safe representation on SQLite REAL-free integer storage; maps cleanly to Postgres `Integer`/`Numeric` later. API exposes cents; the client formats (`(cents/100).toFixed(2)` + locale).

> Full schema is the source of truth: `server/prisma/schema.prisma`. This section documents the *design intent* per entity.

### Core hierarchy
- **Event** — one festival. `status: test|live`. Switching test→live **deletes all orders** (wiki §14 business rule, enforced in `eventService`). Owns `lastTearOffNumber` counter. `hidePrices`, `tseEnabled` (reserved, v2). `counterEnabled` gates the Theke counter (see *Counter mode* below).
- **Station** — prep point (Bar, Küche, Kaffee). `kitchenMonitor` toggle, `copyPrint`, sortOrder. FK to primary **Printer**; **alternative printers** via join table with optional table-range/pickup-code routing (Phase 3).
- **Product** — `priceCents Int`, `taxRateBps` (basis points, e.g. 2000 = 20.00%), `stockMode: none|tracked|composite`, `stockCount Float` (Float allows 0.5L beer; it is a stock quantity, not money), `isVoucher`, `addable`, `shortName` (for receipts).
- **ProductComponent** *(new)* — join table for composite products: `compositeId → ingredientId, quantity Decimal`. Required for Task 34 stock management; without it `stockMode: composite` is meaningless.
- **Waiter** — `pin` (write-only), permission flags (canCancel, canCashOut, canStatistics, canCreateWaiters, canTransfer, isStationWaiter), `printsImmediately`, `autoSammelbon`, `hidden`, optional own Printer, optional `pickupCode` (Abholkennzeichen: when set, orders skip table number and get auto tear-off numbers — Bonkasse/Abholscheine mode). `isCounter` marks the Theke counter login (see *Counter mode* below).
- **Printer** *(new, first-class)* — `name`, `type: network|ignore|dummy`, `ip`, `charsPerLine`, `font`, `buzzer`, `paperCut: full|partial|none`. Replaces the flat `printerIp`/`printerType` strings on Station/Waiter (those columns migrate to FKs).
- **Order** — `tableNumber String?` (nullable: pickup orders use `pickupCode` instead, counter orders use neither — see *Counter mode*), `status: open|preparing|partial|paid|cancelled`, `totalCents Int`, `tearOffNumber Int?` (atomic per-event increment; for counter orders it is the **Bon number**, optionally pinned by the counter), `pickupCode String?`, `sammelbonId String?` (reserved for collective receipts, Phase 6).
- **OrderItem** — quantity, `status: open|prepared|delivered|cancelled`, free-text `comment`, plus `options` JSON (`[{extraName, optionName, priceDeltaCents}]`) for **structured product `ProductExtra` option groups** (radio/checkbox, optional price deltas — §17.4 of REQUIREMENTS). `paidAt` + `paidByWaiterId` stamp payment per item.
- **Voucher** *(new)* — `code` (unique per event), `valueCents Int`, `status: active|redeemed|expired`, `redeemedOrderId?`. Backs Task 33.
- **AppLayout** — per event (real FK to **Event**, `onDelete: Cascade`), optionally per waiter: columns, rows, `buttons` JSON `[{name, color, productId, row, col}]`.

### Hot-path indexes (added Phase 5)

The read/write paths that dominate at festival scale are indexed in `server/prisma/schema.prisma`: `Order(eventId, status)`, `Order(waiterId)`, `Order(tableNumber)`, `OrderItem(orderId)`, `OrderItem(paidAt)`, `OrderItem(productId)`, `Product(stationId)`, `Voucher(eventId, code)` (unique) + `Voucher(eventId)`, `AppLayout(eventId)`, `AuditLog(eventId, action)`, `AuditLog(eventId, entityType, entityId)`, `AuditLog(createdAt)`. `stockCount` is `Float` (a stock quantity, not money); all monetary columns remain integer cents.

### Payment lifecycle (unified `paid` ⇔ all items paid)

Order-level and item-level payment are unified by a single invariant: **an order is `paid` iff every non-cancelled item carries a `paidAt` stamp.**

- **Order-level pay** — `POST /api/orders/:id/pay` (requires `canCashOut`): `orderService.markPaid` stamps `paidAt`/`paidByWaiterId` on **all** non-cancelled items of the order in one transaction and flips the order to `paid`. A paid order therefore always has all items paid.
- **Item-level pay** — `POST /api/orders/pay-items` (requires `canCashOut`): `paymentService.payItems` batch-pays a set of items. It is **race-safe** (the conditional `updateMany(… where paidAt: null)` only matches still-unpaid rows, so a concurrent double-pay of the same item fails with 409) and enforces **event ownership** from the JWT `eventId` (an item of another event → 403; cancelled/already-paid item → 409). When the last unpaid non-cancelled item of an order is paid, the order recomputes to `paid`.
- **Reopen** — `POST /api/orders/:id/reopen` (requires `canCashOut`): clears item-level `paidAt`/`paidByWaiterId` and returns the order to `open`.

Terminal statuses are reachable **only** through these dedicated endpoints — the generic `PATCH /api/orders/:id` accepts only the preparation statuses `['open','preparing','partial','done']`.

### Counter (Theke) mode

An event can also sell **over the counter** instead of at tables. The counter is a
*login identity*, not a separate module: `Event.counterEnabled` gates it, and toggling it
creates (or revives/hides/deletes) the `Theke` waiter — `Waiter.isCounter`,
`canCashOut`, `canCancel` — via `eventService.syncCounterWaiter`. Everything else (auth,
cart, product grid, print dispatch, item-level payment) is the ordinary waiter flow.

- **The Bon *is* the tear-off number.** A counter order carries **neither**
  `tableNumber` nor `pickupCode`; its identifier is `tearOffNumber`, printed as
  `Bon: <n>` instead of `Tisch:`/`Abholcode:` (same receipt otherwise). The counter UI
  pre-fills the next number and may overwrite it with the ticket torn off at the Theke:
  the server requires a positive integer, rejects a number already in use (409) and
  advances `lastTearOffNumber` to at least that value so the next pre-fill moves on.
- **Only the counter may sell table-less orders**, and only it may set `tearOffNumber`;
  a regular waiter sending either is rejected (400). `tableNumber` and `pickupCode` stay
  mutually exclusive.
- **One Bon at a time.** A new counter order is refused (409) while that counter still
  has an unpaid item, so "cash out before the next Bon" is a server invariant rather than
  just a disabled button. A fully paid *or cancelled* Bon frees the counter again.
- **Cashier screen.** `GET /api/events/:eventId/counter/unpaid` returns the single open
  counter order (0 or 1) — the counter cashier has no table/Bon selection. When the last
  unpaid item is settled, the UI returns to order taking with the next Bon pre-filled.

### Deferred entities (documented non-goals for v1)
- **Veranstalter / User** (multi-organizer, system users) — v1 is single-organizer, single-event-lifecycle. Config export/import covers reuse. Revisit when multi-tenancy is requested.
- **TSE fiscal module** — see §10.

---

## 5. Request Lifecycle — Order Creation (the critical path)

```
POST /api/orders
  → Zod parse (items non-empty; at most one of tableNumber/pickupCode — neither ⇒ this is
     a counter order, validated in the service against the waiter)
  → orderService.create(tx):
      1. validate waiter/event/products exist & available
      2. stock check (tracked: count ≥ qty; composite: expand components)
      3. totalCents = Σ priceCents × qty          (integer math)
      4. tearOffNumber = atomic event counter++    (in-transaction increment)
      5. persist Order + OrderItems
      6. decrement stock
    commit
  → post-commit (async, failure-isolated):
      7. printerService.dispatch(order) — group items by station,
         format ESC/POS per station printer, send (dummy → log)
      8. ws.emit('order:created', order) to event room
  → 201 { order }
```

Failure rules: print failure never fails the order (jobs queue, retry); WebSocket failure is silent; stock oversell fails the order with 409.

---

## 6. Real-Time

Socket.io, one namespace, rooms keyed `event:{eventId}` and `station:{stationId}`. Events: `order:created`, `order:updated`, `orderItem:status`, `product:availability`. The station display subscribes to its station room; waiter overview to the event room. **WebSocket is part of the station-display phase, not a later phase** — a kitchen monitor without live updates is a page-refresh simulator and fails the requirements (§5.3.1, Phase-1 roadmap item "real-time shared overview").

---

## 7. Offline Strategy

- **Server-side:** SQLite in WAL mode; single-writer is fine at festival scale (20 waiters). Nightly-per-event backup = copy the db file.
- **Client-side (Phase 7):** PWA service worker caches app shell; orders taken during WiFi drops queue in IndexedDB with idempotency keys (client-generated UUID per order) and sync on reconnect. Server treats the idempotency key as unique to make retries safe.

---

## 8. Security / Auth

### Login & tokens

`POST /api/auth/login {waiterId, pin}` verifies the active waiter's PIN and returns a JWT carrying event-scoped claims `{ waiterId, eventId, permissions { canCancel, canCashOut, canStatistics, canCreateWaiters, canTransfer, isStationWaiter } }` (24h). `POST /api/auth/admin/login {pin}` verifies a single admin PIN (DB setting → env → default) and returns an `{ admin: true }` JWT (8h). Waiter `pin` is write-only — accepted at login, never selected into any response. `GET /api/auth/me` returns the current waiter from the JWT.

### Enforcement (global guard)

`server/src/plugins/auth.ts` installs a global `onRequest` guard. When `AUTH_ENFORCED=true` **or** `NODE_ENV=production`, every `/api/*` request must present a valid JWT **except**:

- the public allowlist (`PUBLIC_PATHS`): `POST /api/auth/login`, `POST /api/auth/admin/login`, `POST /api/guest/orders`;
- the pre-login GET reads the Landing/Login/Guest flows need — `/api/events`, `/api/events/:id`, `/api/events/:id/stations`, `/api/events/:id/waiters`, `/api/stations/:id/products` (id + name config only);
- `/health`.

A valid JWT alone is enough for reads; writes/mutations are gated per-route by permission (below). The WebSocket endpoint (`server/src/websocket/index.ts`) enforces the **same opt-in**: under `AUTH_ENFORCED`/production, a connection must present a valid JWT via `handshake.auth.token` or it is refused.

**Fail-fast:** the server refuses to boot in production without `JWT_SECRET` set — it never runs with the hardcoded dev secret.

### Endpoint → permission matrix

Per-route `preHandler`s add permission granularity on top of the global guard (401 without a token, 403 without the permission):

| Guard | Endpoints (method + path) |
|-------|---------------------------|
| **Public / pre-login reads** | `POST /auth/login`, `POST /auth/admin/login`, `POST /guest/orders`; `GET /events`, `GET /events/:id`, `GET /events/:id/stations`, `GET /events/:id/waiters`, `GET /stations/:id/products`; `GET /health` |
| **Any valid JWT (no permission gate)** | open `/api/*` GET reads (orders, events, stations, waiters, products, printers, vouchers, layouts, tables, counter, audit-free reads) and plain `authenticate` writes: `PATCH /orders/:id`, `PATCH /order-items/:id`, `POST /vouchers/redeem`, `POST/PUT/DELETE /events/:eventId/layouts`, `PUT /layouts/:id`, `GET /auth/me` |
| **`canCancel`** | `POST /orders/:id/cancel`, `POST /order-items/:id/cancel` |
| **`canCashOut`** | `POST /orders/:id/pay`, `POST /orders/:id/reopen`, `POST /orders/pay-items` |
| **`canTransfer`** | `PATCH /orders/:id/transfer` |
| **`canStatistics`** | `GET /events/:eventId/audit`, `GET /events/:eventId/audit/stock/:productId`, `GET /events/:eventId/report/peak-times`, `GET /events/:eventId/report/station-revenue`, `GET /events/:eventId/report/waiters`, `GET /events/:eventId/report/products` |
| **`requireAdmin`** (`{ admin: true }`) | event/station/waiter/product/printer/voucher **create/update/delete**, `PATCH /products/reorder`, `PATCH /stations/reorder`, `PATCH /products/:id/stock`, `POST /products/:id/extras`, `DELETE /extras/:id`, `POST /products/:id/settle`, `POST /events/:eventId/settle`, `GET /events/:eventId/export`, `POST /events/import`, `PUT /auth/admin/pin`, `POST /vouchers/bulk`, `POST /events/:eventId/vouchers/:code/expire`, `POST /printers/:id/test` |

---

## 9. Deployment

Docker multi-stage: build client → serve static from Fastify (`@fastify/static`) → single container, single port. `docker-compose` adds only a named volume for the SQLite file. Raspberry Pi = same image, ARM build. Dev: `npm run dev` (Vite proxy → Fastify :3000).

---

## 10. Non-Goals (v1, explicit)

| Non-goal | Why | Revisit |
|----------|-----|---------|
| TSE fiscal compliance | Orderwas is not a Registrierkasse; huge scope | if German users demand it |
| Multi-organizer / multi-tenant | single-event lifecycle | on request |
| Floor plan editor | Bierblock nice-to-have | Phase 6+ |
| Cashless payment integration | out of scope | — |
| Bluetooth printers | network printers only | on hardware demand |

---

## 11. Tech Decisions (final)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language/runtime | Node.js 20 + TypeScript strict | one language across stack |
| HTTP framework | Fastify 5 | fast, schema-friendly, plugin model |
| ORM | Prisma 5 | type-safe, SQLite→Postgres swap path |
| Money | **integer cents (Int)** | rounding-safe on SQLite |
| Frontend | React 18 + Vite 5 + Tailwind | ecosystem, PWA tooling |
| State | zustand | minimal, sufficient |
| Real-time | Socket.io | rooms, reconnects, fallback transports |
| Tests | Vitest + Playwright | Vite-native, fast |
| i18n | react-i18next, German-first | de/en/fr JSON |
| License | GPL-3.0 | copyleft, simple |
| CI | local-only: typecheck + unit + build + E2E + pre-commit hooks | no cloud CI by user requirement |
