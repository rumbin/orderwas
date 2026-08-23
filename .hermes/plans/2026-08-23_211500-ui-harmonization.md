# UI Harmonization Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Harmonize all pages with a shared user menu (avatar + dropdown), restructure the waiter view into 3 tabs, add "my orders only" filter, and extend dark mode to the station view.

**Architecture:** Shared `UserMenu` component used across all authenticated pages. Waiter view becomes a single page with 3 tabs ( Neue Bestellung / Offen / Abgeschlossen) replacing the current separate Order + Orders pages. Station view gets `UserMenu` + dark mode support.

**Tech Stack:** React 18, Tailwind CSS (dark mode via class), zustand, react-i18next

---

## Context

### Current State
- **Waiter view:** Two separate pages — `/order` (Order.tsx, product grid + cart) and `/orders` (Orders.tsx, order history)
- **Theme switcher:** Floating button at bottom-left on Landing, Login, Order, Orders pages
- **Station view:** Already dark-themed (bg-gray-900), no theme switcher, no user menu
- **Login:** No user menu (not authenticated yet), but has theme switcher
- **Landing:** No user menu, has theme switcher
- **Session store:** `useSessionStore` provides `{ event, waiter, token, clear, isLoggedIn }`
- **Theme store:** `useThemeStore()` from React Context in `stores/theme.tsx`

### Design Reference
- Station display (StationDisplay.tsx): dark theme, bg-gray-900 body, bg-gray-800 cards, white text, border-l-4 accents
- All pages already have `dark:` variants via Tailwind class-based dark mode

---

## Task 1: Create UserMenu Component

**Objective:** Shared avatar + dropdown menu component for all authenticated pages.

**Files:**
- Create: `client/src/components/UserMenu.tsx`

**Implementation:**

```tsx
import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSessionStore } from '@/stores/session'
import { useThemeStore } from '@/stores/theme'

export default function UserMenu() {
  const { t } = useTranslation()
  const { waiter, clear } = useSessionStore()
  const { dark, toggle } = useThemeStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!waiter) return null

  const initial = waiter.name.charAt(0).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center"
        data-testid="user-menu-button"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-11 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 w-56 z-50">
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-900 dark:text-white">{waiter.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{waiter.eventId ? '' : ''}</div>
          </div>
          <button
            onClick={toggle}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between"
          >
            <span>{dark ? '☀️ ' + (t('theme.light') ?? 'Hell') : '🌙 ' + (t('theme.dark') ?? 'Dunkel')}</span>
          </button>
          <button
            onClick={() => { clear(); window.location.hash = '#/' }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            data-testid="logout-button"
          >
            {t('common.logout') ?? 'Abmelden'}
          </button>
        </div>
      )}
    </div>
  )
}
```

**Verification:**
- `npm run typecheck` passes
- Component renders avatar with first letter
- Dropdown opens on click, closes on outside click
- Shows waiter name, theme toggle, logout

---

## Task 2: Add UserMenu to all authenticated pages, remove floating ThemeSwitcher

**Objective:** Replace the floating ThemeSwitcher with UserMenu in the header of every authenticated page. Remove the `<div className="fixed bottom-4 left-4">` ThemeSwitcher wrappers.

**Files:**
- Modify: `client/src/pages/Order.tsx` — add `import UserMenu from '@/components/UserMenu'`, add `<UserMenu />` to header, remove ThemeSwitcher wrapper
- Modify: `client/src/pages/Orders.tsx` — same
- Modify: `client/src/pages/Landing.tsx` — keep ThemeSwitcher (no logged-in user here, but theme still needed). Actually: Landing has no waiter session. Keep floating ThemeSwitcher here only.
- Modify: `client/src/pages/Login.tsx` — keep floating ThemeSwitcher (pre-login page)
- Modify: `client/src/pages/StationDisplay.tsx` — add UserMenu to header, add ThemeSwitcher via UserMenu

