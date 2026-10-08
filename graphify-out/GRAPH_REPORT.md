# Graph Report - orderwas  (2026-10-08)

## Corpus Check
- 174 files · ~251,915 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 895 nodes · 1611 edges · 57 communities (51 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fb00f863`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- src/index.ts
- dependencies
- escpos.ts
- orderService.ts
- types.ts
- 5.2 Advanced Features (Should-Have)
- App.tsx
- scripts
- compilerOptions
- devDependencies
- products.ts
- CalculatorModal.tsx
- compilerOptions
- vouchers.ts
- Order → Payment → Delivery Lifecycle Implementation Plan
- layouts.ts
- AdminProducts.tsx
- auditService.ts
- StationDisplay.tsx
- Order.tsx
- 4.2 Entity Definitions
- cashier-view.test.tsx
- e2e/helpers/setup.ts
- stations.ts
- guest-order.test.tsx
- prisma/seed.ts
- install-hooks.sh
- pre-commit
- start-e2e.sh
- stop-e2e.sh
- cors.ts
- routes/auth.ts
- i18n-parity.test.ts
- waiters.ts
- useSessionStore
- Orderwas
- Orderwas — Requirements Document
- AGENTS.md — Orderwas
- 3.4 Philipp's Specific Requirements
- 6. Workflow Descriptions
- 8. Technical Requirements
- Admin.tsx
- 17. Requirements from Live Review (2026-08-17)
- cashier-view-counter.test.tsx
- 10. Competitive Analysis
- 13. Implementation Roadmap
- 15. Appendix
- 9. Hardware Requirements
- 14. Success Criteria
- 2. Target Audience & Use Cases
- 7. User Interface Requirements

## God Nodes (most connected - your core abstractions)
1. `prisma` - 49 edges
2. `buildServer()` - 40 edges
3. `AppServer` - 25 edges
4. `formatPrice()` - 20 edges
5. `api` - 19 edges
6. `Orderwas — Requirements Document` - 18 edges
7. `useSessionStore` - 18 edges
8. `Product` - 16 edges
9. `OrderValidationError` - 16 edges
10. `Orderwas` - 16 edges

## Surprising Connections (you probably didn't know these)
- `buildServer()` --indirect_call--> `authPlugin()`  [INFERRED]
  server/src/index.ts → server/src/plugins/auth.ts
- `buildServer()` --indirect_call--> `auditRoutes()`  [INFERRED]
  server/src/index.ts → server/src/routes/audit.ts
- `buildServer()` --indirect_call--> `authRoutes()`  [INFERRED]
  server/src/index.ts → server/src/routes/auth.ts
- `buildServer()` --indirect_call--> `eventRoutes()`  [INFERRED]
  server/src/index.ts → server/src/routes/events.ts
- `buildServer()` --indirect_call--> `layoutsRoutes()`  [INFERRED]
  server/src/index.ts → server/src/routes/layouts.ts

## Import Cycles
- None detected.

## Communities (57 total, 6 thin omitted)

### Community 0 - "src/index.ts"
Cohesion: 0.07
Nodes (29): globalForPrisma, prisma, AppServer, buildServer(), corsPlugin, main(), configRoutes(), createEventSchema (+21 more)

### Community 1 - "dependencies"
Cohesion: 0.05
Nodes (44): typescript, typescript, fastify, @fastify/cors, @fastify/jwt, fastify-plugin, @fastify/static, prisma (+36 more)

### Community 2 - "escpos.ts"
Cohesion: 0.08
Nodes (31): dispatchOrderPrints(), DUMMY_PRINT_DIR, executePrintJob(), OrderForPrint, PrintJob, sendToNetworkPrinter(), BOLD_OFF, BOLD_ON (+23 more)

### Community 3 - "orderService.ts"
Cohesion: 0.07
Nodes (51): AdminJwtPayload, authPlugin(), fastify, FastifyInstance, JwtPayload, createOrderBody, createOrderItemSchema, ordersRoutes() (+43 more)

### Community 4 - "types.ts"
Cohesion: 0.11
Nodes (23): adminAuthHeaders(), authHeaders(), request(), AppLayout, AuditLogEntry, OpenTable, Order, OrderItem (+15 more)

### Community 5 - "5.2 Advanced Features (Should-Have)"
Cohesion: 0.10
Nodes (21): 5.1.1 Order Taking, 5.1.2 Station Management, 5.1.3 Kitchen Monitor, 5.1.4 Printer Support, 5.1.5 Voucher System (Gutscheine), 5.1.6 Settlement & Reporting, 5.1.7 User & Role Management, 5.1 Core Features (Must-Have) (+13 more)

### Community 6 - "App.tsx"
Cohesion: 0.15
Nodes (12): App(), AppInner(), formatCents(), GuestOrder(), matchRoute(), parseHash(), Route, useRouter() (+4 more)

### Community 7 - "scripts"
Cohesion: 0.07
Nodes (27): concurrently, dependencies, qrcode, devDependencies, concurrently, @playwright/test, @types/qrcode, name (+19 more)

### Community 8 - "compilerOptions"
Cohesion: 0.07
Nodes (22): @testing-library/jest-dom, compilerOptions, baseUrl, jsx, lib, module, moduleResolution, noEmit (+14 more)

### Community 9 - "devDependencies"
Cohesion: 0.04
Nodes (46): autoprefixer, dependencies, i18next, react, react-dom, react-i18next, socket.io-client, zustand (+38 more)

### Community 10 - "products.ts"
Cohesion: 0.18
Nodes (21): createExtraSchema, createProductSchema, productsRoutes(), updateProductSchema, addComponent(), createExtra(), createProduct(), deleteExtra() (+13 more)

### Community 11 - "CalculatorModal.tsx"
Cohesion: 0.53
Nodes (5): CalculatorModal(), formatCents(), parseCents(), Props, splitCents()

### Community 12 - "compilerOptions"
Cohesion: 0.09
Nodes (22): dist, node, node_modules, compilerOptions, baseUrl, declaration, esModuleInterop, module (+14 more)

### Community 13 - "vouchers.ts"
Cohesion: 0.33
Nodes (11): bulkCreateSchema, createVoucherSchema, redeemSchema, voucherRoutes(), bulkCreateVouchers(), createVoucher(), expireVoucher(), getOrderEventId() (+3 more)

### Community 14 - "Order → Payment → Delivery Lifecycle Implementation Plan"
Cohesion: 0.09
Nodes (21): Current State (verified), Key Decisions, Order → Payment → Delivery Lifecycle Implementation Plan, Phase A — Backend: Payment Model + API, Phase B — Client: CashierView, Phase C — i18n (parity rule!), Phase D — Tests & Verification, Risks / Open Questions (+13 more)

### Community 15 - "layouts.ts"
Cohesion: 0.32
Nodes (10): createLayoutSchema, layoutsRoutes(), updateLayoutSchema, createLayout(), CreateLayoutData, deleteLayout(), getWaiterLayout(), layoutSelect (+2 more)

### Community 16 - "AdminProducts.tsx"
Cohesion: 0.20
Nodes (9): AdminProducts(), ProductEditModal(), mockCreateProduct, mockDeleteProduct, mockGetProducts, mockProducts, mockReorderProducts, mockStations (+1 more)

### Community 17 - "auditService.ts"
Cohesion: 0.45
Nodes (10): auditRoutes(), AuditLogEntry, getPeakTimes(), getProductConsumption(), getProductEventId(), getStationRevenue(), getStockHistory(), getWaiterSummary() (+2 more)

### Community 18 - "StationDisplay.tsx"
Cohesion: 0.15
Nodes (12): OrderEventPayload, useWebSocket(), PRODUCT_BG_CLASSES, PRODUCT_BORDER_CLASSES, PRODUCT_COLORS, formatTime(), KitchenMonitor(), formatTime() (+4 more)

### Community 19 - "Order.tsx"
Cohesion: 0.11
Nodes (27): Product, CartBar(), formatCents(), Props, formatCents(), ProductSection(), Props, Props (+19 more)

### Community 20 - "4.2 Entity Definitions"
Cohesion: 0.15
Nodes (13): 4.1 Entity Relationship Diagram, 4.2 Entity Definitions, 4. Core Entities & Data Model, AppLayout (Button Layout), Bestellposition (Order Item), Bestellung (Order), Drucker (Printer), Gutschein (Voucher) (+5 more)

### Community 21 - "cashier-view.test.tsx"
Cohesion: 0.25
Nodes (6): mockGetOpenTables, mockGetOrders, mockGetUnpaidByTable, mockPayItems, openTables, unpaidOrders

### Community 22 - "e2e/helpers/setup.ts"
Cohesion: 0.24
Nodes (8): adminHeaders(), cleanStaleEvents(), E2ESetup, loginViaUI(), setupEvent(), teardownEvent(), setupEvent(), TestContext

### Community 23 - "stations.ts"
Cohesion: 0.27
Nodes (12): createStationSchema, reorderSchema, stationRoutes(), updateStationSchema, createStation(), CreateStationData, deleteStation(), getStation() (+4 more)

### Community 24 - "guest-order.test.tsx"
Cohesion: 0.29
Nodes (5): barProducts, mockFetch, mockGetProducts, mockGetStations, stations

### Community 36 - "routes/auth.ts"
Cohesion: 0.33
Nodes (9): adminLoginSchema, authRoutes(), loginSchema, findWaiterForLogin(), getAdminPin(), getMeWaiter(), loginWaiterSelect, meWaiterSelect (+1 more)

### Community 38 - "i18n-parity.test.ts"
Cohesion: 0.40
Nodes (3): DE, EN, FR

### Community 39 - "waiters.ts"
Cohesion: 0.27
Nodes (12): createWaiterBody, toggleActiveBody, updateWaiterBody, waitersRoutes(), createWaiter(), CreateWaiterData, deleteWaiter(), getWaiter() (+4 more)

### Community 40 - "useSessionStore"
Cohesion: 0.17
Nodes (17): Event, Waiter, LanguagePicker(), LANGUAGES, ThemeSwitcher(), UserMenu(), Admin(), Landing() (+9 more)

### Community 41 - "Orderwas"
Cohesion: 0.05
Nodes (43): Abholscheine Mode (Pickup Slips), Acknowledgments, Advanced Features, Architecture, Bonkasse Mode (Voucher Cashier), Comparison with Bierblock, Comparison with Orderjutsu, Contributing (+35 more)

### Community 42 - "Orderwas — Requirements Document"
Cohesion: 0.29
Nodes (7): 11. Version History Analysis (Orderjutsu), 12. User Testimonials (from YouTube), 16. Next Steps, 1. Executive Summary, Key Value Proposition (from Orderjutsu's own marketing), Orderwas — Requirements Document, What Orderjutsu Is (and Isn't)

### Community 43 - "AGENTS.md — Orderwas"
Cohesion: 0.05
Nodes (35): After commits, AGENTS.md — Orderwas, Architecture Rules (binding — see ARCHITECTURE.md §3), Before planning any implementation, Commands, Database, Graph staleness, Graphify (Knowledge Graph) (+27 more)

### Community 44 - "3.4 Philipp's Specific Requirements"
Cohesion: 0.20
Nodes (10): 3.1 Hardware Architecture (Orderjutsu's Approach), 3.2 Software Architecture (Orderjutsu), 3.3 Orderwas Architecture (Proposed), 3.4 Philipp's Specific Requirements, 3. System Architecture, Database Strategy, Development Approach, Frontend Requirements (+2 more)

### Community 45 - "6. Workflow Descriptions"
Cohesion: 0.50
Nodes (4): 6.1 Service Mode Workflow, 6.2 Bonkasse (Voucher) Workflow, 6.3 Mixed Operation Workflow, 6. Workflow Descriptions

### Community 46 - "8. Technical Requirements"
Cohesion: 0.29
Nodes (7): 8.1 Performance, 8.2 Reliability, 8.3 Security, 8.4 Compatibility, 8.5 Scalability, 8.6 Internationalization, 8. Technical Requirements

### Community 47 - "Admin.tsx"
Cohesion: 0.17
Nodes (12): api, Printer, Station, AdminExport(), AdminSettings(), AdminTab, AdminEvents(), AdminPrinters() (+4 more)

### Community 48 - "17. Requirements from Live Review (2026-08-17)"
Cohesion: 0.33
Nodes (6): 17.1 Station Display Real-Time, 17.2 Landing Page Navigation, 17.3 Order Flow Loop, 17.4 Product Modifications / Extras (Orderjutsu Parity), 17.5 Full Order Lifecycle E2E Tests, 17. Requirements from Live Review (2026-08-17)

### Community 49 - "cashier-view-counter.test.tsx"
Cohesion: 0.40
Nodes (4): counterOpen, counterOrder, mockGetCounterUnpaid, mockPayItems

### Community 50 - "10. Competitive Analysis"
Cohesion: 0.40
Nodes (5): 10.1 Orderjutsu (Original), 10.2 Bierblock (Competitor), 10.3 Orderwas (Our Open-Source Clone), 10.4 Bierblock-Inspired Features for Orderwas, 10. Competitive Analysis

### Community 51 - "13. Implementation Roadmap"
Cohesion: 0.40
Nodes (5): 13. Implementation Roadmap, Phase 1: Core MVP (Weeks 1–4), Phase 2: Essential Features (Weeks 5–8), Phase 3: Advanced Features (Weeks 9–12), Phase 4: Polish & Scale (Weeks 13–16)

### Community 52 - "15. Appendix"
Cohesion: 0.40
Nodes (5): 15.1 Glossary, 15.2 Reference Links, 15.3 YouTube Videos Analyzed, 15.4 Screenshots, 15. Appendix

### Community 53 - "9. Hardware Requirements"
Cohesion: 0.40
Nodes (5): 9.1 Server (Base Station), 9.2 Printer Station, 9.3 Input Devices, 9.4 Total Hardware Cost, 9. Hardware Requirements

### Community 58 - "14. Success Criteria"
Cohesion: 0.50
Nodes (4): 14. Success Criteria, Community Requirements, Functional Requirements, Non-Functional Requirements

### Community 59 - "2. Target Audience & Use Cases"
Cohesion: 0.50
Nodes (4): 2.1 Primary Users, 2.2 User Roles, 2.3 Deployment Scenarios, 2. Target Audience & Use Cases

### Community 60 - "7. User Interface Requirements"
Cohesion: 0.50
Nodes (4): 7.1 Waiter App (Mobile), 7.2 Admin Interface (Web), 7.3 Kitchen Monitor, 7. User Interface Requirements

## Knowledge Gaps
- **395 isolated node(s):** `mockGetCounterUnpaid`, `mockPayItems`, `counterOrder`, `counterOpen`, `mockEvent` (+390 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Orderwas — Requirements Document` connect `Orderwas — Requirements Document` to `5.2 Advanced Features (Should-Have)`, `AGENTS.md — Orderwas`, `3.4 Philipp's Specific Requirements`, `6. Workflow Descriptions`, `8. Technical Requirements`, `17. Requirements from Live Review (2026-08-17)`, `10. Competitive Analysis`, `13. Implementation Roadmap`, `15. Appendix`, `4.2 Entity Definitions`, `9. Hardware Requirements`, `14. Success Criteria`, `2. Target Audience & Use Cases`, `7. User Interface Requirements`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `prisma` connect `src/index.ts` to `escpos.ts`, `orderService.ts`, `routes/auth.ts`, `waiters.ts`, `products.ts`, `vouchers.ts`, `layouts.ts`, `auditService.ts`, `stations.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `Orderwas` connect `Orderwas` to `AGENTS.md — Orderwas`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `buildServer()` (e.g. with `authPlugin()` and `auditRoutes()`) actually correct?**
  _`buildServer()` has 14 INFERRED edges - model-reasoned connections that need verification._
- **What connects `mockGetCounterUnpaid`, `mockPayItems`, `counterOrder` to the rest of the system?**
  _395 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06848425835767608 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._