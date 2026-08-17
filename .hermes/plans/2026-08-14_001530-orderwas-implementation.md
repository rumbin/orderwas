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
- **2026-08-14 (v2–v3):** Deep requirements re-review, data model corrections, phase restructuring.
- **2026-08-17 (v4):** Full audit — Phases 0–6 complete. Plan updated to reflect actual status. Phase 7 becomes the active phase.

---

## Phase Overview

| Phase | Name | Status |
|-------|------|--------|
| 0 | Project Bootstrap | ✅ done |
| 1 | Backend Core — Tracer Bullet | ✅ done |
| 1.5 | Local CI Pipeline | ✅ done |
| 1.7 | Backend Foundation Gaps | ✅ done |
| 2 | Data Model Completion | ✅ done |
| 3 | Frontend Core — Order Taking | ✅ done |
| 4 | Station Display + Real-Time + Printers | ✅ done |
| 5 | Admin & Configuration | ✅ done |
| 6 | Order Flow Completion & Lifecycle | ✅ done |
| **7** | **Advanced Features** | **⬅ NEXT** |
| 8 | Polish | ⬜ |

---

## Phase 0: Project Bootstrap ✅ DONE

Monorepo with npm workspaces, Fastify+TS+Prisma+Vitest backend, React+Vite+Tailwind+Vitest frontend, GPL-3.0 LICENSE.

---

## Phase 1: Backend Core — Tracer Bullet ✅ DONE

Prisma schema (all entities), CRUD routes for events/stations/waiters/orders/products, 155 integration tests passing.

---

## Phase 1.5: Local CI Pipeline ✅ DONE

Root `typecheck`/`ci` scripts, build verification, Playwright smoke E2E, pre-commit hooks.

---

## Phase 1.7: Backend Foundation Gaps ✅ DONE

- Products CRUD route with Zod validation
- Integer cents for all money (priceCents, totalCents, taxRateBps)
- Auth: JWT login endpoint, pin secrecy, authenticate plugin
- Service layer: all business logic in `server/src/services/`
- Tear-off number auto-increment (atomic per-event)
- Seed data script (Testfest event with stations, products, waiters)

---

## Phase 2: Data Model Completion ✅ DONE

- Printer entity with station/waiter FKs, alternative printers per table range
- Printer CRUD routes + test-print endpoint
- ProductComponent for composite products
- Voucher entity
- Pickup codes + nullable tableNumber
- Event test→live wipe
- Client types synced

---

## Phase 3: Frontend Core — Order Taking ✅ DONE

