# Orderwas Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build an open-source ordering system for club festivals (Vereinsfeste) — browser-based, offline-capable, with ESC/POS printer support.

**Architecture:** Monorepo with a Node.js/TypeScript backend (REST + WebSocket) and a React/Vite frontend (PWA). SQLite as primary database with a Prisma ORM abstraction layer for PostgreSQL swappability. ESC/POS for thermal printers. German-first UI with i18n architecture.

**Tech Stack:**
- **Backend:** Node.js 20+, TypeScript, Fastify, Prisma ORM, SQLite, Socket.io, Zod validation
- **Frontend:** React 18+, Vite, TypeScript, Tailwind CSS, react-i18next, PWA (vite-plugin-pwa)
- **Testing:** Vitest (unit + integration), Playwright (E2E)
- **Deployment:** Docker, docker-compose
- **License:** GPL-3.0

---

## Architecture

```
orderwas/
├── server/                  # Backend (Node.js + Fastify)
│   ├── src/
│   │   ├── routes/           # REST API routes
│   │   ├── services/        # Business logic
│   │   ├── printer/         # ESC/POS printer driver
│   │   ├── websocket/       # Socket.io real-time
│   │   ├── db/              # Prisma schema & client
│   │   ├── i18n/            # Backend translations (receipts etc.)
│   │   └── index.ts         # Entry point
│   ├── prisma/
│   │   └── schema.prisma    # Database schema
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   └── package.json
├── client/                  # Frontend (React + Vite PWA)
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Route pages
│   │   ├── hooks/           # Custom hooks
│   │   ├── i18n/            # Translation files (de.json, en.json, fr.json)
│   │   ├── api/             # API client
│   │   ├── stores/          # State management (zustand)
│   │   └── main.tsx         # Entry point
│   ├── tests/
│   └── package.json
├── docs/                    # Existing documentation
├── docker/                  # Dockerfile, docker-compose.yml
├── package.json             # Workspace root
└── README.md
```

## Implementation Order

### Phase 0: Project Bootstrap (Tasks 1-3)
Set up monorepo, tooling, Docker. No business logic.

### Phase 1: Backend Core — The Tracer Bullet (Tasks 4-12)
Vertical slice: Event → Products → Order → API response.
Proves the architecture works end-to-end.

### Phase 1.5: Local CI Pipeline (Tasks 12a-12d)
Build verification, lint, typecheck, E2E smoke tests, and pre-commit hooks.
Must be in place before Phase 2 so every subsequent phase is validated.

### Phase 2: Frontend Core — Order Taking (Tasks 13-18)
Responsive PWA where a waiter can select products and submit orders.
Connects to the backend API from Phase 1.

### Phase 3: Station Display & Printers (Tasks 19-24)
Kitchen monitor view + ESC/POS printer support.
Orders appear at the station in real-time.

### Phase 4: Real-Time (Tasks 25-27)
WebSocket integration for live updates across all devices.

### Phase 5: Admin & Configuration (Tasks 28-32)
Admin UI for events, waiters, stations, products, printers.
Export/import configuration.

### Phase 6: Advanced Features (Tasks 33-40)
Vouchers, stock management, settlement, QR code ordering.

### Phase 7: Polish (Tasks 41-44)
Offline mode, i18n completion, Docker deployment, documentation.

---

## Phase 0: Project Bootstrap

### Task 1: Initialize git repo and monorepo structure

**Objective:** Create the project skeleton with npm workspaces.

**Files:**
- Create: `package.json` (workspace root)
- Create: `.gitignore`
- Create: `server/package.json`
- Create: `client/package.json`
- Create: `LICENSE` (GPL-3.0)

