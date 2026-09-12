# Orderwas — Requirements Document

**Based on:** Analysis of [Orderjutsu](https://orderjutsu.org/) (orderjutsu.org, wiki.orderjutsu.org)
**Date:** 2026-08-14
**Status:** Draft

> **Implementation status (as of 2026-08-29, after remediation Phases 0–5).** The following are **implemented and covered by automated tests** (server unit+integration, client, E2E): waiter/admin authentication and authorization (`canCashOut`/`canCancel`/`canTransfer`/`canStatistics`/admin) with the `AUTH_ENFORCED` global guard and JWT-enforced WebSocket; unified order-level + item-level payment (`POST /orders/:id/pay`, `POST /orders/:id/reopen`, `POST /orders/pay-items`) under the invariant *order `paid` ⇔ all non-cancelled items paid*; race-safe **stock** checks inside the order transaction (single-winner, no TOCTOU); atomic **voucher** redemption (unique code → 409 on duplicate; conditional update → 409 on double-redeem); **guest QR** ordering attributed to a hidden per-event ghost waiter named "Gast" (invalid token 400, unknown event 404, insufficient stock 409); **reports & audit** (`GET /events/:eventId/report/*`, `/audit`, `POST /products/:id/settle`, `POST /events/:eventId/settle`); structured **product extras** (§17.4); and full-lifecycle E2E coverage (§17.5). The checkboxes below that still list these as open are **requirements/roadmap artifacts** of the original analysis, not the current state — see [docs/ARCHITECTURE.md](ARCHITECTURE.md) §5/§8 for the authoritative behavior.

---

## 1. Executive Summary

**Orderwas** is an open-source clone of **Orderjutsu**, an Austrian ordering and receipt-printing system designed for **club festivals** (*Vereinsfeste*) — particularly fire department festivals, music club events, and similar community gatherings.

### What Orderjutsu Is (and Isn't)

Orderjutsu is a **Bestellsystem** (ordering system) and **Boniersystem** (receipt printing system), **NOT** a full cash register (*Registrierkasse*). It is explicitly designed for:

- Clubs/associations organizing festivals
- Volunteers with **zero technical training** as cashiers
- **Offline-first** operation (no internet required)
- **Speed** — orders arrive at the bar/kitchen before the waiter leaves the table

### Key Value Proposition (from Orderjutsu's own marketing)

> *"Du willst ja kein Gasthaus aufmachen, sondern zufriedene Gäste, viel Umsatz und Leute, die nächstes Jahr wieder gerne helfen!"*
> (You don't want to open a restaurant — you want happy guests, good revenue, and people willing to help again next year!)

---

## 2. Target Audience & Use Cases

### 2.1 Primary Users
- **Vereinsfeste** (club festivals): fire departments, music clubs, sports clubs
- Typical scale: 50–500+ guests, 10–30 tables, 4–12 waiters
- Venue: outdoor tents, festival grounds, clubhouses

### 2.2 User Roles

| Role | German Term | Description |
|------|-------------|-------------|
| **Event Organizer** | *Veranstalter* | Creates events, manages waiters, stations, products |
| **Waiter/Cashier** | *Kellner* | Takes orders at tables via smartphone app |
| **Runner/Server** | *Träger* | Delivers prepared orders from stations to tables |
| **Station Staff** | *Station* | Prepares orders at bar/kitchen/coffee station |
| **Admin** | *Admin* | System configuration, user management |
| **Kitchen Display User** | *Stationskellner* | Views and manages orders on kitchen monitor |

### 2.3 Deployment Scenarios

| Mode | Description | When to Use |
|------|-------------|-------------|
| **Service** (Table Service) | Waiters take orders at tables, runners deliver | Traditional festival with table service |
| **Bonkasse** (Voucher Cashier) | Guests pre-pay at register, get vouchers, redeem at stations | Self-service festivals, beer tents |
| **Abholscheine** (Pickup Slips) | Guests order at register, pick up directly | Simple setups with one pickup point |
| **Mixed** (*Gemischter Betrieb*) | Any combination of the above | Complex festivals with multiple areas |

---

## 3. System Architecture

### 3.1 Hardware Architecture (Orderjutsu's Approach)

```
┌─────────────────────────────────────────────────────┐
│                    FESTIVAL GROUND                    │
│                                                      │
│  ┌──────────────┐                                    │
│  │ Raspberry Pi  │ ← Server (192.168.192.10)         │
│  │ + Router      │ ← WiFi network                    │
│  │ + UPS         │ ← Power backup                    │
│  └──────┬───────┘                                    │
│         │ LAN / PowerLAN                             │
│  ┌──────┴───────┐                                    │
│  │  Printers     │ ← Network thermal printers        │
│  │  (Epson etc.) │   at stations (bar, kitchen)      │
│  └──────────────┘                                    │
│                                                      │
│  ┌──────────────┐                                    │
│  │  Smartphones  │ ← Waiter devices (BYOD OK)       │
│  │  (Android)    │   WiFi connected                  │
│  └──────────────┘                                    │
│                                                      │
│  ┌──────────────┐                                    │
│  │ Kitchen Monitor│ ← Display for station orders     │
│  │ (optional)    │                                   │
│  └──────────────┘                                    │
└─────────────────────────────────────────────────────┘
```

### 3.2 Software Architecture (Orderjutsu)

- **Backend:** PHP web application
- **Server:** Raspberry Pi (3B, 3B+, 4, 4B, 5 supported)
- **Pre-built Raspberry Pi image** provided for easy deployment
- **Admin UI:** Web-based (browser)
- **Waiter App:** Android APK (downloadable from http://192.168.192.10/app.apk)
- **Network:** Dedicated WiFi subnet (192.168.192.0/24)
- **Database:** Local (on Raspberry Pi)
- **No internet required** for operation (only for installation/updates)

### 3.3 Orderwas Architecture (Proposed)

For the open-source clone, we should consider a more modern stack:

- **Frontend:** Progressive Web App (PWA) — works on any device with a browser
- **Backend:** Node.js/Python/Go REST API
- **Database:** SQLite or PostgreSQL
- **Deployment:** Docker container (runs on any Linux, Raspberry Pi, or cloud)
- **Network:** Local WiFi or LAN
- **Offline-first:** Service workers for offline capability
- **Printer support:** ESC/POS protocol over network

### 3.4 Philipp's Specific Requirements

#### Database Strategy
- **Primary:** SQLite (lightweight, zero-config, single-file)
- **Swappable:** Architecture supports PostgreSQL as alternative
- **No migrations needed:** DB only lives for a single event/party
- **Export/Import:** Configuration and settings must be exportable/importable
- **Rationale:** Each event starts fresh; no need for long-term data persistence

#### Frontend Requirements
- **Browser-based:** No native app install required
- **Responsive:** Optimized for phones and tablets
- **PWA:** Progressive Web App for offline capability
- **Touch-friendly:** Large buttons, easy tap targets
- **Fast:** < 3 second page loads, < 1 second interactions

#### Localization Strategy
- **Primary language:** German (DE)
- **Localizable:** Architecture supports i18n from day one
- **Planned languages:** English (EN), French (FR), others as needed
- **Approach:** JSON translation files, RTL support not needed initially

#### Licensing
- **License:** GPL-3.0 or AGPL-3.0
- **Rationale:** Encourage contributions, prevent closed-source forks
- **Users must:** Share modifications under same license
- **Commercial use:** Allowed, but must open-source derivative works

#### Development Approach
- **Repository:** Local git repo for now (no GitHub yet)
- **Version control:** Git from day one
- **Collaboration:** Add contributors later when ready

---

## 4. Core Entities & Data Model

### 4.1 Entity Relationship Diagram

```
Veranstalter (Event Organizer)
    │
    ├── 1:N ──→ Veranstaltung (Event)
    │               │
    │               ├── 1:N ──→ Kellner (Waiter)
    │               │               │
    │               │               └── 1:1 ──→ AppLayout (Button Layout)
    │               │
    │               ├── 1:N ──→ Station (Station/Counter)
    │               │               │
    │               │               ├── 1:N ──→ Produkt (Product)
    │               │               │
    │               │               └── 1:1 ──→ Drucker (Printer)
    │               │
    │               └── 1:N ──→ Bestellung (Order)
    │                               │
    │                               └── 1:N ──→ Bestellposition (Order Item)
    │
    └── 1:N ──→ User (System User)
```

### 4.2 Entity Definitions

#### Veranstalter (Event Organizer)
- **Name** (string)
- **UST-Pflichtig** (boolean — VAT-eligible)
- **Users** (1:N → User)

#### Veranstaltung (Event)
- **Name** (string)
- **Status** (enum: Test, Live)
- **TSE enabled** (boolean — German fiscal compliance)
- **Hide prices on receipts** (boolean)
- **Kellner** (1:N → Waiter)
- **Stationen** (1:N → Station)

#### Kellner (Waiter)
- **Name** (string)
- **Logo** (image — printed on receipts)
- **Password** (string)
- **Printer** (1:1 → Drucker)
- **Druckt sofort** (boolean — prints immediately)
- **Spezialkellner** (boolean — can be used as cost center)
- **Stornieren** (boolean — can cancel positions)
- **Statistiken** (boolean — can print reports)
- **Abkassieren** (boolean — can cash out for others)
- **Neue Kellner** (boolean — can create new waiters during transfers)
- **Auto-Sammelbon** (boolean — auto-group receipts)
- **Für Login verstecken** (boolean — hidden from login)
- **Stationskellner** (boolean — can access kitchen monitor)
- **Kellnerwechsel** (boolean — can change waiter on orders)
- **AppLayout** (1:1 → AppLayout — optional custom layout)

#### Station (Station/Counter)
- **Name** (string — e.g., "Küche", "Schank", "Kaffee")
- **Logo** (image — printed on receipts)
- **Primary Printer** (1:1 → Drucker)
- **Alternative Printers** (N:M → Drucker — for specific table ranges or pickup codes)
- **Küchenmonitor enabled** (boolean)
- **Products** (1:N → Produkt)

#### Produkt (Product)
- **Name** (string)
- **Price** (decimal)
- **Tax Rate** (enum: AT, DE, CH rates)
- **Stock tracking** (enum: No, Yes, Composite)
- **Stock count** (integer)
- **Voucher** (boolean — is this a voucher product?)
- **Addable in app** (boolean — can waiters add this?)
- **Extras available** (boolean)

#### Drucker (Printer)
- **Name** (string)
- **Type** (enum: Network/IP, Ignore, Dummy)
- **IP Address** (string)
- **Font** (string)
- **Characters per line** (integer)
- **Image print settings** (boolean)
- **Buzzer** (boolean)
- **Paper cut** (enum: Full, Partial)

#### Bestellung (Order)
- **Kellner** (N:1 → Kellner)
- **Table number** (string)
- **Status** (enum: Open, Partial, Paid, Cancelled)
- **Timestamp** (datetime)
- **Tear-off number** (integer — auto-incrementing)
- **Comments** (text)
- **Order Items** (1:N → Bestellposition)

#### Bestellposition (Order Item)
- **Product** (N:1 → Produkt)
- **Quantity** (integer)
- **Status** (enum: Open, Prepared, Delivered, Cancelled)
- **Extras** (text — e.g., "no salt", "warm beer")

#### Gutschein (Voucher)
- **Code** (string)
- **Value** (decimal)
- **Status** (enum: Active, Redeemed, Expired)

#### AppLayout (Button Layout)
- **Columns** (integer)
- **Rows** (integer)
- **Buttons** (JSON array — each with name, color, product reference)

---

## 5. Feature Requirements

### 5.1 Core Features (Must-Have)

#### 5.1.1 Order Taking
- [ ] Waiter selects table number
- [ ] Waiter selects products from customizable button grid
- [ ] Order is sent to server
- [ ] Receipt prints at appropriate station(s) automatically
- [ ] Order split by station (drinks → bar, food → kitchen)
- [ ] Support for extras/comments (e.g., "no salt", "extra sauce")
- [ ] Auto-incrementing tear-off numbers for pickup orders

#### 5.1.2 Station Management
- [ ] Multiple stations (kitchen, bar, coffee, etc.)
- [ ] Each station has its own printer
- [ ] Alternative printers for specific table ranges or pickup codes
- [ ] Station can enable/disable kitchen monitor

#### 5.1.3 Kitchen Monitor
- [ ] Display of open orders for a station
- [ ] **Order View:** Sorted by wait time, shows products per order
- [ ] **Product View:** Sorted by product, shows quantity per table
- [ ] Mark orders as complete
- [ ] Show/hide extras
- [ ] Reorder priority by clicking sort number

#### 5.1.4 Printer Support
- [ ] ESC/POS protocol support
- [ ] Network (IP) printers
- [ ] Font selection and characters-per-line configuration
- [ ] Image/logo printing on receipts
- [ ] Buzzer/beep on print
- [ ] Paper cut (full or partial)
- [ ] "Ignore" printer type (for stations that don't print)
- [ ] "Dummy" printer type (logs order without printing)

#### 5.1.5 Voucher System (Gutscheine)
- [ ] Create voucher products (pre-paid items)
- [ ] Mass voucher generation
- [ ] Voucher redemption during orders
- [ ] Voucher stock tracking
- [ ] Print voucher receipts

#### 5.1.6 Settlement & Reporting
- [ ] Per-waiter cash amount calculation
- [ ] Excel export of all orders and revenues
- [ ] Station-level reports (consumption, stock)
- [ ] Payment receipts (Zahlungsbelege) with event name, date, sequential number, taxes, QR code
- [ ] Stock/inventory management with linked items

#### 5.1.7 User & Role Management
- [ ] Event organizer creates events
- [ ] Add/remove waiters per event
- [ ] Per-waiter permissions (cancel, cash out, statistics, etc.)
- [ ] Password-protected waiter login
- [ ] Waiter login selection screen

### 5.2 Advanced Features (Should-Have)

#### 5.2.1 Stock Management (Lagerstände)
- [ ] Per-product stock tracking
- [ ] Composite products (e.g., "Schnitzel + Pommes" = 2× base ingredients)
- [ ] Decimal quantities (e.g., 0.5L beer from 1L unit)
- [ ] Stock warnings when running low
- [ ] Stock adjustment from app

#### 5.2.2 Multi-Event Features
- [ ] Copy event configuration to new event
- [ ] Export/import event settings
- [ ] Test mode vs. Live mode
- [ ] Test mode prints "TEST" on receipts, doesn't affect stock

#### 5.2.6 QR Code Table Ordering (from Bierblock)
- [ ] Generate unique QR codes per table
- [ ] QR codes link to mobile-friendly ordering page
- [ ] Guests scan QR code with phone camera
- [ ] Mobile ordering page (no app install required)
- [ ] Order submission with table number auto-detected
- [ ] Notification to waiter when table places order
- [ ] Integration with existing order flow

#### 5.2.7 Event Templates (from Bierblock)
- [ ] Save event configuration as template
- [ ] Reuse drink lists, settings, layouts
- [ ] Quick setup for recurring events
- [ ] Share templates between organizers

#### 5.2.8 PDF Export (from Bierblock)
- [ ] Export receipts as PDF
- [ ] Export table lists
- [ ] Export access credentials
- [ ] Print-ready documents

#### 5.2.3 Transfer & Billing
- [ ] Transfer orders between waiters
- [ ] Transfer orders to different Kellner (cost center)
- [ ] Partial payment (pay part of order)
- [ ] Split order into multiple bills
- [ ] "Pay later" option
- [ ] Collective billing for neighboring groups (Sammelrechnung)

#### 5.2.4 Communication
- [ ] Message tab between waiters
- [ ] Product availability notifications
- [ ] Station-to-waiter communication

#### 5.2.5 App Customization
- [ ] Customizable button grid per event
- [ ] Alternative layouts per waiter
- [ ] Button colors and names
- [ ] Columns and rows configuration

### 5.3 Nice-to-Have Features

- [ ] Bluetooth thermal printer support (mobile printers)
- [ ] Cashless payment integration (SumUp, etc.)
- [ ] QR code for table ordering (guest self-order)
- [ ] Docker image for easy deployment
- [ ] Multi-language support (DE, EN)
- [ ] API for third-party integrations
- [ ] Remote support access (via internet router)
- [ ] UPS monitoring integration
- [ ] PowerLAN adapter management

#### 5.3.1 Real-Time Shared Overview (from Bierblock)
- [ ] All helpers see the same live state
- [ ] Station staff sees orders as they come in
- [ ] Waiters can see when their order is being prepared
- [ ] Organizers see overall status
- [ ] WebSocket or Server-Sent Events for live updates

#### 5.3.2 Offline Mode with Sync (from Bierblock)
- [ ] Orders saved locally when offline
- [ ] Automatic sync when connection restored
- [ ] No data loss during WiFi issues
- [ ] Service Workers for offline capability
- [ ] IndexedDB for local data storage

---

## 6. Workflow Descriptions

### 6.1 Service Mode Workflow

```
1. Waiter goes to table
2. Waiter opens app on smartphone
3. Waiter selects table number
4. Waiter taps product buttons to build order
5. Waiter confirms order → "Bestellung abschließen"
6. System splits order by station:
   - Drinks → prints at bar printer
   - Food → prints at kitchen printer
7. Station staff sees order on receipt (or kitchen monitor)
8. Station staff prepares items
9. Runner delivers items to table
10. Waiter can check order status in app
11. At end: waiter cashes out → prints payment receipt
```

### 6.2 Bonkasse (Voucher) Workflow

```
1. Guest approaches main register
2. Cashier selects voucher products (e.g., "5× Bier")
3. Guest pays → cashier marks as paid
4. System prints voucher receipt with tear-off number
5. Guest goes to bar/kitchen
6. Guest hands over voucher
7. Station staff redeems voucher in system
8. Items are prepared and handed over
```

### 6.3 Mixed Operation Workflow

```
1. Some areas use table service (Service)
2. Some areas use voucher system (Bonkasse)
3. System handles both simultaneously
4. Different waiters configured for different modes
5. Separate stations for voucher vs. service orders
```

---

## 7. User Interface Requirements

### 7.1 Waiter App (Mobile)

**Based on Orderjutsu demo video analysis:**

- **Login Screen:** Select event → select waiter → enter password
- **Main Screen:** Overview with order count and total revenue
- **Order Screen:** 
  - Table number input (top)
  - Product button grid (customizable)
  - Category tabs (food, drinks, etc.)
  - Order summary (bottom)
  - "Complete order" button
- **Order History:** List of all orders with status
- **Extras:** Popup for product options (e.g., "no salt")
- **Settlement:** Per-waiter cash amount, print option

**Key UI Observations from Video:**
- Simple, clean design
- Large touch-friendly buttons
- Color-coded product categories
- Fast order flow (2-3 taps per item)
- Auto-tear-off numbers for pickup orders
- "Kassier ändern" (change cashier) during order

### 7.2 Admin Interface (Web)

**Based on wiki analysis:**

- **Dashboard:** Event overview, order statistics
- **Event Management:** Create/edit events, manage waiters, stations
- **Product Management:** Add/edit products, set prices, stock levels
- **Printer Configuration:** Add printers, set fonts, test prints
- **Reports:** Excel export, waiter evaluation, station reports
- **Settings:** System configuration, user management

### 7.3 Kitchen Monitor

**Based on wiki analysis:**

- **Order View:** 
  - Orders sorted by wait time (oldest first)
  - Each order shows: table number, products, quantities
  - Click to mark as complete
  - Priority reordering
- **Product View:**
  - Products sorted by name
  - Shows quantity per table
  - Useful for batch preparation

---

## 8. Technical Requirements

### 8.1 Performance
- Order submission: < 200ms
- Receipt print: < 2 seconds
- Support 20+ simultaneous waiters
- Support 1000+ orders per event
- Offline operation (no internet dependency)
- Page load: < 3 seconds
- Interaction response: < 1 second

### 8.2 Reliability
- UPS support for power outages
- Automatic order queue if printer is offline
- Database backup/restore capability
- Error logging and diagnostics
- Export/import for configuration and settings
- Single-event database lifecycle (no long-term persistence)

### 8.3 Security
- Password-protected waiter login
- No sensitive data storage (not a cash register)
- Local network only (no external access by default)
- Optional remote support via internet router

### 8.4 Compatibility
- **Server:** Linux (Raspberry Pi, any x86/x64), Docker
- **Client:** Any modern browser (Chrome, Firefox, Safari)
- **Printers:** ESC/POS compatible (Epson TM-T20III, Munbyn, etc.)
- **Network:** WiFi (2.4GHz/5GHz), LAN, PowerLAN
- **Database:** SQLite (primary), PostgreSQL (alternative)
- **Frontend:** Responsive (phones, tablets, desktops)

### 8.5 Scalability
- Single Raspberry Pi handles 20+ waiters
- Multiple printers per station
- Optional kitchen monitors per station
- Supports events from 50 to 1000+ guests

### 8.6 Internationalization
- **Primary:** German (DE)
- **Architecture:** i18n-ready from day one
- **Format:** JSON translation files
- **Languages:** DE, EN, FR (extensible)
- **Approach:** Locale detection, language switcher in UI

---

## 9. Hardware Requirements

### 9.1 Server (Base Station)

| Component | Specification | Notes |
|-----------|---------------|-------|
| **Computer** | Raspberry Pi 5 (or 3B/4) | Pre-built image provided |
| **Router** | Netgear Nighthawk or similar | Dual-band WiFi |
| **UPS** | APC BR650MI or similar | Power backup |
| **Power strips** | 6-way | For Pi + router + printers |
| **PowerLAN adapters** | TP-Link or Devolo | One per printer + one at router |
| **Transport box** | 45L with lid | For base station |

**Estimated cost:** ~€480

### 9.2 Printer Station

| Component | Specification | Notes |
|-----------|---------------|-------|
| **Printer** | Epson TM-T20III Ethernet | ESC/POS compatible |
| **Thermal paper** | 80mm, phenol-free | BPA-free, avoid eco-rolls |
| **Power cable** | 50m reel | For outdoor events |
| **PowerLAN adapter** | TP-Link | One per printer |
| **LAN cable** | Short (1-2m) | Printer to PowerLAN |
| **Transport box** | 65L | For printer + accessories |

**Estimated cost:** ~€250 per printer station

### 9.3 Input Devices

| Component | Specification | Notes |
|-----------|---------------|-------|
| **Smartphone** | Xiaomi Redmi A2 or similar | Budget-friendly, 10h+ battery |
| **Alternative** | Nokia G21 | Tested, may be dim outdoors |
| **Battery pack** | Anker Powercore | Optional backup power |

**Estimated cost:** ~€150 per device

### 9.4 Total Hardware Cost

- **Base station:** ~€480
- **4 printer stations:** ~€1,000 (4 × €250)
- **5 smartphones:** ~€750 (5 × €150)
- **Transport:** ~€60
- **Total:** ~€2,290

---

## 10. Competitive Analysis

### 10.1 Orderjutsu (Original)

**Strengths:**
- Mature product (2019–2026, 14+ major versions)
- Offline-first design
- One-time purchase (€600 license + €60/year updates)
- Active community (Telegram group)
- Pre-built Raspberry Pi image
- Comprehensive wiki documentation

**Weaknesses:**
- Closed source
- Android-only waiter app (APK install required)
- Limited to Raspberry Pi hardware
- No cloud/web-based option
- Manual hardware setup required

**Pricing:**
- License: €600 one-time
- Updates: €60/year
- Rental: ~€250/event
- Hardware: €1,500–€2,500

### 10.2 Bierblock (Competitor)

**Strengths:**
- Browser-based (no app install)
- Cloud SaaS model
- Modern UI
- AI-powered analytics
- QR code table ordering
- Floor plan editor

**Weaknesses:**
- Subscription model (€299/year or €49/month)
- Requires internet (offline mode limited)
- Newer product (less mature)
- No physical printer support (browser-based only)

**Pricing:**
- Annual: €299/year
- Monthly: €49/month
- One-time: €99/1 month
- Founder: €349 (2 years)

**Key Features We're Adopting:**
- QR Code table ordering (simplified: guest orders, waiter confirms)
- Real-time shared overview (WebSocket/SSE)
- Event templates (save/reuse configurations)
- PDF export (receipts, table lists)
- Floor plan editor (Phase 3, simplified grid-based)

### 10.3 Orderwas (Our Open-Source Clone)

**Goals:**
- Open source (MIT/GPL license)
- Modern tech stack (PWA, Docker)
- Cross-platform (any browser)
- Offline-first
- ESC/POS printer support
- Free forever
- Community-driven development

### 10.4 Bierblock-Inspired Features for Orderwas

Based on analysis of Bierblock (bierblock.app), we're adopting these features:

| Feature | Priority | Phase | Complexity |
|---------|----------|-------|------------|
| **QR Code Table Ordering** | HIGH | 2 | Medium |
| **Real-time Shared Overview** | HIGH | 1 | Low-Medium |
| **Offline Mode with Sync** | HIGH | 2 | Medium-High |
| **Event Templates** | MEDIUM | 2 | Low |
| **PDF Export** | MEDIUM | 2 | Low |
| **Floor Plan Editor** | MEDIUM | 3 | Medium-High |
| **Basic Analytics** | LOW | 3 | Medium |
| **AI Analytics** | LOW | 4 | High |

**Key Insight:** Bierblock's QR code ordering is their standout feature. We should include it in Phase 2, but with a simplified approach: QR codes link to a mobile page where guests can order, but a waiter confirms and routes the order to the kitchen/bar. This keeps the human in the loop while reducing friction.

---

## 11. Version History Analysis (Orderjutsu)

Based on wiki analysis, Orderjutsu has evolved significantly:

**Key milestones:**
- **V1.0 (Jan 2019):** Initial release
- **V1.3 (May 2019):** Vouchers, custom layouts, messages
- **V1.5 (Jul 2019):** Stock management, change calculation
- **V1.6 (Jan 2020):** Collective receipts (Sammelbons)
- **V1.7 (Jun 2022):** Major update with new features
- **V1.9 (Feb 2023):** Currency config, waiter evaluation
- **V1.10 (Mar–Jul 2023):** Kitchen monitor, Swiss tax rates
- **V1.12 (Nov 2024):** TSE integration (German fiscal compliance)
- **V1.14 (Jul 2024–2026):** Latest features, security updates

**Feature evolution pattern:**
1. Core ordering and printing
2. Vouchers and stock management
3. Kitchen monitor and advanced reporting
4. Multi-country support (AT, DE, CH)
5. TSE compliance (German fiscal law)
6. UI/UX improvements

---

## 12. User Testimonials (from YouTube)

**Video: MeJDsSPii-o (Testimonial compilation)**

Key themes from user interviews:

1. **Speed:** Guests are amazed how fast orders arrive
2. **Simplicity:** Volunteers with no training can use it immediately
3. **Fewer staff needed:** Reduced from 25+ waiters to 4–6
4. **Better service:** Faster order delivery, happier guests
5. **Statistics:** Valuable data for planning next events
6. **Support:** Fast Telegram support (minutes, not hours)
7. **Cost-effective:** One-time purchase, no ongoing fees
8. **Self-hosted:** Clubs own their data, no cloud dependency

**Direct quotes:**
- "Die Gäste konnten nicht glauben dass ihr Getränk jetzt schon da sein kann" (Guests couldn't believe their drink arrived so fast)
- "Wir brauchen für ein Fest mit ca 500 Leuten nur vier Aufnehmer" (We only need 4 waiters for a 500-person festival)
- "Unter prächtig zufrieden" (Extremely satisfied)

---

## 13. Implementation Roadmap

### Phase 1: Core MVP (Weeks 1–4)
- [ ] Basic data model (events, waiters, stations, products)
- [ ] Simple order taking (mobile web UI)
- [ ] ESC/POS printer support (network printers)
- [ ] Basic admin interface
- [ ] Docker deployment
- [ ] Real-time shared overview (WebSocket/SSE)
- [ ] Demo mode without registration

### Phase 2: Essential Features (Weeks 5–8)
- [ ] Voucher system (Gutscheine)
- [ ] Stock management (Lagerstände)
- [ ] Kitchen monitor display
- [ ] Settlement and reporting
- [ ] User permissions
- [ ] QR Code table ordering
- [ ] Event templates
- [ ] PDF export
- [ ] Offline mode with sync

### Phase 3: Advanced Features (Weeks 9–12)
- [ ] App layout customization
- [ ] Multi-event support
- [ ] Transfer between waiters
- [ ] Collective billing
- [ ] Excel export
- [ ] Floor plan editor
- [ ] Basic analytics

### Phase 4: Polish & Scale (Weeks 13–16)
- [ ] Offline mode (Service Workers)
- [ ] QR code table ordering
- [ ] Multi-language support
- [ ] Performance optimization
- [ ] Documentation and tutorials
- [ ] AI-powered analytics

---

## 14. Success Criteria

### Functional Requirements
- [ ] Waiter can take order in < 10 seconds
- [ ] Receipt prints in < 2 seconds
- [ ] System handles 20+ simultaneous waiters
- [ ] Works offline (no internet required)
- [ ] Supports ESC/POS printers
- [ ] Voucher system works end-to-end
- [ ] Settlement reports are accurate
- [ ] QR code table ordering works
- [ ] Real-time updates visible to all users
- [ ] Offline mode syncs correctly
- [ ] Event templates save and load properly
- [ ] PDF export generates valid documents
- [ ] Configuration export/import works
- [ ] German UI is complete and accurate
- [ ] English/French translations load correctly
- [ ] Responsive design works on phones and tablets
- [ ] SQLite database operates correctly
- [ ] PostgreSQL swap works (when implemented)

### Non-Functional Requirements
- [ ] Single Raspberry Pi handles 1000+ orders
- [ ] 99.9% uptime during events
- [ ] Zero data loss on power failure
- [ ] Setup time < 30 minutes
- [ ] Volunteer training time < 5 minutes
- [ ] QR code ordering page loads in < 3 seconds
- [ ] Real-time updates appear in < 1 second
- [ ] Offline mode works for 8+ hours
- [ ] Page loads in < 3 seconds on mobile
- [ ] Touch targets are at least 44x44 pixels
- [ ] License is GPL-3.0 or AGPL-3.0

### Community Requirements
- [ ] Open source license (GPL-3.0 or AGPL-3.0)
- [ ] Comprehensive documentation
- [ ] Docker image for easy deployment
- [ ] Active community support
- [ ] Regular releases

---

## 15. Appendix

### 15.1 Glossary

| German | English | Description |
|--------|---------|-------------|
| Vereinsfest | Club festival | Community event organized by a club |
| Verein | Club/Association | Organization hosting the festival |
| Veranstalter | Event organizer | Person managing the event |
| Veranstaltung | Event | The festival itself |
| Kellner | Waiter | Takes orders at tables |
| Träger | Runner | Delivers orders from stations to tables |
| Station | Station | Preparation point (kitchen, bar) |
| Drucker | Printer | Thermal receipt printer |
| Bon | Receipt | Printed order slip |
| Gutschein | Voucher | Pre-paid item coupon |
| Abholschein | Pickup slip | Order pickup ticket |
| Sammelbon | Collective receipt | Combined receipt for multiple orders |
| Küchenmonitor | Kitchen monitor | Display for station orders |
| Bestellung | Order | A customer order |
| Bestellposition | Order item | Individual item in an order |
| Lagerstand | Stock level | Inventory count |
| USV | UPS | Uninterruptible power supply |
| PowerLAN | Powerline | Network over electrical wiring |
| ESC/POS | ESC/POS | Printer command protocol |

### 15.2 Reference Links

- **Orderjutsu Website:** https://orderjutsu.org/
- **Orderjutsu Wiki:** https://wiki.orderjutsu.org/
- **Orderjutsu Shop:** https://orderjutsu.org/shop/
- **YouTube Channel:** https://www.youtube.com/channel/UCdgkuyyNlIO6SdjW8qeO6JA
- **Bierblock (Competitor):** https://bierblock.app/

### 15.3 YouTube Videos Analyzed

1. **Demo Video (i0wGwtOLjXg):** Shows the full order flow — login, product selection, order submission, receipt printing, extras, settlement
2. **Testimonials (MeJDsSPii-o):** User interviews from multiple fire departments and music clubs across Austria and Switzerland

### 15.4 Screenshots

*To be added: screenshots of the OrderJutsu admin interface, waiter app, kitchen monitor, and receipt examples*

---

## 16. Next Steps

1. **Validate requirements** with Philipp
2. **Choose tech stack** (Node.js vs Python vs Go for backend)
3. **Design UI mockups** for waiter app and admin
4. **Set up project structure** (GitHub repository)
5. **Begin Phase 1 implementation**

---

*This document is based on comprehensive analysis of Orderjutsu's website, wiki, YouTube videos, and competitor research. All information is current as of August 2026.*

---

## 17. Requirements from Live Review (2026-08-17)

Feedback from Philipp's first live sandbox review of the running system.

### 17.1 Station Display Real-Time
- Station displays MUST auto-update on new orders (WebSocket push, no manual refresh). [Task 6.2]

### 17.2 Landing Page Navigation
- The root page must offer navigation to ALL role views: waiter app, station displays, admin section — not just auto-redirect to waiter login. [Task 6.4]

### 17.3 Order Flow Loop
- After submitting an order, the waitress must be able to immediately start the next order with minimal friction (show tear-off number, clear state, focus next table input). [Task 6.5]

### 17.4 Product Modifications / Extras (Orderjutsu Parity)
- Customers order products with modifications (e.g. "Bratwurst without mustard, with ketchup"). Orderjutsu allows per-product structured option groups. Requirements:
  - Admin can define option groups per product (radio/checkbox, option labels, optional price deltas)
  - Waiter sees option picker when adding a modified product
  - Selected options print on the station receipt and persist on the order item
  - Free-text comments remain available in addition [Task 6.6]

### 17.5 Full Order Lifecycle E2E Tests
- Integration/E2E tests must cover the ENTIRE order lifecycle and assert expected state on API endpoints AND UI screens:
  - Add products to order, modify, remove items
  - Submit order
  - Order appears on station displays (live) and in printer queue
  - Mark items/orders fulfilled
  - Cancel items or full orders (with permission gate)
  - Everything E2E-tested end to end [Task 6.7]

---

## 18. Requirements — Theke / Abholcounter (2026-09-12)

Counter sales, separated from table service. **Implemented** (see [docs/ARCHITECTURE.md](ARCHITECTURE.md) §4 *Counter mode*).

- **Configured per event** (boolean, admin UI). At most one counter per event for now; typically zero or one.
- **The order page is the waiter page**, except that the table number is replaced by a **Bon** (tear-off) number: an integer field, pre-filled with the incrementing number and editable for the ticket torn off at the counter.
- **Orders are labelled "Theke"** instead of a waiter name, and carry the Bon instead of a table number — on screen and on the receipt (`Bon: <n>` in place of `Tisch:`/`Abholcode:`; otherwise the receipt is unchanged). **Bon numbers reset per event.**
- **Same products as the waiters** for now. Station-specific counters (per-station product ranges) are a later step.
- **After submitting** the counter proceeds to *Kassieren* immediately. That screen is always about the most recent order only — there are no tables or Bon numbers to select.
- **No new order while a Bon is unpaid.** The screen returns to *Neue Bestellung* only after the full payment is confirmed; the backend refuses a second unpaid counter order (409), so the rule holds even if the UI is bypassed.
- **Bar/kitchen stations process counter orders identically.** The only difference: the goods are handed to the customer holding the matching Bon instead of being delivered to a table.
