# Plan: Fix Test Infrastructure Hang + Product Color Propagation

> Investigated 2026-08-24. No fixes applied yet — plan only.

## Issue 1: Vitest worker hang in order-page.test.tsx

### Symptoms
- Running all 16 tests: worker hangs silently after ~5 tests (timeout kills it, no output, `testTimeout` never fires)
- Each test passes individually and in small groups (`-t` filters)
- Other test files (22 tests across 5 files) pass fine
- Previously OOM'd (fixed by splitting Order.tsx into components); hang remained

### Root causes (verified by minimal repro)

**Minimal repro:** test A (render + click increment + assert cart-item) → test B (render + waitFor product) = HANG. B(div only) or B(no waitFor) passes.

1. **`mockReset()` during pending promise chains** — the `beforeEach` calls `mockReset()` on API mocks while test A's component still has unsettled promise callbacks (OrderPage's `api.getStations().then(...)` chain). Resetting mid-flight leaves the worker's microtask queue in a state where the next `waitFor` never resolves. `mockClear()` (keeps implementations, clears call history) fixes the 2-test repro.

2. **Un-cleaned long-press `setTimeout` in ProductSection** — `onPointerDown` starts a 500ms `setTimeout(() => onLongPress(product))`. There is no `useEffect` cleanup: when RTL unmounts the component between tests, the timer survives and fires `setVariantDialogProduct` on an unmounted component. fireEvent.click does NOT fire pointerUp, so the timer is never cleared in tests.

3. **Module-level/stale refs across renders** — `sectionRefs` and `sectionRefCallbacks` are `useRef<Map>` inside OrderPage, but `getSectionRef` caches callbacks in a Map keyed by station ID. On re-render (new mount), stale callbacks bound to removed DOM elements can be returned if the Map identity survives (React 18 StrictMode double-mount in dev/test mode makes this worse).

4. **Store subscriptions without selectors** — `useCartStore()` (no selector) in OrderPage, ProductSection, CartBar: every store change re-renders all three. Combined with 16 tests × multiple renders, this amplifies any leaked subscription.

### Fix plan

- [ ] **T1: Replace `mockReset()` with `mockClear()`** in `client/tests/order-page.test.tsx` beforeEach; move mock implementation setup OUT of beforeEach to module scope (`vi.fn().mockImplementation(...)` once) so implementations never get torn down between tests.
- [ ] **T2: Add unmount cleanup for long-press timer in ProductSection** — `useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])`. (This is a production bug too: navigating away mid-press opens the dialog on a dead page.)
- [ ] **T3: Clear `sectionRefCallbacks` cache correctly** — key the Map by mount instance or reset it when `sortedStations` changes; alternatively derive section refs via a single `useCallback` with `data-station-id` lookup instead of a Map cache.
- [ ] **T4 (optional hardening): use store selectors** — `useCartStore((s) => s.items)` in ProductSection/CartBar to cut re-render amplification.
- [ ] **T5: Verify** — full `npx vitest run tests/order-page.test.tsx` completes (16/16) under 30s; then whole client suite; then `npm test` at root.
- [ ] **T6: Add regression guard** — a CI-visible comment in the test file explaining the mockReset pitfall.

Expected effort: T1+T2 likely sufficient (they address both verified triggers); T3/T4 if the full file still hangs after T1+T2.

## Issue 2: Product colors not visible in waiter view

### Investigation results (API verified working)

- ✅ **PUT /products/:id with `{color}` persists correctly** — verified via curl against live server: `green-500` saved and read back. (Earlier "PUT doesn't work" observations were stale product IDs from a re-seeded DB — not a bug.)
- ✅ **GET /stations/:id/products returns `color`** — Prisma `findMany` without `select` returns all fields.
- ✅ **ProductSection applies colors** — imports `PRODUCT_BG_CLASSES`, uses them as button background + left border.

### Real root causes

1. **Seed sets no colors** (primary): all 15 seeded products have `color: null`. The user sees no colors because there are none. `seed.ts` contains an old `appLayout.buttons` array with colors (`'amber'`, `'red'`, `'gray'`) that is disconnected from the new `Product.color` field.

2. **Stale production build**: `client/dist` was built 08:48, before `PRODUCT_BG_CLASSES` was added (~11:30). Dev server (JIT) picks the classes up (verified `bg-amber-100` in dev CSS), but a `npm run build` hasn't run since — production/PWA would miss all 16 color classes.

3. **Admin list doesn't refresh on color change** (minor): `handleColorChange` calls `api.updateProduct` but never `onSaved()`, so the ● indicator in the product list appears only after closing/reopening the modal.

4. **Missing i18n keys** (minor): `admin.productColor`, `admin.noColor` exist in NO language file — UI falls back to hardcoded German strings in the picker.

### Fix plan

- [ ] **C1: Seed product colors** — add `color` to the 15 products in `server/prisma/seed.ts` (sensible mapping, e.g. beers amber, wines red/purple, cola gray/rose, schnitzel red, bratwurst orange, pommes yellow, coffee brown-ish → use `orange-500`/`amber-500` as closest, kuchen pink, tee teal). Re-seed.
- [ ] **C2: Call `onSaved()` after color change** in `handleColorChange` (Admin.tsx ProductEditModal) so the ● indicator refreshes immediately.
- [ ] **C3: Add missing i18n keys** `admin.productColor` / `admin.noColor` to de.json, en.json, fr.json (AGENTS.md parity rule — verify with the parity script).
- [ ] **C4: Rebuild** — `npm run build` so dist CSS contains all 16 color classes; verify `bg-rose-100` etc. appear in `client/dist/assets/*.css`.
- [ ] **C5: End-to-end verify** — set a color via admin UI (or curl), confirm tinted button in waiter view, colored cart chip, ● in admin list, colored dot on station display.

## Verification (whole plan)

```bash
cd /home/biephi/hermine/orderwas
npm run typecheck
npx prisma db seed  # in server/ — after C1
npm -w server run test                      # 242 pass
cd client && npx vitest run                 # 38 pass incl. order-page 16/16, no hang
cd .. && npm run build                      # dist contains color classes
# Manual: dev server, admin set color → waiter view shows tint
```
