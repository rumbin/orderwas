# Graph Report - orderwas  (2026-08-28)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 561 nodes · 1085 edges · 38 communities (29 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f932cf13`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- src/index.ts
- dependencies
- escpos.ts
- orderService.ts
- api/client.ts
- Order.tsx
- App.tsx
- scripts
- compilerOptions
- dependencies
- products.ts
- devDependencies
- compilerOptions
- vouchers.ts
- auditService.ts
- order-page.test.tsx
- StationDisplay.tsx
- eventService.ts
- admin-products.test.tsx
- order-cart-increment.test.tsx
- router.tsx
- plugins/auth.ts
- order-lifecycle.spec.ts
- GuestOrder.tsx
- login-flow.test.tsx
- prisma/seed.ts
- install-hooks.sh
- pre-commit
- start-e2e.sh
- stop-e2e.sh
- cors.ts

## God Nodes (most connected - your core abstractions)
1. `prisma` - 42 edges
2. `buildServer()` - 33 edges
3. `AppServer` - 19 edges
4. `api` - 17 edges
5. `useSessionStore` - 16 edges
6. `compilerOptions` - 15 edges
7. `Product` - 14 edges
8. `ordersRoutes()` - 14 edges
9. `compilerOptions` - 13 edges
10. `scripts` - 12 edges

## Surprising Connections (you probably didn't know these)
- `buildServer()` --indirect_call--> `authPlugin()`  [INFERRED]
  server/src/index.ts → server/src/plugins/auth.ts
- `buildServer()` --indirect_call--> `auditRoutes()`  [INFERRED]
  server/src/index.ts → server/src/routes/audit.ts
- `buildServer()` --indirect_call--> `ordersRoutes()`  [INFERRED]
  server/src/index.ts → server/src/routes/orders.ts
- `buildServer()` --indirect_call--> `printersRoutes()`  [INFERRED]
  server/src/index.ts → server/src/routes/printers.ts
- `buildServer()` --indirect_call--> `productsRoutes()`  [INFERRED]
  server/src/index.ts → server/src/routes/products.ts

## Import Cycles
- None detected.

## Communities (38 total, 9 thin omitted)

### Community 0 - "src/index.ts"
Cohesion: 0.07
Nodes (41): globalForPrisma, prisma, AppServer, buildServer(), corsPlugin, main(), adminLoginSchema, authRoutes() (+33 more)

### Community 1 - "dependencies"
Cohesion: 0.05
Nodes (44): typescript, typescript, fastify, @fastify/cors, @fastify/jwt, fastify-plugin, @fastify/static, prisma (+36 more)

### Community 2 - "escpos.ts"
Cohesion: 0.08
Nodes (31): dispatchOrderPrints(), DUMMY_PRINT_DIR, executePrintJob(), OrderForPrint, PrintJob, sendToNetworkPrinter(), BOLD_OFF, BOLD_ON (+23 more)

### Community 3 - "orderService.ts"
Cohesion: 0.11
Nodes (30): createOrderBody, createOrderItemSchema, ordersRoutes(), transferOrderBody, updateOrderItemBody, updateOrderStatusBody, logAudit(), cancelItem() (+22 more)

### Community 4 - "api/client.ts"
Cohesion: 0.13
Nodes (21): adminAuthHeaders(), api, authHeaders(), request(), AppLayout, Event, OrderItem, Printer (+13 more)

### Community 5 - "Order.tsx"
Cohesion: 0.12
Nodes (25): Product, CartBar(), formatCents(), Props, formatCents(), ProductSection(), Props, Props (+17 more)

### Community 6 - "App.tsx"
Cohesion: 0.13
Nodes (20): App(), AppInner(), LanguagePicker(), LANGUAGES, ThemeSwitcher(), UserMenu(), Admin(), Landing() (+12 more)

