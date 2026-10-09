# Plan: Tear-off / Bon numbering — restore event-wide uniqueness?

> Investigated 2026-10-04. **No code changes yet — plan only, awaiting decision.**
> Trigger: review of `1ebda01` ("move tearOffNumber from Event to Waiter").

## What changed in `1ebda01`

| | before | after |
|---|---|---|
| counter location | `Event.lastTearOffNumber` | `Waiter.tearOffNumber` |
| auto-assigned numbers | one sequence **per event** | one sequence **per waiter** |
| test→live wipe | `lastTearOffNumber: 0` in the same transaction | only deletes orders — **no reset** |
| pinned Bon clash check | `where: { eventId, tearOffNumber }` (event-wide) | unchanged (still event-wide) |

The refactor was scoped in the plan as "counter Bon logic", but the assignment path in
`orderService.create()` is shared by **all** orders (table, pickup, guest, counter), so
every waiter now runs its own independent sequence.

## Evidence (throwaway probe, `server/tests/integration/tmp-tearoff-probe.test.ts`, deleted)

```
PROBE waiterA first order tearOff = 1 | waiterB first order tearOff = 1
PROBE pinned counter Bon = 1          | table order tearOff = 1
PROBE tear-off distribution: [{"_count":2,"tearOffNumber":1}]
```

Two different waiters' first orders collide, and a table order can duplicate a
counter-pinned Bon **within the same event**.

## Why it matters

1. **Inconsistent invariant.** The pinned path rejects a duplicate event-wide
   (`409 Bon number N is already in use`), while the auto path can produce exactly
   that duplicate without any check. Same number, two rules.
2. **Receipts carry the number.** `escpos.ts` prints `Bon-Nr: n` on every non-counter
   receipt, and the station display shows `#n` — duplicates make the number
   ambiguous as a cross-check on a receipt.
3. **Documentation is now false.** `docs/ARCHITECTURE.md` lines 90, 96, 128 and 155
   all still describe the event-wide counter (`tearOffNumber = atomic event counter++`).

## Related, same root cause: the test→live reset

- Old wipe: `prisma.event.update({ data: { lastTearOffNumber: 0 } })` inside the transaction.
- New wipe: order deletion only.
- But `eventService.updateEvent`'s doc comment still says "wipes all orders **and resets
  the tear-off counter**", `server/tests/unit/eventWipe.test.ts:43` is *named*
  "…resets tear-off counter on the waiter" (the body never asserts a reset), and
  `docs/REQUIREMENTS.md` §18 states "**Bon numbers reset per event.**"

So either the code should reset, or three documents/test names should stop claiming it.

## Options

### A. Restore event-wide uniqueness (recommended)

- Re-add `Event.lastTearOffNumber Int @default(0)`; auto-assignment increments it again.
- Keep `Waiter.tearOffNumber` **only** as the Theke's own pinned-Bon high-water mark —
  it drives the counter pre-fill (`Order.tsx` reads `waiter.tearOffNumber + 1`) and is
  bumped when the counter pins a number.
- Pinning also advances the event counter (`max(event, pinned)`) so the two can never
  diverge; the existing event-wide clash check stays correct.
- Restore `lastTearOffNumber: 0` in the test→live wipe.
- Result: one invariant everywhere, docs stay true, counter pre-fill unchanged.

**Files:** `server/prisma/schema.prisma`, `services/orderService.ts`,
`services/eventService.ts`, `routes/events.ts`, `client/src/api/types.ts`,
`pages/admin/Events.tsx` (no tear-off column was removed there — verify nothing needs it),
`tests/**` (`tearoff-burst`, `eventWipe`, `counter`, client fixtures), plus
`docs/ARCHITECTURE.md` only if wording needs touching.
**Schema change ⇒** `npx prisma db push --force-reset && npx prisma generate && npx prisma db seed`.

### B. Keep per-waiter sequences, make it a real invariant

- Accept that numbers are unique **per waiter**, not per event.
- Relax the pinned clash check to match (otherwise the 409 is stricter than reality).
- Rewrite ARCHITECTURE 90/96/128/155, REQUIREMENTS §18, the `eventWipe` test title and
  the `updateEvent` doc comment; decide separately whether the wipe resets *waiter*
  counters.
- Add a regression test asserting the intended semantics.

Trade-off: simpler schema, but "unique per waiter" has to be a deliberate product
decision — nothing in the requirements says numbers may repeat inside an event.

### C. Document-only (not recommended)

No code change; document per-waiter behavior and live with the 409-vs-auto inconsistency.

## Verification (whatever is chosen)

- New integration test covering the chosen invariant: concurrent orders from **two**
  waiters + a pinned counter Bon → numbers behave as specified.
- `eventWipe` test asserts the reset (or explicitly asserts no reset).
- `npm run ci` green; re-seed the DB afterwards.

## Open questions for Philipp

1. A or B?
2. Does test→live reset the sequence? (old behavior: yes)
3. `main` is 16 commits ahead of `origin/main` — push now?

---

## Decision (2026-10-04, Philipp)

Neither A nor B as sketched: **tear-off numbers are unique per counter (Theke), not per
event, and are overridable on every order registered at that counter.** The next number
is *the last order registered at that counter + 1* — **never** a stored maximum, because
an exhausted tear-off block is replaced by a new one that starts at 1 again.

Implemented:
- `orderService`: counter orders take the entered number as given (no event-wide 409,
  no `max()` bookkeeping); auto-assignment at the counter reads the last order of that
  counter (`nextBonAfterLastOrder`). Regular waiters keep their own atomic sequence.
- New `GET /api/events/:eventId/counter/next-bon` drives the order-page pre-fill
  (client no longer reads `waiter.tearOffNumber`).
- Repeat numbers are legitimate, so the duplicate-Bon 409 is gone.
- test→live wipes orders, which restarts the Theke at Bon 1 automatically; the
  misleading "resets the tear-off counter" comments/test title were corrected to match.
- Tests: counter suite covers override, new-block restart, next-bon derivation and
  per-counter isolation; `eventWipe` asserts the implicit restart.