**Steps:**
1. `cd /home/biephi/hermine/orderwas && git init`
2. Create root `package.json` with npm workspaces:
```json
{
  "name": "orderwas",
  "private": true,
  "workspaces": ["server", "client"],
  "scripts": {
    "dev": "concurrently \"npm:dev:server\" \"npm:dev:client\"",
    "dev:server": "npm -w server run dev",
    "dev:client": "npm -w client run dev",
    "test": "npm -w server run test && npm -w client run test",
    "build": "npm -w server run build && npm -w client run build"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
```
3. Create `.gitignore` (node_modules, dist, *.db, .env, .prisma)
4. Create GPL-3.0 LICENSE file
5. Create `server/package.json` and `client/package.json` stubs
6. `git add -A && git commit -m "chore: initialize monorepo structure"`

---

### Task 2: Set up backend (Fastify + TypeScript + Prisma + Vitest)

**Objective:** Backend dev environment with TypeScript, Fastify, Prisma, and Vitest.

**Files:**
- Create: `server/tsconfig.json`
- Create: `server/src/index.ts` (minimal Fastify server)
- Create: `server/prisma/schema.prisma` (SQLite, empty)
- Create: `server/tests/health.test.ts`
- Create: `server/vitest.config.ts`
- Modify: `server/package.json`

**TDD Steps:**
1. Write `server/tests/health.test.ts` — test GET `/health` returns 200 `{status:"ok"}`
2. Run: `npx vitest run` — expect FAIL (server not implemented)
3. Implement `server/src/index.ts` — minimal Fastify server with `/health` route
4. Run: `npx vitest run` — expect PASS
5. Commit: `feat: backend health check endpoint`

---

### Task 3: Set up frontend (React + Vite + Tailwind + Vitest)

**Objective:** Frontend dev environment with React, Vite, Tailwind, and Vitest.

**Files:**
- Create: `client/vite.config.ts`
- Create: `client/tsconfig.json`
- Create: `client/src/main.tsx` (minimal React app)
- Create: `client/src/App.tsx` (displays "Orderwas")
- Create: `client/tests/app.test.tsx`
- Create: `client/tailwind.config.ts`
- Create: `client/postcss.config.js`
- Create: `client/index.html`

**TDD Steps:**
1. Write `client/tests/app.test.tsx` — test App renders "Orderwas" heading
2. Run: `npx vitest run` — expect FAIL
3. Implement `client/src/App.tsx`
4. Run: `npx vitest run` — expect PASS
5. Commit: `feat: frontend skeleton with React + Tailwind`

---

## Phase 1: Backend Core — Tracer Bullet

### Task 4: Prisma schema — Event entity

