# OrderWas UI Fixes: Cashier Item Display & Station Paid Orders

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix two UI issues in the OrderWas app: (1) Cashier view should show individual items with customizations instead of aggregating by order, and (2) Station display should show paid orders until delivery is complete.

**Architecture:** 
- Issue 1: Flatten the order-grouped display in CashierView to show each item as its own row, including options/comment if present
- Issue 2: Remove the `status === 'paid'` filter from StationDisplay's loadOrders, keeping only `done` and `cancelled` as terminal states for station view

**Tech Stack:** React, TypeScript, Tailwind, Vitest

---

## Issue 1: Cashier View Individual Item Display

### Task 1: Flatten item display in CashierView

**Objective:** Show each order item as its own row instead of grouping by order

**Files:**
- Modify: `client/src/components/CashierView.tsx`

**Current behavior (lines 199-255):**
```tsx
{orders.map((order) => (
  <div key={order.orderId} className="border ...">
    {/* Order header */}
    <div className="...">#{order.tearOffNumber}...</div>
    {/* Items */}
    <div className="divide-y ...">
      {order.items.map((item) => (...))}
    </div>
  </div>
))}
```

**New behavior:**
Flatten all items across all orders into a single list, showing:
- Item name with quantity
- Customization (comment) if present
- Options (parsed from JSON) if present and not empty
- Price or paid status

**Implementation:**
```tsx
{/* Items - flat list */}
<div className="space-y-1">
  {orders.flatMap((order) =>
    order.items.map((item) => {
      const isPaid = !!item.paidAt
      let parsedOptions: { extraName: string; optionName: string }[] = []
      try { if (item.options) parsedOptions = JSON.parse(item.options) } catch { /* ignore */ }
      
      return (
        <div
          key={item.id}
          onClick={() => !isPaid && toggleItem(item.id, isPaid)}
          className={`flex items-center justify-between px-3 py-2.5 rounded ${
            isPaid
              ? 'opacity-50 bg-gray-50 dark:bg-gray-700/30'
              : 'active:bg-gray-100 dark:active:bg-gray-700 cursor-pointer'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {!isPaid ? (
              <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                selected.has(item.id)
                  ? 'bg-blue-600 border-blue-600'
                  : 'border-gray-300 dark:border-gray-500'
              }`}>
                {selected.has(item.id) && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
            ) : null}
            <div className="flex flex-col">
              <span className={`text-sm ${isPaid ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                {item.quantity}× {item.productName}
              </span>
              {(item.comment || parsedOptions.length > 0) && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {item.comment && <span>{item.comment}</span>}
                  {item.comment && parsedOptions.length > 0 && <span>, </span>}
                  {parsedOptions.map((o, i) => (
                    <span key={i}>{o.extraName}: {o.optionName}{i < parsedOptions.length - 1 ? ', ' : ''}</span>
                  ))}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isPaid ? (
              <span className="text-xs text-green-600 dark:text-green-400">✓ {t('cashier.itemPaid')}</span>
            ) : (
              <span className="text-sm font-mono text-gray-900 dark:text-white">{formatCents(item.lineTotalCents)}</span>
            )}
          </div>
        </div>
      )
    })
  )}
</div>
```

**Step 1: Implement the change**
- Replace the order-grouped rendering with flat item list
- Remove the order header sections

**Step 2: Run tests**
```bash
cd /home/biephi/hermine/orderwas && npm run typecheck
cd /home/biephi/hermine/orderwas && npm test -- --run client/tests/cashier-view.test.tsx
```

**Step 3: Commit**
```bash
git add client/src/components/CashierView.tsx
git commit -m "fix(cashier): show individual items with customizations instead of order groups"
```

---

## Issue 2: Station Display Paid Orders Visibility

### Task 2: Remove paid status filter from StationDisplay

**Objective:** Show paid orders in station view until all items are delivered

**Files:**
- Modify: `client/src/pages/StationDisplay.tsx:33`

**Current code (line 33):**
```tsx
if (o.status === 'done' || o.status === 'paid' || o.status === 'cancelled') return false
```

**New code:**
```tsx
if (o.status === 'done' || o.status === 'cancelled') return false
```

**Rationale:**
- Payment status is a financial concern, not a fulfillment concern
- Stations need to see orders until items are delivered, regardless of payment
- The "paid" status on the order level doesn't mean items are delivered
- Focus shifts from payment status to fulfillment status (item.status)

**Step 1: Implement the change**
- Remove `o.status === 'paid'` from the filter on line 33

**Step 2: Run tests**
```bash
cd /home/biephi/hermine/orderwas && npm run typecheck
cd /home/biephi/hermine/orderwas && npm test -- --run client/tests/station-display.test.tsx
```

**Step 3: Commit**
```bash
git add client/src/pages/StationDisplay.tsx
git commit -m "fix(station): show paid orders until delivery is complete"
```

---

## Verification

### Task 3: Run full CI

**Objective:** Ensure all changes pass typecheck, unit tests, and build

**Step 1: Run CI**
```bash
cd /home/biephi/hermine/orderwas && npm run ci
```

Expected: All checks pass

**Step 2: Manual verification**
- Open the app and navigate to the Cashier (Kassieren) tab
- Verify items are displayed individually with customizations shown
- Navigate to a station display
- Verify paid orders remain visible until marked as done

---

## Files Changed

1. `client/src/components/CashierView.tsx` - Flatten item display, show customizations
2. `client/src/pages/StationDisplay.tsx` - Remove paid status filter

## Notes

- Both changes are purely UI/logic changes, no database schema changes needed
- Issue 2 affects the "orders" view in StationDisplay, not the "products" aggregation view
- The "done" view in StationDisplay already correctly shows completed orders
- Customization display uses existing `comment` and `options` fields from TableOrderItem
