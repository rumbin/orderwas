---
name: orderwas-development
description: "TDD workflow for Orderwas: schema changes, tests, CI, and conventions."
version: 0.1.0
author: Philipp Leufke, Hermes Agent
license: GPL-3.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [orderwas, tdd, prisma, fastify, react]
    related_skills: [test-driven-development]
---

# Orderwas Development

## When to Use

- Implementing tasks from the Orderwas implementation plan
- Making schema changes (Prisma/SQLite)
- Writing or modifying tests for the Orderwas monorepo
- Running the CI pipeline or debugging test failures

## Prerequisites

- Node.js 20+, npm (workspaces)
- Working directory is the `orderwas/` repo root
- `npm install` has been run (also installs pre-commit hooks)

## Schema Change Cycle

After modifying `server/prisma/schema.prisma`:

```bash
cd server
npx prisma db push --force-reset   # wipe DB + apply new schema (dev only!)
npx prisma generate                 # regenerate Prisma Client types
npx prisma db seed                  # reseed Testfest data
```

**Pitfall:** The global Prisma client singleton (`server/src/db/client.ts`) may cache old types. If TypeScript sees stale types after `generate`, restart tsx/vitest. The `.catch(() => {})` in `seed.ts` handles fresh databases where tables don't exist yet.

## TDD Cycle (per task)

1. Write failing test in `server/tests/integration/` (API-level) or `server/tests/unit/` (service-level)
2. Run `npm -w server run test` — confirm FAIL
3. Implement minimal code in `src/services/` (business logic) or `src/routes/` (thin HTTP layer)
4. Run `npm -w server run test` — confirm PASS
5. `git commit` — pre-commit hook runs typecheck + unit + build

## Test Isolation Rules

Integration tests share one SQLite database. `fileParallelism: false` in `server/vitest.config.ts` prevents cross-suite interference.

**FK-safe cleanup order is non-negotiable:**
```
OrderItem → Order → Product → Waiter → Station → Event
```

Deleting in wrong order throws `Foreign key constraint violated`.

Each test suite uses `beforeEach` + `afterAll` with this order. Unit tests create their own isolated data per `beforeEach`.

## CI Pipeline

```bash
npm run ci    # typecheck → unit tests → build → E2E tests
```

E2E auto-starts backend + frontend via Playwright `webServer` config. Run the full CI before declaring a phase done. Pre-commit hook only runs typecheck + unit + build (fast feedback).

## Money Conventions

- `priceCents: Int`, `totalCents: Int`, `taxRateBps: Int` (2000 = 20.00%)
- API exposes cents; client formats with `(cents/100).toFixed(2)`
- Never use Float for monetary values

## Pitfalls

- **SQLite write serialization:** True parallel `Promise.all` transactions time out. Test sequential ordering instead. WAL mode + 30s transaction timeout help but don't eliminate this.
- **Pin secrecy:** All waiter responses use `waiterSelect` excluding `pin`. Never add `pin: true` to select objects.
- **Stale Prisma types:** After `prisma generate`, the LSP may show false errors. Run `tsc --noEmit` to check for real errors.

## Verification

- `npm run typecheck` passes
- `npm test` passes (all suites green)
- `npm run build` succeeds (both workspaces)
- `npm run ci` passes (full pipeline including E2E)