### Community 7 - "scripts"
Cohesion: 0.07
Nodes (27): concurrently, dependencies, qrcode, devDependencies, concurrently, @playwright/test, @types/qrcode, name (+19 more)

### Community 8 - "compilerOptions"
Cohesion: 0.07
Nodes (22): @testing-library/jest-dom, compilerOptions, baseUrl, jsx, lib, module, moduleResolution, noEmit (+14 more)

### Community 9 - "dependencies"
Cohesion: 0.08
Nodes (23): dependencies, i18next, react, react-dom, react-i18next, socket.io-client, zustand, name (+15 more)

### Community 10 - "products.ts"
Cohesion: 0.18
Nodes (19): createExtraSchema, createProductSchema, productsRoutes(), updateExtraSchema, updateProductSchema, addComponent(), createProduct(), deleteProduct() (+11 more)

### Community 11 - "devDependencies"
Cohesion: 0.09
Nodes (23): autoprefixer, devDependencies, autoprefixer, jsdom, postcss, tailwindcss, @testing-library/react, @types/react (+15 more)

### Community 12 - "compilerOptions"
Cohesion: 0.09
Nodes (22): dist, node, node_modules, compilerOptions, baseUrl, declaration, esModuleInterop, module (+14 more)

### Community 13 - "vouchers.ts"
Cohesion: 0.35
Nodes (10): bulkCreateSchema, createVoucherSchema, redeemSchema, voucherRoutes(), bulkCreateVouchers(), createVoucher(), expireVoucher(), listVouchers() (+2 more)

### Community 14 - "auditService.ts"
Cohesion: 0.48
Nodes (9): auditRoutes(), AuditLogEntry, getPeakTimes(), getProductConsumption(), getStationRevenue(), getStockHistory(), getWaiterSummary(), listAuditLogs() (+1 more)

### Community 15 - "order-page.test.tsx"
Cohesion: 0.18
Nodes (10): mockBarProducts, mockCancelOrder, mockCreateOrder, mockGetOrders, mockGetProducts, mockGetStations, mockKitchenProducts, mockOutOfStockProduct (+2 more)

### Community 16 - "StationDisplay.tsx"
Cohesion: 0.38
Nodes (7): Order, OrderEventPayload, useWebSocket(), formatTime(), KitchenMonitor(), formatTime(), StationDisplay()

### Community 17 - "eventService.ts"
Cohesion: 0.22
Nodes (3): createEventSchema, updateEventSchema, updateEvent()

### Community 18 - "admin-products.test.tsx"
Cohesion: 0.29
Nodes (5): mockDeleteProduct, mockGetProducts, mockProducts, mockStations, mockUpdateProduct

### Community 19 - "order-cart-increment.test.tsx"
Cohesion: 0.29
Nodes (6): mockBarProducts, mockCreateOrder, mockGetProducts, mockGetStations, mockKitchenProducts, mockStations

### Community 20 - "router.tsx"
Cohesion: 0.47
Nodes (4): matchRoute(), parseHash(), Route, useRouter()

### Community 21 - "plugins/auth.ts"
Cohesion: 0.33
Nodes (5): AdminJwtPayload, authPlugin(), fastify, FastifyInstance, JwtPayload

## Knowledge Gaps
- **211 isolated node(s):** `StockCheckResult`, `AuditLogEntry`, `OrderForPrint`, `Route`, `AdminJwtPayload` (+206 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `devDependencies` to `compilerOptions`, `dependencies`, `dependencies`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `prisma` connect `src/index.ts` to `escpos.ts`, `orderService.ts`, `products.ts`, `vouchers.ts`, `auditService.ts`, `eventService.ts`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `buildServer()` (e.g. with `authPlugin()` and `auditRoutes()`) actually correct?**
  _`buildServer()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **What connects `StockCheckResult`, `AuditLogEntry`, `OrderForPrint` to the rest of the system?**
  _211 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07315315315315316 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._
- **Should `escpos.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07926829268292683 - nodes in this community are weakly interconnected._