**Steps per page (Order.tsx, Orders.tsx, StationDisplay.tsx):**
1. Add `import UserMenu from '@/components/UserMenu'`
2. Add `<UserMenu />` to the right side of the header bar
3. Remove `<div className="fixed bottom-4 left-4 z-30"><ThemeSwitcher /></div>` wrapper
4. Remove `import ThemeSwitcher` if no longer used

**Pages that keep floating ThemeSwitcher:**
- `Landing.tsx` — not authenticated
- `Login.tsx` — not authenticated

**Verification:**
- `npm run typecheck` passes
- Avatar appears upper-right on Order, Orders, Station pages
- Clicking avatar shows dropdown with name, theme toggle, logout
- Floating theme button removed from authenticated pages
- Floating theme button still works on Landing and Login

---

## Task 3: Restructure waiter view into 3 tabs

**Objective:** Merge Order.tsx and Orders.tsx into a single page with 3 tabs: "Neue Bestellung", "Offen", "Abgeschlossen". The URL stays `/order` — the `/orders` route redirects to `/order`.

**Files:**
- Modify: `client/src/pages/Order.tsx` — add tab state + render Order cart/grid OR Orders list based on tab
- Modify: `client/src/pages/Orders.tsx` — keep as a component but remove its own header; export the order list render function
- Modify: `client/src/App.tsx` — redirect `/orders` → `/order`

**Implementation detail for Order.tsx:**

Add state: `const [tab, setTab] = useState<'new' | 'open' | 'done'>('new')`

Add a header tab bar with 3 buttons below the main header:
```tsx
<div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex gap-2 sticky top-[57px] z-10">
  <button onClick={() => setTab('new')} className={tab === 'new' ? 'active' : ''}>Neue Bestellung</button>
  <button onClick={() => setTab('open')} className={tab === 'open' ? 'active' : ''}>Offen</button>
  <button onClick={() => setTab('done')} className={tab === 'done' ? 'active' : ''}>Abgeschlossen</button>
</div>
```

When `tab === 'new'`: render the product grid + cart bar (current Order.tsx content)
When `tab === 'open'`: render open orders list (filtered from Orders.tsx logic)
When `tab === 'done'`: render closed orders list (filtered from Orders.tsx logic)

**App.tsx change:**
```tsx
if (route.path === '/orders') {
  // Redirect to /order
  return <OrderPage navigate={route.navigate} />
}
```

**i18n keys needed:**
- `order.tabNew`: "Neue Bestellung"
- `order.tabOpen`: "Offen"
- `order.tabDone`: "Abgeschlossen"

**Verification:**
- `npm run typecheck` passes
- 3 tabs appear below header
- Switching tabs shows correct content
- `/orders` URL redirects to `/order`

---

## Task 4: Add "my orders only" filter checkbox

**Objective:** On the Offen and Abgeschlossen tabs, show a checkbox (checked by default) that filters orders to only those belonging to the logged-in waiter.

**Files:**
- Modify: `client/src/pages/Order.tsx`

**Implementation:**

Add state: `const [onlyMyOrders, setOnlyMyOrders] = useState(true)`

On open/done tabs, render a checkbox row:
```tsx
{(tab === 'open' || tab === 'done') && (
  <div className="px-4 py-2 flex items-center gap-2">
    <input
      type="checkbox"
      id="only-my-orders"
      checked={onlyMyOrders}
      onChange={(e) => setOnlyMyOrders(e.target.checked)}
      className="w-4 h-4"
    />
    <label htmlFor="only-my-orders" className="text-sm text-gray-700 dark:text-gray-300">
      {t('order.onlyMyOrders') ?? 'Nur meine Bestellungen'}
    </label>
  </div>
)}
```

Filter logic:
```ts
const visibleOrders = onlyMyOrders ? allOrders.filter(o => o.waiterId === waiter?.id) : allOrders
```

**i18n keys:**
- `order.onlyMyOrders`: "Nur meine Bestellungen" / "Only my orders" / "Uniquement mes commandes"

