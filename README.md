# Orderwas

**An open-source ordering and receipt-printing system for club festivals.**

Inspired by [Orderjutsu](https://orderjutsu.org/), Orderwas provides a modern, free, and community-driven alternative for managing orders at Vereinsfeste, fire department festivals, music club events, and similar community gatherings.

## What is Orderwas?

Orderwas is a **Bestellsystem** (ordering system) and **Boniersystem** (receipt printing system) designed for:

- 🎪 **Club festivals** (Vereinsfeste)
- 👥 **Volunteer-run events** with minimal training
- 📶 **Offline-first** operation (no internet required)
- ⚡ **Fast order processing** (orders arrive before the waiter leaves the table)

## Key Features

### Core Features
- **Table Service Mode** — Waiters take orders at tables via smartphone
- **Voucher System** (Bonkasse) — Pre-paid vouchers for self-service festivals
- **Pickup Slips** (Abholscheine) — Direct pickup orders
- **Mixed Operation** — Combine any modes simultaneously
- **Kitchen Monitor** — Real-time order display for stations
- **Stock Management** — Track inventory with composite products
- **ESC/POS Printer Support** — Network thermal printers

### Advanced Features
- Customizable button layouts per event/waiter
- Multi-event support with test/live modes
- Transfer orders between waiters
- Collective billing for neighboring groups
- Excel export and reporting
- Multi-country tax support (AT, DE, CH)

## Tech Stack

- **Frontend:** Progressive Web App (PWA) — React 18 + Vite 5 + Tailwind
- **Backend:** Node.js 20 + TypeScript + Fastify 5 + Socket.io
- **Database:** SQLite (primary), PostgreSQL (swappable) via Prisma
- **Deployment:** Docker container

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — system architecture, data model design intent, layering rules, non-goals (binding)
- **[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)** — full requirements from Orderjutsu/Bierblock analysis
- **[docs/DESIGN-DECISIONS.md](docs/DESIGN-DECISIONS.md)** — Philipp's requirements and rationale
- **Network:** Local WiFi or LAN
- **Printers:** ESC/POS protocol over network
- **Localization:** German (DE), English (EN), French (FR)
- **License:** GPL-3.0

## Architecture

> **[📄 Architecture Diagram](docs/architecture-diagram.html)** — interactive SVG overview of the full service architecture

### System Overview

Orderwas runs on a single server on a dedicated festival LAN — **no internet required**. Clients (waiter phones, station displays, admin laptop) connect via HTTP/WebSocket. The server persists to SQLite and dispatches print jobs to ESC/POS network printers.

### Service Layers

```
┌─────────────────────────────── FESTIVAL LAN ───────────────────────────┐
│                                                                        │
│  Waiter PWA      Station Display      Admin PWA      Guest QR         │
│  (React/Vite)    (Kitchen Monitor)    (Config UI)    (Self-service)    │
│       │                 │                  │               │            │
│       └─────────────────┴──────────────────┴───────────────┘            │
│                          HTTP + WebSocket                               │
│              ┌────────────▼────────────────────┐                       │
│              │      Fastify 5 (REST API)       │                       │
│              │   Routes → Services → Prisma     │                       │
│              └────┬──────────────┬──────────────┘                       │
│                   │              │                                       │
│              SQLite (WAL)   TCP 9100 (ESC/POS)                         │
│              Prisma 5 ORM    ↓                                          │
│                          Bar / Kitchen / Dummy printers                 │
└────────────────────────────────────────────────────────────────────────┘
```

### Layering Rules (binding)

1. **Routes are thin.** Zod parse → one service call → HTTP response. No Prisma in routes.
2. **Services own business logic.** Order creation, totals, stock, print dispatch, WebSocket — all in `server/src/services/`.
3. **Side effects fan out from services.** Creating an order: persist → tear-off → stock decrement → print → WebSocket emit.
4. **Money is integer cents.** `priceCents Int`, `totalCents Int`. API exposes cents; client formats.
5. **PIN is write-only.** Accepted on create/update, verified by `/api/auth/login`, never returned.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full binding architecture document.

## Running the Application

### Development Mode

```bash
cd orderwas

# Install dependencies
npm install

# Reset & seed the database (first time or after schema changes)
cd server && npx prisma db push --force-reset && npx prisma generate && npx prisma db seed && cd ..

# Start dev servers (Vite :5173 + Fastify :3000, with HMR)
npm run dev
```

- **Frontend:** http://localhost:5173 (Vite dev server, proxies `/api` → :3000)
- **Backend:** http://localhost:3000 (Fastify with tsx watch, auto-restarts)
- **Admin UI:** http://localhost:5173/admin
- **Kitchen Monitor:** http://localhost:5173/kitchen
- **Station Display:** http://localhost:5173/station
- **Waiter Order:** http://localhost:5173/order

**Test login:** Waiter Alice → PIN `1234`, Waiter Bob → PIN `5678` (seeded event "Testfest")

### Production Mode (Docker)

```bash
cd orderwas

# Build and start
docker compose up -d

# Access
open http://localhost:8080
```

- Single container: client built → served via `@fastify/static` → one port (8080)
- SQLite data persisted on a named Docker volume
- Same image works on Raspberry Pi (ARM) and x86

### Quick Commands

```bash
npm run ci              # Full CI: typecheck → unit → build → E2E
npm run typecheck       # TypeScript check only
npm test                # Vitest unit + integration tests
npm run test:e2e        # Playwright E2E (auto-starts both servers)
npm run build           # Build both client + server

# Database reset (destructive!)
cd server && npx prisma db push --force-reset && npx prisma generate && npx prisma db seed
```

### Environment variables

In development auth enforcement is off by default (the seeded waiter logins are enough). For any real deployment set:

- **`JWT_SECRET`** — required. The server **refuses to boot** when `NODE_ENV=production` and `JWT_SECRET` is unset (never runs with the dev default secret).
- **`AUTH_ENFORCED=true`** — turns on the global auth guard in dev/test (and is implied in production). When enabled, every `/api/*` request and every WebSocket connection must carry a valid JWT, except the public pre-login reads and `POST /api/auth/login` / `POST /api/auth/admin/login` / `POST /api/guest/orders`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §8.

Admin superuser PIN: DB setting → `ADMIN_PIN` env → default `admin` (change it).

## Hardware Requirements

### Minimum Setup
- **Server:** Raspberry Pi 5 (or any Linux machine)
- **Database:** SQLite (zero-config, single-file)
- **Router:** WiFi router (2.4GHz/5GHz)
- **Printers:** 1+ ESC/POS network printer
- **Devices:** 1+ smartphone/tablet per waiter

### Recommended Setup
- **Server:** Raspberry Pi 5 + UPS
- **Router:** Dual-band WiFi with good coverage
- **Printers:** Epson TM-T20III or Munbyn
- **Devices:** Budget Android phones (Xiaomi Redmi A2)
- **Accessories:** PowerLAN adapters for outdoor events

### Estimated Hardware Cost
- Base station: ~€480
- 4 printer stations: ~€1,000
- 5 smartphones: ~€750
- Transport: ~€60
- **Total: ~€2,290**

## Deployment Scenarios

### Service Mode (Table Service)
Waiters take orders at tables, runners deliver from stations.

**Best for:** Traditional festivals with table service

### Bonkasse Mode (Voucher Cashier)
Guests pre-pay at register, get vouchers, redeem at stations.

**Best for:** Beer tents, self-service festivals

### Abholscheine Mode (Pickup Slips)
Guests order at register, pick up directly at station.

**Best for:** Simple setups with one pickup point

### Mixed Mode
Combine any modes simultaneously.

**Best for:** Complex festivals with multiple areas

## Key Design Decisions

### Database Strategy
- **SQLite as primary:** Lightweight, zero-config, single-file database
- **Swappable to PostgreSQL:** Architecture supports database abstraction
- **Single-event lifecycle:** DB only lives for one event, no migrations needed
- **Export/Import:** Configuration and settings can be saved/restored

### Frontend Design
- **Browser-based:** No native app install required
- **Responsive:** Optimized for phones, tablets, and desktops
- **Touch-friendly:** Large buttons, easy tap targets for volunteers
- **Offline-capable:** PWA with Service Workers for offline operation

### Localization
- **Primary:** German (DE)
- **Extensible:** i18n architecture supports multiple languages
- **Planned:** English (EN), French (FR), others as needed

### Licensing
- **GPL-3.0:** Encourages contributions, prevents closed-source forks
- **Commercial use:** Allowed, but must open-source derivative works
- **Community-driven:** Users must share modifications under same license

## Development

### Project Structure
```
orderwas/
├── docs/
│   ├── REQUIREMENTS.md          # Comprehensive requirements document
│   ├── orderjutsu-wiki-analysis.md  # Original Orderjutsu wiki analysis
│   └── screenshots/             # UI screenshots
├── src/
│   ├── frontend/                # PWA frontend
│   ├── backend/                 # REST API
│   └── printer/                 # ESC/POS printer driver
├── docker/
│   ├── Dockerfile               # Main application
│   └── docker-compose.yml       # Docker Compose config
├── scripts/
│   └── setup.sh                 # Setup script
└── README.md                    # This file
```

### Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Roadmap

#### Phase 1: Core MVP (Weeks 1–4)
- Basic data model
- Simple order taking
- ESC/POS printer support
- Basic admin interface
- Docker deployment

#### Phase 2: Essential Features (Weeks 5–8)
- Voucher system
- Stock management
- Kitchen monitor
- Settlement and reporting
- User permissions

#### Phase 3: Advanced Features (Weeks 9–12)
- App layout customization
- Multi-event support
- Transfer between waiters
- Collective billing
- Excel export

#### Phase 4: Polish & Scale (Weeks 13–16)
- Offline mode (Service Workers)
- QR code table ordering
- Multi-language support
- Performance optimization
- Documentation

## Comparison with Orderjutsu

| Feature | Orderjutsu | Orderwas |
|---------|------------|----------|
| **Source** | Closed source | Open source (MIT/GPL) |
| **License** | €600 one-time + €60/year | Free forever |
| **Platform** | Android APK only | Any browser (PWA) |
| **Server** | Raspberry Pi only | Any Linux/Docker |
| **Updates** | Manual | Docker pull |
| **Community** | Telegram group | GitHub community |
| **Documentation** | Wiki | GitHub docs |

## Comparison with Bierblock

| Feature | Bierblock | Orderwas |
|---------|-----------|----------|
| **Model** | Cloud SaaS | Self-hosted |
| **Pricing** | €299/year | Free |
| **Offline** | Limited | Full offline support |
| **Printers** | Browser only | ESC/POS network |
| **Hardware** | None required | Raspberry Pi + printers |
| **Maturity** | Newer | Building on Orderjutsu experience |

## License

Orderwas is licensed under the [GPL-3.0 License](LICENSE).

## Acknowledgments

- **Orderjutsu** by Alexander Herzog (Rent-a-Ninja) for inspiration
- **Bierblock** for competitive analysis
- **Fire departments and music clubs** across Austria and Switzerland for feedback

## Support

- **Issues:** [GitHub Issues](https://github.com/your-username/orderwas/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-username/orderwas/discussions)
- **Documentation:** [docs/](docs/)

---

**Made with ❤️ for the festival community**