**Objective:** Create the Event model in Prisma with SQLite.

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/tests/unit/event.test.ts`
- Create: `server/src/services/eventService.ts`

**TDD Steps:**
1. Write test: `createEvent({name: "Testfest"})` returns event with id and name
2. Run — FAIL
3. Add Event model to schema.prisma, run `npx prisma migrate dev`, implement service
4. Run — PASS
5. Commit: `feat: event model and service`

**Schema:**
```prisma
model Event {
  id        String   @id @default(cuid())
  name      String
  status    String   @default("test") // "test" | "live"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

### Task 5: Prisma schema — Station entity

**Objective:** Create Station model linked to Event.

**Schema:**
```prisma
model Station {
  id        String   @id @default(cuid())
  name      String
  eventId   String
  event     Event    @relation(fields: [eventId], references: [id])
  printerIp String?
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**TDD Steps:** Same pattern — test create/list, fail, implement, pass, commit.

---

### Task 6: Prisma schema — Product entity

**Objective:** Create Product model linked to Station.

**Schema:**
```prisma
model Product {
  id        String   @id @default(cuid())
  name      String
  price     Float
  stationId String
  station   Station  @relation(fields: [stationId], references: [id])
  taxRate   Float    @default(20.0)
  available Boolean  @default(true)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

### Task 7: Prisma schema — Waiter entity

**Objective:** Create Waiter model linked to Event.

**Schema:**
```prisma
model Waiter {
  id        String   @id @default(cuid())
  name      String
  pin       String
  eventId   String
  event     Event    @relation(fields: [eventId], references: [id])
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

### Task 8: Prisma schema — Order and OrderItem entities

**Objective:** Create Order + OrderItem models.

**Schema:**
```prisma
model Order {
  id          String      @id @default(cuid())
  tableNumber  String
  waiterId    String
  waiter      Waiter      @relation(fields: [waiterId], references: [id])
  eventId     String
  event       Event       @relation(fields: [eventId], references: [id])
  status      String      @default("open") // "open" | "paid" | "cancelled"
  total       Float       @default(0)
  comment     String?
  tearOffNumber Int?
  createdAt   DateTime    @default(now())
  items       OrderItem[]
}

model OrderItem {
  id        String  @id @default(cuid())
  orderId   String
  order     Order   @relation(fields: [orderId], references: [id])
  productId String
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int     @default(1)
  status    String  @default("open") // "open" | "prepared" | "delivered" | "cancelled"
  comment   String?
}
```

---

### Task 9: REST API — Event CRUD routes

**Objective:** Fastify routes for POST/GET/PUT/DELETE events.

**Files:**
- Create: `server/src/routes/events.ts`
- Create: `server/tests/integration/events.test.ts`
- Use Zod for request validation

**TDD Steps:**
1. Write integration test: POST `/api/events` → 201 with event body
2. Write test: GET `/api/events` → 200 with array
3. Write test: GET `/api/events/:id` → 200 or 404
4. Run — FAIL
5. Implement routes with Zod schemas
6. Run — PASS
7. Commit: `feat: event CRUD API`

---

### Task 10: REST API — Product CRUD routes

Same pattern as Task 9, for products with stationId association.

---

### Task 11: REST API — Order creation route

**Objective:** POST `/api/orders` creates order with items, calculates total.

**TDD Steps:**
1. Write test: POST order with 2× Beer (€3) + 1× Schnitzel (€8) → total = €14
2. Write test: Order without items → 400 validation error
3. Write test: Order with non-existent product → 404
4. Run — FAIL
5. Implement order service with total calculation
6. Run — PASS
7. Commit: `feat: order creation with total calculation`

---

### Task 12: REST API — Order listing and status routes

**Objective:** GET orders by event, PATCH order status.

**TDD Steps:**
1. Write test: GET `/api/events/:eventId/orders` → list of orders
2. Write test: PATCH `/api/orders/:id` with `{status: "paid"}` → updates status
3. Run — FAIL
4. Implement
5. Run — PASS
6. Commit: `feat: order listing and status update`

---

## Phase 1.5: Local CI Pipeline

### Task 12a: Typecheck and lint scripts

**Objective:** Add `typecheck` and `lint` scripts to both workspaces and the root.

**Files:**
- Modify: `package.json` (root) — add `typecheck`, `lint`, `ci` scripts
- Modify: `server/package.json` — add `typecheck` script
- Modify: `client/package.json` — add `typecheck` script
- Create: `server/.eslintrc.json` (or eslint flat config)
- Create: `client/.eslintrc.json`

**TDD Steps:**
1. Run `npx tsc --noEmit -p server/tsconfig.json` — must pass
2. Run `npx tsc --noEmit -p client/tsconfig.json` — must pass
3. Add root scripts:
   - `"typecheck": "npm -w server run typecheck && npm -w client run typecheck"`
   - `"ci": "npm run typecheck && npm test && npm run build && npm run test:e2e"`
4. Commit: `chore: typecheck and ci scripts`

---

### Task 12b: Build verification

**Objective:** Verify both server and client build successfully from clean state.

**Files:**
- Modify: `server/package.json` — ensure `"build": "tsc"` works
- Modify: `client/package.json` — ensure `"build": "tsc && vite build"` works

**Steps:**
1. Run `npm -w server run build` — must produce `dist/` without errors
2. Run `npm -w client run build` — must produce `dist/` without errors
3. Fix any build failures
4. Add `"build:check": "npm -w server run build && npm -w client run build"` to root
5. Commit: `chore: build verification`

---

### Task 12c: Playwright E2E setup + smoke test

**Objective:** End-to-end test that starts the backend, serves the frontend, and verifies the health endpoint and the app renders.

**Files:**
- Create: `e2e/playwright.config.ts` — runs against `localhost:5173` with backend at `localhost:3000`
- Create: `e2e/smoke.spec.ts` — loads the app, checks for "Orderwas" heading, hits `/api/health`
- Create: `e2e/package.json` — playwright dependency
- Create: `scripts/start-e2e.sh` — starts backend + frontend in background for tests

**TDD Steps:**
1. Write `e2e/smoke.spec.ts`:
   ```typescript
   import { test, expect } from '@playwright/test'

   test('frontend renders the app heading', async ({ page }) => {
     await page.goto('http://localhost:5173')
     await expect(page.locator('h1')).toContainText(/orderwas/i)
   })

   test('backend health endpoint returns ok', async ({ request }) => {
     const response = await request.get('http://localhost:3000/health')
     expect(response.ok()).toBeTruthy()
     const body = await response.json()
     expect(body.status).toBe('ok')
   })
   ```
2. Install playwright browsers: `npx playwright install chromium`
3. Add `"test:e2e": "npx playwright test --config e2e/playwright.config.ts"` to root
4. Run — verify pass (requires backend + frontend running)
5. Commit: `test: playwright smoke e2e test`

---

### Task 12d: Pre-commit hooks (git hooks, no external tools)

**Objective:** Run typecheck + unit tests before every commit. No pre-commit binary — use plain git hooks.

**Files:**
- Create: `scripts/pre-commit` — shell script that runs typecheck + unit tests
- Create: `scripts/install-hooks.sh` — symlinks `scripts/pre-commit` → `.git/hooks/pre-commit`
- Modify: `package.json` — add `"postinstall": "bash scripts/install-hooks.sh"`

**Script `scripts/pre-commit`:**
```bash
#!/usr/bin/env bash
set -e
echo "▶ Running typecheck..."
npm run typecheck 2>&1
echo "▶ Running unit tests..."
npm test 2>&1
echo "▶ Running build..."
npm run build 2>&1
echo "✓ Pre-commit checks passed"
```

**Steps:**
1. Create the scripts
2. Run `bash scripts/install-hooks.sh`
3. Test: make a trivial change and `git commit` — hook runs
4. Commit: `chore: pre-commit hooks for typecheck + tests + build`

---

## Phase 2: Frontend Core — Order Taking

### Task 13: API client and types

**Objective:** TypeScript API client for the backend.

**Files:**
- Create: `client/src/api/client.ts` (fetch wrapper)
- Create: `client/src/api/types.ts` (shared types)
- Create: `client/tests/api.test.ts`

---

### Task 14: Waiter login page

**Objective:** Timer selects event → enters name + PIN → auth.

**TDD Steps:**
1. Write test: Login page renders event selector
2. Write test: Form submits with name and PIN
3. Implement with Tailwind, mobile-first
4. Commit: `feat: waiter login page`

---

### Task 15: Order taking page — product grid

**Objective:** Responsive button grid of products grouped by station/category.

**TDD Steps:**
1. Write test: ProductGrid renders buttons for products
2. Write test: Tapping a product adds it to cart
3. Write test: Tapping again increases quantity
4. Implement with Tailwind grid, touch-friendly buttons (min 44x44px)
5. Commit: `feat: product selection grid`

---

### Task 16: Order taking page — cart and submit

**Objective:** Cart summary, table number input, submit order.

**TDD Steps:**
1. Write test: Cart shows items with quantities and total
2. Write test: Submit with table number → POST to API → success message
3. Write test: Submit without table number → validation error
4. Implement
5. Commit: `feat: order cart and submission`

---

### Task 17: Order overview page

**Objective:** Waiter sees their own orders with status.

**TDD Steps:**
1. Write test: Shows list of orders with table, total, status
2. Write test: Status badges show open/paid/cancelled
3. Implement
4. Commit: `feat: waiter order overview`

---

### Task 18: PWA manifest and service worker

**Objective:** Make the app installable and offline-capable.

**Files:**
- Modify: `client/vite.config.ts` (add vite-plugin-pwa)
- Create: `client/public/manifest.json`

**Steps:**
1. Add vite-plugin-pwa to config
2. Create manifest with name, icons, theme color
3. Test: Lighthouse PWA check
4. Commit: `feat: PWA manifest and service worker`

---

## Phase 3: Station Display & Printers

### Task 19: Station display page — order list

**Objective:** Browser page showing incoming orders for a station.

**TDD Steps:**
1. Write test: Shows open orders sorted by time (oldest first)
2. Write test: Each order shows table number + items
3. Write test: "Mark done" button changes item status
4. Implement
5. Commit: `feat: station order display`

---

### Task 20: Station display — product view

**Objective:** Alternative view aggregating items by product across all orders.

**TDD Steps:**
1. Write test: Shows products with total quantity across orders
2. Write test: Shows table numbers for each product
3. Implement
4. Commit: `feat: station product aggregation view`

---

### Task 21: ESC/POS printer service — connection

**Objective:** Backend service to send print jobs to network printers via ESC/POS.

**Files:**
- Create: `server/src/printer/escpos.ts`
- Create: `server/tests/unit/printer.test.ts`

**TDD Steps:**
1. Write test: `formatReceipt(order)` returns ESC/POS buffer with table number, items, total
2. Write test: `formatReceipt` includes station name as header
3. Write test: `formatReceipt` handles multi-line product names
4. Run — FAIL
5. Implement using `escpos` or `node-thermal-printer` library
6. Run — PASS
7. Commit: `feat: ESC/POS receipt formatting`

---

### Task 22: Print on order creation

**Objective:** When an order is created, print receipts at relevant stations.

**TDD Steps:**
1. Write test: Order with drinks (station: bar) → print job sent to bar printer
2. Write test: Order with food (station: kitchen) → print job sent to kitchen printer
3. Write test: Order with items from 2 stations → 2 print jobs
4. Implement: hook into order service, route to station printers
5. Commit: `feat: automatic station receipt printing`

---

### Task 23: Printer configuration

**Objective:** Admin can configure printer IP per station.

**Files:**
- Modify: `server/prisma/schema.prisma` (already has printerIp on Station)
- Create: `server/src/routes/printers.ts`
- Write tests for printer test-print endpoint
- Commit: `feat: printer configuration and test print`

---

### Task 24: Dummy printer for testing

**Objective:** "Dummy" printer type that logs instead of printing — for development.

**TDD Steps:**
1. Write test: Dummy printer logs order to console/file instead of network
2. Implement
3. Commit: `feat: dummy printer for development`

---

## Phase 4: Real-Time

### Task 25: WebSocket server setup

**Objective:** Socket.io server for real-time order updates.

**Files:**
- Create: `server/src/websocket/index.ts`
- Create: `server/tests/integration/websocket.test.ts`

**TDD Steps:**
1. Write test: Client connects, receives `order:created` event when order is posted
2. Write test: Client receives `order:updated` when status changes
3. Implement
4. Commit: `feat: WebSocket real-time order updates`

---

### Task 26: Frontend WebSocket integration

**Objective:** Frontend subscribes to order updates and updates UI live.

**TDD Steps:**
1. Write test: Station display updates when new order arrives
2. Write test: Waiter overview updates when order status changes
3. Implement with Socket.io client
4. Commit: `feat: real-time frontend updates`

---

### Task 27: Real-time station display auto-refresh

**Objective:** Station display updates without page reload.

**TDD Steps:**
1. Write test: New order appears without manual refresh
2. Write test: Done orders disappear from list
3. Implement
4. Commit: `feat: station display auto-update`

---

## Phase 5: Admin & Configuration

### Task 28: Admin layout and navigation

**Objective:** Admin interface with sidebar navigation (Events, Waiters, Stations, Products, Printers).

**TDD Steps:**
1. Write test: Admin layout renders nav links
2. Write test: Clicking nav link changes page
3. Implement with Tailwind
4. Commit: `feat: admin layout and navigation`

---

### Task 29: Admin — Event management page

**Objective:** CRUD page for events with test/live toggle.

**TDD Steps:**
1. Write test: Shows event list with status badges
2. Write test: Create event form (name, status)
3. Write test: Toggle event from test → live
4. Implement
5. Commit: `feat: admin event management`

---

### Task 30: Admin — Station and Product management

**Objective:** CRUD for stations and products with drag-sort.

**TDD Steps:**
1. Write test: Create station with name
2. Write test: Add products to station with price
3. Write test: Products show in station list
4. Implement
5. Commit: `feat: admin station and product management`

---

### Task 31: Admin — Waiter management

**Objective:** CRUD for waiters with PIN assignment and permissions.

**TDD Steps:**
1. Write test: Create waiter with name + PIN
2. Write test: Toggle waiter active/inactive
3. Implement
4. Commit: `feat: admin waiter management`

---

### Task 32: Configuration export/import

**Objective:** Export full event configuration (stations, products, waiters, layouts) as JSON. Import to bootstrap a new event.

**Files:**
- Create: `server/src/services/configExportImport.ts`
- Create: `server/src/routes/config.ts`
- Create: `server/tests/integration/config.test.ts`

**TDD Steps:**
1. Write test: `exportConfig(eventId)` returns JSON with all stations, products, waiters
2. Write test: `importConfig(json, newEventId)` creates all entities
3. Write test: Imported config matches exported config
4. Implement
5. Commit: `feat: configuration export/import`

---

## Phase 6: Advanced Features

### Task 33: Voucher system (Gutscheine)

**Objective:** Products flagged as vouchers, separate voucher station, redemption workflow.

**TDD Steps:**
1. Write test: Product with `isVoucher: true` — works like a pre-paid item
2. Write test: Voucher order prints receipt with tear-off number
3. Write test: Voucher can be redeemed (marked as used)
4. Implement
5. Commit: `feat: voucher system`

---

### Task 34: Stock management (Lagerstände)

**Objective:** Per-product stock tracking with composite products.

**TDD Steps:**
1. Write test: Product with stock=10, order 3 → stock=7
2. Write test: Product with stock=0 → unavailable, cannot order
3. Write test: Composite product (Schnitzel+Pommes) decrements both ingredients
4. Implement
5. Commit: `feat: stock management`

---

### Task 35: Settlement and reporting

**Objective:** Per-waiter cash summary, event-wide Excel/CSV export.

**TDD Steps:**
1. Write test: `getWaiterSummary(waiterId)` returns total cash, order count
2. Write test: `getEventSummary(eventId)` returns per-station revenue
3. Write test: CSV export generates valid CSV
4. Implement
5. Commit: `feat: settlement and reporting`

---

### Task 36: QR code generation for tables

**Objective:** Generate QR codes per table that link to the ordering page.

**Files:**
- Create: `server/src/services/qrcode.ts`
- Create: `server/src/routes/tables.ts`

**TDD Steps:**
1. Write test: `generateTableQR(eventId, tableNumber)` returns QR image buffer
2. Write test: QR code decodes to correct URL
3. Write test: GET `/api/events/:id/tables/:num/qrcode` returns PNG
4. Implement with `qrcode` library
5. Commit: `feat: QR code generation for tables`

---

### Task 37: Guest ordering page (QR code entry point)

**Objective:** Mobile page where guests scan QR, see products, place order. Waiter gets notification.

**TDD Steps:**
1. Write test: Page loads with table number from URL
2. Write test: Guest sees available products
3. Write test: Guest submits order → creates order with status `pending`
4. Write test: Waiter app receives notification of pending order
5. Implement
6. Commit: `feat: guest QR code ordering page`

---

### Task 38: Kitchen monitor — order view

**Objective:** Full-screen kitchen display showing orders sorted by wait time.

**TDD Steps:**
1. Write test: Shows orders oldest-first with wait time counter
2. Write test: Click order to mark as complete
3. Write test: Completed orders slide off / fade
4. Implement
5. Commit: `feat: kitchen monitor order view`

---

### Task 39: App layout customization

**Objective:** Admin can configure button grid (columns, rows, colors, product mapping).

**TDD Steps:**
1. Write test: Save layout with 3 cols, 4 rows, product assignments
2. Write test: Waiter app renders grid from saved layout
3. Write test: Layout persists per event
4. Implement
5. Commit: `feat: customizable app layout`

---

### Task 40: Waiter permissions and transfers

**Objective:** Per-waiter permission flags, order transfer between waiters.

**TDD Steps:**
1. Write test: Waiter without `canCancel` → cancel request rejected
2. Write test: Transfer order from waiter A to waiter B
3. Write test: Waiter with `canCashOut` → can settle for others
4. Implement
5. Commit: `feat: waiter permissions and transfers`

---

## Phase 7: Polish

### Task 41: Offline mode (Service Workers + IndexedDB)

**Objective:** Orders queued locally when WiFi drops, sync on reconnect.

**TDD Steps:**
1. Write test: Order created while offline → stored in IndexedDB
2. Write test: On reconnect → queued orders sync to backend
3. Implement with Workbox / custom service worker
4. Commit: `feat: offline order queue with sync`

---

### Task 42: i18n — German, English, French

**Objective:** All UI strings externalized, de.json complete, en.json + fr.json translations.

**TDD Steps:**
1. Write test: All components use `t()` function, no hardcoded strings
2. Write test: Language switcher changes displayed text
3. Write test: German translations complete (no missing keys)
4. Implement with react-i18next
5. Commit: `feat: i18n with German, English, French`

---

### Task 43: Docker deployment

**Objective:** Multi-stage Dockerfile + docker-compose for single-command deployment.

**Files:**
- Create: `docker/Dockerfile`
- Create: `docker/docker-compose.yml`
- Create: `docker/Dockerfile.rpi` (Raspberry Pi ARM image)

**Steps:**
1. Backend: Node.js slim image, prisma generate, sqlite
2. Frontend: Build static, serve with `vite preview` or nginx
3. Compose: backend + frontend + volume for sqlite
4. Test: `docker-compose up` → both services healthy
5. Commit: `feat: Docker deployment`

---

### Task 44: Documentation and README update

**Objective:** Update README with setup, development, and deployment instructions.

**Steps:**
1. Update README with architecture diagram
2. Add development setup guide
3. Add deployment guide (Docker, Raspberry Pi)
4. Add contributor guide
5. Commit: `docs: comprehensive README and setup guide`

---

## Validation

After each phase:
```bash
# Run all tests
npm test

# Build everything
npm run build

# Start dev environment
npm run dev

# Manual smoke test:
# 1. Open http://localhost:5173 (client)
# 2. Create event in admin
# 3. Add station + products
# 4. Log in as waiter
# 5. Take order
# 6. Check station display
# 7. Print receipt (with dummy printer)
```

---

## Risks and Tradeoffs

| Risk | Mitigation |
|------|------------|
| ESC/POS library compatibility | Start with `node-thermal-printer`, test with Epson TM-T20 |
| Real-time on flaky WiFi | Offline queue + optimistic UI updates |
| SQLite concurrency with many waiters | WAL mode, connection pooling, stress test early |
| PWA offline complexity | Start with online-only, add offline in Phase 7 |
| QR code security | Random unguessable URLs, per-event tokens |

## Open Questions

1. **Frontend framework**: React (larger ecosystem) vs Vue (simpler) — **Recommendation: React**
2. **State management**: Zustand (simple) vs Redux (mature) — **Recommendation: Zustand**
3. **ORM**: Prisma (type-safe, migrations) vs Drizzle (lightweight) — **Recommendation: Prisma** (SQLite + Postgres swap)
4. **Test framework**: Vitest (fast, Vite-native) vs Jest (mature) — **Recommendation: Vitest**
5. **License**: GPL-3.0 vs AGPL-3.0 — **Recommendation: GPL-3.0** (simpler, sufficient for desktop/server use)