- Hash-based routing shell (#/ login, #/order, #/orders, #/admin, #/station/:id)
- Waiter login page (event → waiter → PIN → token)
- Order page with product grid, cart, submit, extras picker, comments
- Waiter order overview with status badges, pay/cancel/reopen
- Dev admin setup page
- PWA manifest + service worker
- Client served from Fastify

---

## Phase 4: Station Display + Real-Time + Printers ✅ DONE

- WebSocket server (Socket.io, event bus, rooms)
- Station display: order view (live, wait-time counter, mark done)
- Station display: product aggregation view
- ESC/POS receipt formatting (20 unit tests)
- Print dispatch on order creation (dummy + network printers)

---

## Phase 5: Admin & Configuration ✅ DONE

- Admin layout with responsive sidebar (collapsible on mobile)
- Event management (CRUD, test/live toggle)
- Station management (CRUD, printer assignment, kitchen monitor toggle)
- Product management (CRUD per station, availability toggle, delete with confirmation)
- Waiter management (CRUD, permissions, pickup codes)
- Printer management (CRUD, test-print)
- Configuration export/import (JSON round-trip)

---

## Phase 6: Order Flow Completion & Lifecycle ✅ DONE

- Order item comments (free text, per-item editing)
- Station display: per-item status transitions + WebSocket live updates
- Order cancel + item cancel with permission gate (canCancel)
- Landing page with role navigation tiles
- New order after submission (tear-off confirmation, flow loop)
- Structured extras (Auswahl) — product option groups with price deltas
- Full order lifecycle E2E suite (Playwright)
- Waiter order actions — pay & reopen

---

## Phase 7: Advanced Features ⬜ NEXT

> **Goal:** Complete the remaining Orderjutsu parity features that elevate Orderwas from a working prototype to a production-ready festival system.

### Task 7.1: Stock management (Lagerstände)

**Objective:** Per-product stock tracking with decrement on order, composite product expansion, stock warnings, app-side adjustment.

**Schema already exists:** `Product.stockMode` (none/tracked/composite), `Product.stockCount`, `ProductComponent` entity.

**Backend:**
- `stockService.ts`: decrement on order creation (tracked mode), expand composites, check availability
- `GET /api/stations/:stationId/products` → include `stockCount` (already does)
- `PATCH /api/products/:id/stock` → manual adjustment endpoint (for app-side)
- Integration with `orderService.createOrder`: before persist, check stock; decrement atomically in transaction; reject if insufficient (409)

**Frontend:**
- Order page: out-of-stock products dimmed/disabled (already filters `available`, extend to check stock)
- Admin products: show stock count, manual adjustment button

**TDD:**
1. API: create order with tracked product → stockCount decremented
2. API: create order exceeding stock → 409
3. API: composite product order → ingredient stocks decremented
4. API: manual stock adjustment → count updated

**Commit:** `feat: stock management with decrement and composite expansion`

---

### Task 7.2: Settlement and reporting (Abrechnung)

**Objective:** Per-waiter cash summary, per-event per-station revenue, Excel/CSV export.

**Backend:**
- `GET /api/waiters/:id/settlement` → expected cash (sum of open/partial orders + paid orders for this waiter)
- `GET /api/events/:id/report` → per-station revenue, per-waiter totals, product consumption
- `GET /api/events/:id/export/csv` → CSV export of all orders

**Frontend:**
- Admin: "Abrechnung" tab with settlement view
- Waiter: settlement badge on orders page showing expected cash

**TDD:**
1. API: settlement includes unpaid open orders in total
2. API: report groups by station correctly
3. API: CSV export includes all order fields

**Commit:** `feat: settlement and reporting`

---

### Task 7.3: Voucher system completion (Gutscheine/Bonkasse)

**Objective:** Complete voucher redemption flow. Schema exists (`Voucher` entity); need the runtime.

**Backend:**
- `POST /api/vouchers` → create voucher (code, valueCents, eventId)
- `POST /api/vouchers/:code/redeem` → redeem against an order (status active→redeemed)
- `GET /api/events/:eventId/vouchers` → list with status filter
- Integration: voucher products in order creation deduct voucher value from total

**Frontend:**
- Admin: voucher management (create, list, mass-generate)
- Order page: voucher code input field → validate → apply discount

**Commit:** `feat: voucher system completion`

---

### Task 7.4: QR code table ordering

**Objective:** Guests scan QR code per table → mobile ordering page → order submitted with auto-detected table.

**Backend:**
- `GET /api/events/:eventId/qr/:tableToken` → PNG QR code
- `POST /api/guest/orders` → public order endpoint (no auth, table auto-detected from token)

**Frontend:**
- `#/guest/:eventId/:tableToken` page → product grid → submit → confirmation
- Token per table (unguessable, stored in Event config or generated)

**Commit:** `feat: QR code table ordering`

---

### Task 7.5: Kitchen monitor — dedicated full-screen view

**Objective:** Wall-display variant of station display optimized for large screens.

**Frontend:**
- `#/station/:id/monitor` → full-screen order view, no navigation chrome, auto-refresh, big type
- Wait-time color coding (green → yellow → red)
- Click to complete

**Commit:** `feat: kitchen monitor full-screen view`

---

### Task 7.6: App layout customization

**Objective:** Admin defines button grid per event/waiter; waiter app renders saved layout.

**Backend:**
- `AppLayout` entity exists; CRUD: `PUT /api/events/:eventId/layout` → save grid config
- `GET /api/waiters/:id/layout` → waiter-specific layout (falls back to event default)

**Frontend:**
- Admin: grid editor (columns × rows, color picker, product assignment)
- Order page: render products per saved layout instead of default grid

**Commit:** `feat: customizable app layout`

---

### Task 7.7: Waiter permissions + order transfers

**Objective:** Enforce all waiter permission flags; order transfer between waiters; Sammelbon collective receipts.

**Backend:**
- Permission middleware using JWT claims (canCancel, canCashOut, etc.)
- `POST /api/orders/:id/transfer` → reassign to different waiter
- `sammelbonId` grouping logic

**Frontend:**
- Admin: permission checkboxes (already exists, need enforcement)
- Order page: transfer button (if canTransfer)

**Commit:** `feat: waiter permissions, transfers, collective receipts`

---

## Phase 8: Polish

### Task 8.1: Offline order queue
IndexedDB queue with client-generated idempotency keys, background sync on reconnect.

### Task 8.2: Print retry queue
Failed print jobs persisted, retried with backoff, admin visibility.

### Task 8.3: i18n completion
Audit: no hardcoded strings (test), de complete, en+fr complete, language switcher.

### Task 8.4: Docker deployment
Multi-stage Dockerfile, docker-compose with SQLite volume, ARM variant for Raspberry Pi.

### Task 8.5: Documentation
README with architecture diagram, dev setup, deployment guide, contributor guide.

---

## Validation

After each phase:
```bash
npm run typecheck && npm test && npm run build   # local CI
npm run test:e2e                                  # with dev servers
npm run dev                                       # manual smoke
```

---

## Risks and Tradeoffs

| Risk | Mitigation |
|------|------------|
| Money rounding | ✅ Resolved: integer cents |
| PIN leaks | ✅ Resolved: auth plugin + waiterSelect |
| Missing products CRUD | ✅ Resolved |
| Tear-off race condition | ✅ Resolved: atomic transaction |
| ESC/POS library compatibility | ✅ Resolved: node-thermal-printer + dummy driver |
| Real-time on flaky WiFi | Socket.io reconnects; offline queue (8.1) |
| SQLite concurrency | WAL mode; single-writer fine at this scale |
| PWA offline complexity | Online-only until Phase 8; idempotency keys make sync safe |
| QR guest-order abuse | Unguessable tokens; waiter confirmation gate |
| Scope creep | Explicit non-goals in ARCHITECTURE.md §10 |
