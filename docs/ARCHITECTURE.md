# Orderwas — Architecture

**Status:** Living document. Update when module boundaries, data flow, or deployment topology change.
**Last updated:** 2026-08-14 (architecture review, model kimi-k3)

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

1. **Routes are thin.** A route handler does exactly three things: validate input with Zod, call one service method, map the result/error to an HTTP response. No Prisma calls in routes.
2. **Services own business logic.** Order total calculation, tear-off number assignment, stock decrement, print dispatch, WebSocket emission, test→live data wipe. Services are plain async functions taking Prisma client (or a tx) as an argument — unit-testable without Fastify.
3. **Side effects fan out from services, not routes.** Creating an order in `orderService.create()` triggers, in one transaction + post-commit hooks: persist → assign tear-off → decrement stock → dispatch print jobs → emit `order:created`.
4. **The client never receives secrets.** Waiter `pin` is write-only: accepted on create/update, verified by `/api/auth/login`, never selected into any response.

---

## 4. Data Model

SQLite via Prisma. **Money is integer cents everywhere** (`priceCents`, `totalCents`) — the only rounding-safe representation on SQLite REAL-free integer storage; maps cleanly to Postgres `Integer`/`Numeric` later. API exposes cents; the client formats (`(cents/100).toFixed(2)` + locale).

> Full schema is the source of truth: `server/prisma/schema.prisma`. This section documents the *design intent* per entity.

### Core hierarchy
- **Event** — one festival. `status: test|live`. Switching test→live **deletes all orders** (wiki §14 business rule, enforced in `eventService`). Owns `lastTearOffNumber` counter. `hidePrices`, `tseEnabled` (reserved, v2).
- **Station** — prep point (Bar, Küche, Kaffee). `kitchenMonitor` toggle, `copyPrint`, sortOrder. FK to primary **Printer**; **alternative printers** via join table with optional table-range/pickup-code routing (Phase 3).
- **Product** — `priceCents Int`, `taxRate` (stored as basis points, e.g. 2000 = 20.00%), `stockMode: none|tracked|composite`, `stockCount Decimal` (decimal allowed: 0.5L beer), `isVoucher`, `addable`, `shortName` (for receipts).
- **ProductComponent** *(new)* — join table for composite products: `compositeId → ingredientId, quantity Decimal`. Required for Task 34 stock management; without it `stockMode: composite` is meaningless.
- **Waiter** — `pin` (write-only), permission flags (canCancel, canCashOut, canStatistics, canCreateWaiters, canTransfer, isStationWaiter), `printsImmediately`, `autoSammelbon`, `hidden`, optional own Printer, optional `pickupCode` (Abholkennzeichen: when set, orders skip table number and get auto tear-off numbers — Bonkasse/Abholscheine mode).
- **Printer** *(new, first-class)* — `name`, `type: network|ignore|dummy`, `ip`, `charsPerLine`, `font`, `buzzer`, `paperCut: full|partial|none`. Replaces the flat `printerIp`/`printerType` strings on Station/Waiter (those columns migrate to FKs).
- **Order** — `tableNumber String?` (nullable: pickup orders use `pickupCode` instead), `status: open|preparing|partial|paid|cancelled`, `totalCents Int`, `tearOffNumber Int?` (atomic per-event increment), `pickupCode String?`, `sammelbonId String?` (reserved for collective receipts, Phase 6).
- **OrderItem** — quantity, `status: open|prepared|delivered|cancelled`, free-text `comment` for extras (deliberate simplification: extras are free text in v1, not structured option sets).
- **Voucher** *(new)* — `code` (unique per event), `valueCents Int`, `status: active|redeemed|expired`, `redeemedOrderId?`. Backs Task 33.
- **AppLayout** — per event, optionally per waiter: columns, rows, `buttons` JSON `[{name, color, productId, row, col}]`.

### Deferred entities (documented non-goals for v1)
- **Veranstalter / User** (multi-organizer, system users) — v1 is single-organizer, single-event-lifecycle. Config export/import covers reuse. Revisit when multi-tenancy is requested.
- **Structured extras/options** — free-text comments suffice for MVP.
- **TSE fiscal module** — see §10.

---

## 5. Request Lifecycle — Order Creation (the critical path)

```
POST /api/orders
  → Zod parse (items non-empty, tableNumber XOR pickupCode)
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

## 8. Auth

`POST /api/auth/login {eventId, waiterId, pin}` → verifies pin → returns JWT (24h, event-scoped claims: waiterId, eventId, permission flags). Fastify `onRequest` hook guards all `/api/*` except `/health`, `/api/auth/login`, and the guest QR ordering endpoint (token in URL instead). Admin routes get an `admin` claim — v1: a single admin PIN in env config.

---

## 9. Deployment

Docker multi-stage: build client → serve static from Fastify (`@fastify/static`) → single container, single port. `docker-compose` adds only a named volume for the SQLite file. Raspberry Pi = same image, ARM build. Dev: `npm run dev` (Vite proxy → Fastify :3000).

---

## 10. Non-Goals (v1, explicit)

| Non-goal | Why | Revisit |
|----------|-----|---------|
| TSE fiscal compliance | Orderwas is not a Registrierkasse; huge scope | if German users demand it |
| Multi-organizer / multi-tenant | single-event lifecycle | on request |
| Structured product extras | free text suffices | Phase 6+ |
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
