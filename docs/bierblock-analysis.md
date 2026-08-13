# Bierblock Analysis — Features Beyond Orderjutsu

**Source:** https://bierblock.app/de/
**Date:** 2026-08-14

---

## Bierblock Feature Analysis

### Features NOT in Orderjutsu (Opportunities for Orderwas)

#### 1. **QR Code Table Ordering** ⭐ HIGH VALUE
**What it does:** 
- Admin creates tables in the system
- System generates unique QR codes per table
- QR codes can be printed and placed on tables
- Guests scan QR code with their phone camera
- Opens a mobile-friendly ordering page (no app install)
- Guest selects items, places order
- Order appears in the system for station staff

**Why it's valuable:**
- Eliminates the need for waiters at every table
- Guests can order at their own pace
- Reduces staff requirements significantly
- Modern "self-service" experience
- Works on any smartphone with a camera

**Implementation complexity:** MEDIUM
- Need: QR code generator, mobile ordering page, order routing
- No printer integration needed (orders go to kitchen monitor or existing printers)

**Recommendation:** ✅ INCLUDE IN PHASE 2 — High impact, moderate effort

---

#### 2. **Floor Plan Editor** ⭐ MEDIUM VALUE
**What it does:**
- Visual drag-and-drop editor
- Place tables, stations, bars on a map
- Assign table numbers
- See real-time order status per table
- Visual overview of the festival layout

**Why it's valuable:**
- Easier to understand than a list of table numbers
- Helps new volunteers navigate the venue
- Visual status indicators (table has open orders, etc.)
- Better planning tool

**Implementation complexity:** MEDIUM-HIGH
- Need: Canvas/SVG editor, drag-and-drop, real-time updates
- Can be simplified to a grid-based layout

**Recommendation:** 🟡 INCLUDE IN PHASE 3 — Nice to have, not critical

---

#### 3. **Browser-Based (PWA) — No App Install** ⭐ HIGH VALUE
**What it does:**
- Works in any modern browser
- No APK download required
- Just open a URL and start working
- Can be "installed" as PWA for offline use
- Works on iOS, Android, tablets, laptops

**Why it's valuable:**
- Zero friction for volunteers
- No "where do I download the app?" questions
- Works on personal devices (BYOD)
- Easier to support and update

**Implementation complexity:** LOW (if we build PWA from start)
- This is already in our architecture as PWA

**Recommendation:** ✅ ALREADY PLANNED — Core architecture decision

---

#### 4. **Real-Time Shared Overview** ⭐ HIGH VALUE
**What it does:**
- All helpers see the same live state
- No "is my order printed?" uncertainty
- Station staff sees orders as they come in
- Waiters can see when their order is being prepared
- Organizers see overall status

**Why it's valuable:**
- Eliminates shouting across the venue
- Reduces "where's my order?" questions
- Better coordination between teams
- Less chaos during peak times

**Implementation complexity:** LOW-MEDIUM
- Need: WebSocket or Server-Sent Events
- Real-time updates to all connected clients

**Recommendation:** ✅ INCLUDE IN PHASE 1 — Core feature

---

#### 5. **AI-Powered Post-Event Analytics** ⭐ LOW VALUE (for now)
**What it does:**
- Analyzes order patterns
- Suggests improvements for next event
- Identifies peak times, popular items
- Recommends staffing levels

**Why it's valuable:**
- Data-driven decision making
- Helps plan better events
- Identifies bottlenecks

**Implementation complexity:** HIGH
- Need: Data collection, analysis engine, AI/ML
- Can be simple statistics first, AI later

**Recommendation:** 🟢 INCLUDE IN PHASE 4 — Start with basic stats, add AI later

---

#### 6. **PDF Export** ⭐ MEDIUM VALUE
**What it does:**
- Export receipts as PDF
- Export table lists
- Export access credentials
- Print-ready documents

**Why it's valuable:**
- Paper backup for critical data
- Share with team members
- Archive for records
- No special software needed to view

**Implementation complexity:** LOW
- Need: PDF generation library
- Standard feature

**Recommendation:** ✅ INCLUDE IN PHASE 2 — Standard feature

---

#### 7. **Event Templates** ⭐ MEDIUM VALUE
**What it does:**
- Save event configuration as template
- Reuse drink lists, settings, layouts
- Quick setup for recurring events
- Share templates between organizers

**Why it's valuable:**
- Saves time for annual festivals
- Ensures consistency
- Reduces setup errors
- "Copy last year's festival" feature

**Implementation complexity:** LOW
- Need: Export/import JSON configuration
- Simple copy/paste mechanism

**Recommendation:** ✅ INCLUDE IN PHASE 2 — High value for recurring events

