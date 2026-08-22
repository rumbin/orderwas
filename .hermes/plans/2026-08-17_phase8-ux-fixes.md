# Orderwas Phase 8 — Bug Fixes & UX Improvements

> **For Hermes:** Implement these 6 fixes task-by-task.

**Goal:** Fix 6 user-reported issues across admin auth, waiter UX, product management, and export/import.

**Architecture:** Backend-first changes (routes/services), then frontend. All changes follow existing patterns.

---

## Task 1: Admin PIN Login

**Objective:** Require a PIN to access the admin page. Store admin PIN in env.

**Files:**
- Modify: `server/src/routes/auth.ts` — add `POST /api/auth/admin/login`
- Modify: `server/src/plugins/auth.ts` — add `requireAdminPin` hook
- Modify: `server/src/routes/config.ts` — guard export/import behind admin auth
- Modify: `server/src/index.ts` — add admin PIN env var
- Modify: `client/src/pages/Admin.tsx` — add PIN gate
- Modify: `client/src/stores/session.ts` — add admin token state
- Modify: `client/src/i18n/de.json` — add admin login strings
- Modify: `client/src/i18n/en.json`

**Implementation:**
1. Server: `ADMIN_PIN` env var (default: `admin`)
2. Server: `POST /api/auth/admin/login { pin }` → returns `{ token }` (JWT, 8h, claim `admin: true`)
3. Admin page: if no admin token, show PIN entry form; on submit, store token in session store
4. All `/api/events` CRUD, `/api/events/:id/*` routes guarded by admin auth hook
5. Export/import routes guarded by admin auth hook

---

## Task 2: Split +/- Product Buttons in Waiter UI

**Objective:** Product buttons split into left (decrement) and right (increment) halves.

**Files:**
- Modify: `client/src/pages/Order.tsx` — replace single-click product button with split button

**Implementation:**
- Each product card becomes a flex container: [− | name+price | +]
- Left third: click decrements cart item (if count > 0)
- Right third: click increments cart item
- Center: product name + price (non-clickable, shows current count badge)
- When count = 0, the minus side is visually disabled (grayed out)

---

## Task 3: Block Deletion of Products With Orders

**Objective:** Products referenced by orders cannot be deleted. Hide delete button.

**Files:**
- Modify: `client/src/pages/Admin.tsx` — check if product has been ordered before showing delete button
- Add: `server/src/routes/products.ts` — add `GET /api/products/:id/order-count` or include `orderCount` in list response

**Implementation:**
- Backend: modify `listProductsByStation` to include `_count: { orderItems: true }` in Prisma query
- Frontend: hide delete button when `p._count.orderItems > 0`
- Show a tooltip/badge "Wird verwendet" instead

---

## Task 4: Editable Product Prices

**Objective:** Admin can change product prices anytime. Orders keep their point-in-time price.

**Files:**
- Modify: `client/src/pages/Admin.tsx` — make price column editable
- No backend changes needed — price is already snapshotted in OrderItem at order creation

**Implementation:**
- Replace static price display with inline-editable input
- On blur/enter, call `api.updateProduct(id, { priceCents: newPrice })`
- Show confirmation toast

---

## Task 5: Remove AppLayout Editor, Add Product Sort

**Objective:** Remove confusing layout editor. Products sorted by drag-n-drop on admin page.

**Files:**
- Modify: `client/src/pages/Admin.tsx` — remove `appLayout` tab
- Modify: `client/src/pages/admin/AppLayout.tsx` — can be deleted or left unused
- Modify: `client/src/pages/Admin.tsx` (inline AdminProducts) — add drag-n-drop reordering
- Modify: `server/src/routes/products.ts` — add `PATCH /api/products/reorder`
- Modify: `server/src/services/productService.ts` — add `reorderProducts` function

**Implementation:**
- Admin Products page: implement simple drag-n-drop (HTML5 drag API, no library needed)
- On drop: call `PATCH /api/products/reorder { stationId, productIds: [ordered ids] }`
- Backend: update `sortOrder` for each product in the array
- Remove `appLayout` tab from admin sidebar

---

## Task 6: Export/Import Roundtrip CI Test

**Objective:** Verify export → import → re-export produces identical data.

**Files:**
- Create: `server/tests/integration/config.test.ts`

**Implementation:**
1. Seed DB via existing seed helpers
2. Export event → JSON
3. Import JSON → new event
4. Export new event → JSON2
5. Assert JSON and JSON2 are equal (ignoring event ID/name)
