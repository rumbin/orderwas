# AGENTS.md — Orderwas

> **Read first:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (binding), [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
> **Query Graphify FIRST:** Before investigating structure, tracing bugs, or planning features, always run `graphify explain`, `graphify query`, or `graphify path` to understand the relevant modules and their connections. Read `graphify-out/GRAPH_REPORT.md` for community hubs. The graph is rebuilt automatically via post-commit hook — check staleness with `git rev-parse HEAD` vs the hash in GRAPH_REPORT.md.
> **Plan:** [.hermes/plans/2026-08-14_001530-orderwas-implementation.md](.hermes/plans/2026-08-14_001530-orderwas-implementation.md)

## What This Is

Open-source ordering + receipt-printing system for club festivals (Vereinsfeste). Clone of Orderjutsu. PWA frontend, Fastify backend, SQLite, ESC/POS printers, item-level cashier (Kassieren). GPL-3.0. **Not a cash register** — no TSE in v1.

## Tech Stack

- **Backend:** Node.js 20+, TypeScript strict, Fastify 5, Prisma 5, SQLite (WAL), Socket.io, Zod
- **Frontend:** React 18, Vite 5, TypeScript, Tailwind, zustand, react-i18next, PWA (vite-plugin-pwa)
- **Testing:** Vitest (unit + integration), Playwright (E2E)
- **Money:** Integer cents everywhere (`priceCents`, `totalCents`, `taxRateBps` as basis points). Never Float.

## Repository Layout

```
server/          Fastify backend (src/routes, src/services, src/plugins, src/printer, src/websocket)
client/          React PWA (src/api, src/stores, src/pages, src/components, src/i18n, src/lib)
client/src/pages/admin/   Admin sub-pages (Stations, Waiters, Printers, Products, Settings, Export)
e2e/             Playwright E2E tests
docs/            Architecture, requirements, design decisions, research
scripts/         pre-commit hook, install-hooks.sh
.hermes/plans/   Implementation plan
```

## Architecture Rules (binding — see ARCHITECTURE.md §3)

1. **Routes are thin.** Zod parse → one service call → HTTP response. No Prisma in routes.
2. **Services own business logic.** Order creation, total calculation, tear-off assignment, stock, print dispatch — all in `server/src/services/`.
3. **Pin is write-only.** Accepted on create/update, verified by `/api/auth/login`, never selected into any response. The `waiterSelect` object in `routes/waiters.ts` is the canonical select — add new fields there, never add `pin`.
4. **Money is integer cents.** `priceCents Int`, `totalCents Int`, `taxRateBps Int`. API exposes cents; client formats.
5. **Side effects fan out from services, not routes.** Order creation triggers: persist → tear-off → (future) stock decrement → (future) print dispatch → (future) WebSocket emit.

## Commands

```bash
# Full CI (run before declaring a phase done)
npm run ci                    # typecheck → unit tests → build → E2E tests

# Individual checks
npm run typecheck             # tsc --noEmit for server + client
npm test                      # Vitest unit + integration (server + client)
npm run test:e2e              # Playwright (auto-starts backend + frontend)
npm run build                 # tsc + vite build (both workspaces)

# Development
npm run dev                   # concurrently runs server (tsx watch) + client (vite)
npm -w server run dev         # backend only (http://localhost:3000)
npm -w client run dev         # frontend only (http://localhost:5173, proxies /api → :3000)

# Database (server/)
cd server && npx prisma db push --force-reset   # wipe + recreate schema (dev only!)
cd server && npx prisma db seed                 # seed Testfest event with data
cd server && npx prisma generate                # regenerate Prisma client after schema changes
```

## Database

- SQLite in `server/prisma/orderwas.db` (gitignored). WAL mode enabled at runtime.
- Schema: `server/prisma/schema.prisma` — the source of truth for all entities.
- Seed: `server/prisma/seed.ts` — creates event "Testfest", 3 stations, 15 products, 2 waiters (Alice/1234, Bob/5678).
- **After schema changes:** `npx prisma db push --force-reset && npx prisma generate && npx prisma db seed`

## Testing Conventions

- **TDD:** Write failing test → implement → pass → commit. See the plan for per-task TDD steps.
- **Server tests:** `server/tests/integration/` (Fastify inject, real SQLite), `server/tests/unit/` (services, no HTTP).
- **Test isolation:** Integration tests share one SQLite DB; `fileParallelism: false` in `server/vitest.config.ts` prevents cross-suite interference. Each suite cleans up in `beforeEach`/`afterAll` using FK-safe deletion order (OrderItem → Order → Product → Waiter → Station → Event).
- **Client tests:** `client/tests/` with jsdom + @testing-library/react.
- **Client store mocks must be identity-stable:** build session fixtures with
  `client/tests/helpers/session.ts` (`makeEvent`, `makeWaiter`, `makeCounterWaiter`,
  `resetSessionState`, `useSessionStoreMock`) instead of constructing the state object
  inside the `vi.mock` factory. A fresh object per render makes every `[event]`-keyed
  effect re-run; because those effects `setState`, the loop outlives the test and the
  vitest worker hangs with **no output** (exit 124) rather than failing a test. The mock
  must be async — `vi.mock('@/stores/session', async () => ({ useSessionStore: (await
  import('./helpers/session')).useSessionStoreMock }))` — because `vi.mock` is hoisted
  above the file's imports.
- **Effect deps are primitives:** key page-component effects on `event.id`, not on the
  `event` object, so an unrelated store update cannot trigger refetch loops.
- **E2E:** `e2e/playwright.config.ts` auto-starts both servers via `webServer`. Tests run against seeded DB.

## Pre-commit Hook

`scripts/pre-commit` runs typecheck + unit tests + build. Installed via `scripts/install-hooks.sh` (also `npm install` triggers `postinstall`). Fast feedback only — E2E is in `npm run ci`, not the hook.

## Graphify (Knowledge Graph)

Graphify builds a queryable knowledge graph of the codebase (`graphify-out/graph.json`). **Always query it first** when investigating project structure, tracing bugs, or planning features — it reveals module connections, call chains, and community boundaries faster than grepping.

### ⚠️ Mandatory: Query Graphify before any investigation

Before writing code, reading files, or tracing a bug path:

1. `graphify explain "<file>.ts" .` — understand what a module does and its dependencies
2. `graphify query "How does <feature> work?" .` — BFS traversal across the full call chain
3. `graphify path "Source" "Target" .` — shortest path between two modules
4. Read `graphify-out/GRAPH_REPORT.md` — god nodes, surprising connections, community structure

Do NOT skip this step. Grepping and `read_file` are fallbacks for details the graph doesn't cover — the graph is the primary orientation tool.

### Before planning any implementation

Query the graph to understand affected modules and their connections:

```bash
graphify query "How does <feature> work?" .     # BFS traversal — broad context
graphify path "ModuleA" "ModuleB" .              # shortest path between two concepts
graphify explain "orderService.ts" .             # plain-language explanation of a node
```

Read `graphify-out/GRAPH_REPORT.md` for god nodes (highest-degree concepts), surprising connections, and community structure.

### After commits

A **post-commit git hook** (installed by `graphify hook install`) automatically rebuilds the graph after every commit. No manual step needed — the graph stays current.

To manually refresh after large changes or if the hook was skipped:

```bash
graphify update .           # incremental — re-extracts only changed files (no LLM cost)
graphify cluster-only .     # re-cluster + regenerate GRAPH_REPORT.md
```

### Graph staleness

`GRAPH_REPORT.md` records the commit hash it was built from. If `git rev-parse HEAD` differs, the graph may be stale — run `graphify update .`.

## i18n

German-first. Translation files: `client/src/i18n/de.json` (primary), `en.json`, `fr.json`. All UI strings through `t()` — no hardcoded strings.

### ⚠️ Mandatory: All 3 languages must have identical key sets (bidirectional)

Every key added to `de.json` MUST also be added to `en.json` and `fr.json` in the same commit — and keys must not exist in only one of EN/FR. Parity is enforced automatically and bidirectionally by **`client/tests/i18n-parity.test.ts`** (DE↔EN↔FR identical key sets; no orphans; all values non-empty), which runs as part of the client vitest suite and therefore `npm run ci`.

When you add/remove i18n keys, expect the parity test to fail until all three files are updated — that automated test is the gate.

```bash
cd client && npx vitest run tests/i18n-parity.test.ts
```

## What NOT to Do

- Don't return `pin` in any API response (use `waiterSelect`).
- Don't use Float for money (use integer cents).
- Don't put Prisma calls in route handlers (use services).
- Don't run `deleteMany({})` without FK-safe order (OrderItem first, Event last).
- Don't commit `*.db`, `*.db-shm`, `*.db-wal` files (gitignored).
- Don't add TSE, multi-tenant, or floor-plan features — they're v1 non-goals (ARCHITECTURE.md §10).
- Don't rebuild zustand mock state inside the `vi.mock` factory (per-render identity → effect loop → silent vitest worker hang). Use `client/tests/helpers/session.ts`.