---

#### 8. **Referral Program** ⭐ LOW VALUE
**What it does:**
- Clubs refer other clubs
- Both get credit/discount
- Word-of-mouth marketing
- Community building

**Why it's valuable:**
- Organic growth
- Community engagement
- Reduces marketing costs

**Implementation complexity:** MEDIUM
- Need: Referral tracking, credit system
- More relevant for SaaS model

**Recommendation:** ❌ NOT APPLICABLE — We're open source, not SaaS

---

#### 9. **Demo Without Registration** ⭐ MEDIUM VALUE
**What it does:**
- Try the system without creating an account
- Full feature access in demo mode
- No time pressure
- No credit card required

**Why it's valuable:**
- Reduces friction to try
- Builds trust
- Easier evaluation
- "Kick the tires" before committing

**Implementation complexity:** LOW
- Need: Demo mode with sample data
- Local-only demo instance

**Recommendation:** ✅ INCLUDE IN PHASE 1 — Great for adoption

---

#### 10. **Offline Mode with Sync** ⭐ HIGH VALUE
**What it does:**
- Orders saved locally when offline
- Automatic sync when connection restored
- No data loss during WiFi issues
- Works in areas with poor connectivity

**Why it's valuable:**
- Critical for outdoor events
- Handles WiFi instability gracefully
- No lost orders
- Peace of mind for organizers

**Implementation complexity:** MEDIUM-HIGH
- Need: Service Workers, local storage, conflict resolution
- IndexedDB for offline data

**Recommendation:** ✅ INCLUDE IN PHASE 2 — Essential for reliability

---

## Feature Priority Matrix for Orderwas

### Phase 1 (MVP) — Must Have
1. ✅ **Real-time shared overview** — Core coordination
2. ✅ **Demo without registration** — Adoption driver
3. ✅ **Browser-based PWA** — Already planned
4. ✅ **ESC/POS printer support** — Orderjutsu compatibility

### Phase 2 — Should Have
5. ✅ **QR Code table ordering** — High impact, modern UX
6. ✅ **PDF export** — Standard feature
7. ✅ **Event templates** — Saves time for recurring events
8. ✅ **Offline mode with sync** — Reliability

### Phase 3 — Nice to Have
9. 🟡 **Floor plan editor** — Visual overview
10. 🟡 **Basic analytics** — Post-event insights

### Phase 4 — Future
11. 🟢 **AI-powered analytics** — Advanced insights
12. 🟢 **Multi-language support** — International expansion

---

## Key Differentiators: Orderwas vs Bierblock

| Feature | Bierblock | Orderwas |
|---------|-----------|----------|
| **Model** | Cloud SaaS | Self-hosted |
| **Pricing** | €299/year | Free |
| **Offline** | Limited | Full offline support |
| **Printers** | Browser only | ESC/POS network |
| **QR Ordering** | ✅ Yes | ✅ Yes (Phase 2) |
| **Floor Plan** | ✅ Yes | 🟡 Phase 3 |
| **AI Analytics** | ✅ Yes | 🟢 Phase 4 |
| **Source** | Closed | Open source |

---

## Recommendations Summary

### Include in Orderwas (High Priority)
1. **QR Code Table Ordering** — Modern self-service option
2. **Real-time Shared Overview** — Essential coordination
3. **Offline Mode with Sync** — Reliability for outdoor events
4. **Event Templates** — Time saver for recurring festivals
5. **PDF Export** — Standard feature
6. **Demo Mode** — Adoption driver

### Consider Later (Medium Priority)
7. **Floor Plan Editor** — Visual overview (Phase 3)
8. **Basic Analytics** — Post-event insights (Phase 3)

### Skip for Now (Low Priority)
9. **AI Analytics** — Too complex, add later
10. **Referral Program** — Not applicable for open source

---

## Implementation Notes

### QR Code Table Ordering — Simplified Approach
Instead of a full self-ordering system, start with:
1. **Table QR codes** that link to a mobile-friendly order page
2. **Simple product selection** (tap to add, swipe to remove)
3. **Order submission** with table number auto-detected from QR
4. **Notification to waiter** that table X has placed an order
5. **Waiter confirms** and sends to kitchen/bar

This keeps the human in the loop while reducing friction.

### Floor Plan Editor — Simplified Approach
Instead of a full canvas editor, use:
1. **Grid-based layout** (rows × columns)
2. **Drag-and-drop table placement**
3. **Color-coded status** (green=open, yellow=ordered, red=needs attention)
4. **Simple SVG export** for printing

This covers 80% of the value with 20% of the complexity.

---

*This analysis is based on Bierblock's website and feature descriptions. Actual implementation details may vary.*
