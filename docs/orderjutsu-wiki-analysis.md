# Orderjutsu Wiki - Configuration Pages Comprehensive Summary

**Source**: https://wiki.orderjutsu.org/Kategorie:Konfiguration
**Crawled**: 18 pages from the Configuration category

---

## System Overview

Orderjutsu is an Austrian/German ordering system designed for club festivals (Vereinsfeste). It supports multiple deployment scenarios: table service, pickup vouchers (Bonkasse), and mixed operations. The system consists of an administration interface and a mobile app for waiters/cashiers.

**Core Architecture**:
- **Veranstalter** (Event Organizer) → creates and manages events
- **Veranstaltung** (Event) → contains waiters, stations, products
- **Kellner** (Waiter) → takes orders, can be assigned different roles
- **Station** (Station/Counter) → kitchen, bar, coffee station where products are prepared
- **Produkt** (Product) → items available for ordering
- **Drucker** (Printer) → thermal receipt printers for printing orders

---

## 1. Service (Table Service)

The base configuration where waiters take orders at tables. Orders are split to stations, prepared, and delivered by runners (Träger).

**Key entities**: Kellner → Station → Träger

---

## 2. Bonkasse (Voucher/Coupon Cashier)

A stationary cash register where guests pay for vouchers (Bons) that can be redeemed later at stations.

**When to use**:
- Guests are used to picking up their own products
- No cash collection at stations desired
- Guests want to pre-order multiple items

**Configuration**:
- Create a separate "Gutscheine" (Vouchers) station with an Ignore printer
- Products marked as "Gutschein: Ja" (Voucher: Yes)
- Bonkasse configured as a Kellner with:
  - Abholkennzeichen (Pickup code) → skips table number entry
  - Auto-Abrissnummer (Auto-tear-off number) → auto-incrementing order numbers

**Dual Operation** (Service + Bonkasse):
- Gutscheine should be in a separate station
- Bonkasse needs its own button layout
- Service requires detailed product entry; Bonkasse uses grouped products

---

## 3. Abholscheine (Pickup Slips)

For orders where guests pick up directly at the station (no table service).

**Key features**:
- Abholkennzeichen (e.g., "A") distinguishes pickup orders from table orders
- Auto-Abrissnummern auto-increment order numbers
- Suitable for main cashier setups

**Configuration**:
- Enabled in the Kellner settings
- Always prints when a printer is assigned to the Kellner

---

## 4. Gemischter Betrieb (Mixed Operation)

Can combine Service, Bonkasse, and Abholscheine simultaneously.

**Setup considerations**:
- Gutscheine for food should be in a separate station
- Alternative printers can route pickup orders to different printers
- An Annoncier (announcer) helps coordinate order handout
- Service and Abholscheine work well together

---

## 5. Gutscheine (Vouchers)

Two purposes:
1. **Value vouchers** → monetary amount deducted at payment
2. **Bonkasse operation** → enables the voucher system

**Configuration**:
- Products set as "Gutschein: Ja" in the station
- Can mass-edit product vouchers if created incorrectly
- Additional Kellner settings needed for Bonkasse use

---

## 6. Kellner (Waiter/Cashier)

Central role with many configurable options:

**Key Settings**:
| Setting | Description |
|---------|-------------|
| Logo | Printed on bons for the Kellner |
| Druckt sofort (Prints immediately) | Whether orders print at stations right away |
| Spezialkellner (Special waiter) | Can be used as cost center for transfers |
| Drucker (Printer) | Assigned printer |
| Stornieren (Cancel) | Can cancel order positions |
| Statististics | Can print consumption/product reports |
| Abkassieren (Cash out) | Can collect for other Kellners |
| Neue Kellner | Can create new Kellners during transfers |
| Auto-Sammelbon | Bons automatically grouped on a combined slip |
| Für Login verstecken | Hidden from login selection |
| Stationskellner | Can access kitchen monitor |
| Kellnerwechsel | Can change waiter on existing orders |

Each Kellner can have an **alternative App button layout**.

---

## 7. Küchenmonitor (Kitchen Display)

Shows open bons and product totals for a station. Not limited to kitchen - works for bars too.

**Two Views**:
1. **Bestellungsansicht** (Order View) → sorted by wait time, shows products per order
2. **Produktansicht** (Product View) → sorted by product, shows quantity per table

**Configuration** (2 steps):
1. Enable in Station settings (Küchenmonitor checkbox)
2. Enable a Kellner as "Stationskellner"

**Features**:
- Full or partial print of bons
- Reorder orders by clicking sort number
- Show/hide extras (e.g., "no salt", "warm beer")
- **Important**: If Kellner has "Druckt sofort" disabled, orders won't appear on monitor!

---

## 8. Drucker (Printers)

