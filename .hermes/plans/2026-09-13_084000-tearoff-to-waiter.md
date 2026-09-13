# Plan: Move tearOffNumber from Event to Counter Waiter + Admin CRUD Fixes

## Git history status (reviewed 2026-09-13)

- Current branch: `feat/theke-counter` (10 commits ahead of `main`).
- **The dark/bright theme work is already merged into this branch**: `main` is fully
  an ancestor of `feat/theke-counter` (merge-base == main tip `21e17d8`), and
  `client/src/stores/theme.tsx` exists on this branch. Nothing left to merge —
  the theme commits came in before the Theke feature branched.
- **Uncommitted local changes on this branch** (from this session, not yet committed):
  - `client/src/components/CashierView.tsx` — counter mode pre-selects all items
  - `client/tests/cashier-view-counter.test.tsx` — updated counter cashier specs
  - `e2e/counter-flow.spec.ts` — E2E no longer clicks "Alle auswählen"
  - `server/tests/integration/waiters.test.ts` — waiter create→login test
- **Plan step 0 (commit first)**: commit the uncommitted changes as
  `feat: counter cashier pre-selects all items; waiter login test` BEFORE starting
  the tear-off migration, so the migration diff stays clean and reviewable.
- **Final step**: merge `feat/theke-counter` → `main` (fast-forward) after CI passes,
  since this branch will then contain theme + Theke + tear-off work.
- Repo rule reminder: GitHub FLOW feature branch → PR → merge → auto-deploy (leufke-site
  convention does not apply here; orderwas-theke has no GitHub remote push requirement —
  merge locally to main).

## Context
Two issues reported:
1. **Admin panel broken**: Can't edit Testfest or create new events
2. **Schema redesign**: `lastTearOffNumber` belongs on the counter waiter (Theke), not on the Event

## Changes

### 1. Schema (`server/prisma/schema.prisma`)
- **Remove** `lastTearOffNumber Int @default(0)` from Event
- **Add** `tearOffNumber Int @default(0)` to Waiter

### 2. Server

**`eventService.ts`**:
- Remove `lastTearOffNumber: 0` from test→live wipe transaction (line 44)
- Remove `lastTearOffNumber` from passthrough in `updateEvent`

**`orderService.ts`** (counter Bon logic):
- Read `waiter.tearOffNumber` instead of `event.lastTearOffNumber`
- Bump `waiter.tearOffNumber` instead of `event.lastTearOffNumber`

**`waiterService.ts`**:
- Include `tearOffNumber` in waiter select (so client can read it)

**`routes/events.ts`**:
- Remove `lastTearOffNumber` from `updateEventSchema`

**`routes/waiters.ts`**:
- Allow `tearOffNumber` in `updateWaiterBody`

### 3. Client

**`api/types.ts`**:
- Remove `lastTearOffNumber` from `Event` type
- Add `tearOffNumber` to `Waiter` type (only relevant for counter waiters)

**`pages/admin/Events.tsx`**:
- Remove the entire "Tear-off" column (editingTearOff state, input, display)
- Clean up the table

**`pages/Order.tsx`**:
- Change `nextBon` to read from `waiter.tearOffNumber` instead of `event.lastTearOffNumber`

### 4. Tests

**`server/tests/integration/events.test.ts`** — Add tests:
- Admin can create a new event via POST /api/events
- Admin can update an event name/status via PUT /api/events/:id

**`server/tests/integration/counter.test.ts`** — Update:
- Change `lastTearOffNumber` → `tearOffNumber` on waiter references

**`server/tests/integration/waiters.test.ts`** — Add:
- Test: admin can update tearOffNumber on the counter waiter

**`server/tests/unit/eventWipe.test.ts`** — Update:
- Remove lastTearOffNumber assertions on Event

**Client tests** — Update:
- `helpers/session.ts`: Remove `lastTearOffNumber` from makeEvent defaults
- `order-page-counter*.test.tsx`: Read nextBon from waiter mock
- `cashier-view-counter.test.tsx`: Update event mock
- `login*.test.tsx`, `app.test.tsx`, `cashier-view.test.tsx`, `order-cart-decrement.test.tsx`:
  Strip `lastTearOffNumber` from inline event fixtures (search confirmed these also
  carry it on `main`)

**`e2e/counter-flow.spec.ts`** — Update Bon pre-fill check

### 5. i18n
No changes needed — existing keys (`order.bonNumber`, `order.bonPlaceholder`) are fine.

## File Impact
```
Server:
  prisma/schema.prisma
  src/services/eventService.ts
  src/services/orderService.ts
  src/services/waiterService.ts
  src/routes/events.ts
  src/routes/waiters.ts
  tests/integration/events.test.ts (NEW test)
  tests/integration/counter.test.ts
  tests/integration/waiters.test.ts
  tests/unit/eventWipe.test.ts

Client:
  src/api/types.ts
  src/pages/admin/Events.tsx
  src/pages/Order.tsx
  tests/helpers/session.ts
  tests/order-page-counter-submit.test.tsx
  tests/order-page-counter.test.tsx
  tests/cashier-view-counter.test.tsx
  tests/login-flow.test.tsx
  tests/login.test.tsx

E2E:
  e2e/counter-flow.spec.ts
```

## Execution Order
1. Schema change + prisma generate
2. Server service & route changes
3. Client type + component changes
4. Server test updates
5. Client test updates
6. E2E test updates
7. Full CI pass