**Verification:**
- Checkbox appears on Offen and Abgeschlossen tabs
- Checked by default → only shows logged-in waiter's orders
- Unchecking shows all waiters' orders
- State persists across tab switches within the session

---

## Task 5: Sort orders correctly

**Objective:** Open orders sorted ascending (oldest first), closed orders sorted descending (newest first). Both by tear-off number.

**Files:**
- Modify: `client/src/pages/Order.tsx`

**Implementation:**

```ts
const sortedOpen = [...openOrders].sort((a, b) => (a.tearOffNumber ?? 0) - (b.tearOffNumber ?? 0))
const sortedDone = [...closedOrders].sort((a, b) => (b.tearOffNumber ?? 0) - (a.tearOffNumber ?? 0))
```

**Verification:**
- Open tab: orders sorted ascending by tear-off number
- Done tab: orders sorted descending by tear-off number

---

## Task 6: Add dark mode + UserMenu to Station view

**Objective:** Station view already has dark styling (hardcoded bg-gray-900). Add `dark:` variants to all its classes so it responds to the theme toggle. Add UserMenu to its header.

**Files:**
- Modify: `client/src/pages/StationDisplay.tsx`

**Steps:**
1. Add `import UserMenu from '@/components/UserMenu'`
2. Add `<UserMenu />` to the header right side (next to the refresh button)
3. The station view is already dark-themed. For light mode, add light variants: `bg-gray-50 dark:bg-gray-900`, `bg-white dark:bg-gray-800`, etc.
4. Add `import { useThemeStore } from '@/stores/theme'` is not needed — UserMenu handles theme

**Note:** Station display is always dark in current design. For light mode, the cards would become `bg-white dark:bg-gray-800` and body `bg-gray-50 dark:bg-gray-900`. The text needs `text-gray-900 dark:text-white` everywhere.

**Verification:**
- `npm run typecheck` passes
- UserMenu appears in station header
- Theme toggle in UserMenu works on station page
- Station page has light/dark variants

---

## Task 7: Update tests

**Objective:** Fix any tests that reference removed elements (floating ThemeSwitcher, separate /orders route).

**Files:**
- Modify: `client/tests/app.test.tsx` — update `/orders` route assertion
- Modify: `client/tests/order-page.test.tsx` — add tab assertions if needed
- Modify: `client/tests/login.test.tsx` — no change (pre-auth page keeps ThemeSwitcher)

**Verification:**
- `npm test` passes all tests

---

## Task 8: i18n updates

**Objective:** Add all new translation keys.

**Files:**
- Modify: `client/src/i18n/de.json`
- Modify: `client/src/i18n/en.json`
- Modify: `client/src/i18n/fr.json`

**Keys:**
```json
"order": {
  "tabNew": "Neue Bestellung" / "New Order" / "Nouvelle commande",
  "tabOpen": "Offen" / "Open" / "Ouvert",
  "tabDone": "Abgeschlossen" / "Closed" / "Terminé",
  "onlyMyOrders": "Nur meine Bestellungen" / "Only my orders" / "Uniquement mes commandes"
}
```

---

## Task 9: Final verification

**Steps:**
1. `npm run typecheck` — passes
2. `npm test` — all tests pass
3. `npm run build` — build succeeds
4. `cd server && npx prisma db seed` — DB seeded
5. Manual check: all pages show UserMenu upper-right, theme toggle in dropdown, 3 waiter tabs, filter checkbox, correct sorting

---

## Risks / Open Questions

1. **Merge complexity:** Merging Orders.tsx into Order.tsx creates a large file. Consider extracting the order list into a separate component (e.g., `OrderList.tsx`) to keep Order.tsx manageable.
2. **Station display light mode:** The station display was designed dark-only. Making it work in light mode requires careful color mapping. May need a dedicated design pass.
3. **Tab state on navigation:** If the waiter switches to "Offen" tab and navigates away and back, the tab state resets. Consider persisting tab in the session store or URL hash.