**Printer Types**:
| Type | Use Case |
|------|----------|
| Netzwerk (IP) | Standard network printer |
| Ignorieren | Stations/Kellners that don't print |
| DUMMY | Log only, no physical print |

**Configuration Options**:
- Font selection and combination
- Characters per line (must match font!)
- Image print settings (varies by printer age)
- Buzzer settings
- Paper cut (full or partial)

**Troubleshooting**:
- Epson TM-T20IV not printing → disable "Secure Printing" in printer web interface
- Layout issues → check characters per line on test print
- Table number too small → prefer Epson or Munbyn printers

---

## 9. Station

A location where products are prepared (kitchen, bar, coffee station).

**Configuration**:
- Logo for printouts
- Copy print option
- Primary printer
- Alternative printers for table number ranges or pickup codes
- Küchenmonitor toggle
- Print product list and current consumption

**Additional Options**: Products can be added, edited, or deleted per station.

---

## 10. Lagerstände (Stock/Inventory)

Prevents overselling of limited products.

**Settings per Product**:
- **Lagerstand** (Stock count) → quantity available
- **Lagerstand prüfen** (Check stock):
  - `Nein` → product never runs out
  - `Ja` → stock count enforced
  - `Zusammengesetzt` (Composite) → depends on ingredient products

**Composite Products Example**:
- Base ingredients: Schnitzel (stock=yes), Pommes (stock=yes), Semmel (stock=yes)
- Composite: "Schnitzel + Pommes" = 2× Schnitzel + 1× Pommes
- Supports decimal quantities (e.g., 0.5L beer from a 1L unit)

**Tips**:
- Plan 5% buffer, don't release all stock at start
- Any Kellner can adjust stock in the app

---

## 11. Produkt (Product)

**Create Product**:
- Lagerstand (stock tracking on/off)
- Addable in app (yes/no)
- Gutschein (voucher yes/no)
- Tax rate (Steuersatz)

**Generate Products** (batch creation):
- Create product groups (categories)
- Set naming schema for app and print
- Add variants with individual settings
- Mass-edit vouchers

---

## 12. AppLayout

Customizable button layout per event:
- Columns and rows per button
- Button name, color
- Associated product
- **Alternative layouts per Kellner**

---

## 13. Veranstalter (Event Organizer)

Creates and manages events, Kellner, and Stations.

**Settings**: Name, UST-Pflichtig (VAT-eligible) toggle

**Actions**: Create/edit/delete events, import from files

---

## 14. Veranstaltung (Event)

**Live-Status options**:
| Status | Description |
|--------|-------------|
| Testbetrieb (Test mode) | For on-site training; prints "TEST" on bons; can create/delete but nothing is produced |
| Livebetrieb (Live mode) | Switching from test DELETES all orders, settlements, and messages |

**Additional Options**:
- Hide prices on bons
- TSE (German fiscal regulations compliance) toggle

**Management**: Edit, export, copy, download as Excel, send messages, manage Kellner/Stationen, configure AppLayout, view all orders

---

## 15. Sammelrechnung für Nachbarfeuerwehren

For collective billing when neighboring fire departments attend together. Uses the Sammelbons (combined slips) function to collect orders across multiple tables.

---

## 16. User

Simple user management: create, edit, delete users. Each user can be assigned to a Veranstalter.

---

## 17. Abrechnen (Settlement)

**Per Kellner**: View expected cash amount (including unpaid orders) in the app; print via EUR menu

**Per Event**: Export Excel with all bookings and revenues from administration

---

## 18. Videos

Links to tutorial videos covering:
- Administration and base setup walkthrough
- App functionality demo

---

## Deployment Scenarios Summary

| Scenario | Description | Printer Needs |
|----------|-------------|---------------|
| **Service only** | Table service with runners | 1 printer per station |
| **Bonkasse only** | Voucher-based pickup | 1 printer for Bonkasse + 1 per station |
| **Abholscheine only** | Direct pickup orders | 1 printer per station |
| **Mixed (Service + Bonkasse)** | Combined table + voucher | Separate voucher station recommended |
| **Mixed (Service + Abholscheine)** | Combined table + pickup | Alternative printers per table range |
| **Küchenmonitor** | Any station can use display | Optional: station with no physical printer |

---

## Key Integration Points

1. **Gutscheine ↔ Bonkasse ↔ Abholscheine**: Voucher products drive the Bonkasse workflow; Abholscheine are the pickup mechanism
2. **Station ↔ Printer ↔ Küchenmonitor**: Each station has a primary printer; Küchenmonitor replaces immediate printing
3. **Kellner ↔ AppLayout ↔ Station**: Each Kellner can have custom button layout; Stationskellner access kitchen monitor
4. **Produkt ↔ Lagerstände ↔ Station**: Stock tracking per product; composite products for complex menu items
5. **Veranstalter → Veranstaltung → Kellner/Station**: Hierarchical management structure
