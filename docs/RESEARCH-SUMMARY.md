# Orderwas — Research Summary

**Date:** 2026-08-14
**Status:** Complete

---

## What We Analyzed

### 1. Orderjutsu (orderjutsu.org)
- **Main website:** Marketing, pricing, features overview
- **Wiki (wiki.orderjutsu.org):** 18 configuration pages, hardware setup, version history
- **YouTube videos:** 
  - Demo video (i0wGwtOLjXg): Full order flow walkthrough
  - Testimonials (MeJDsSPii-o): User interviews from 6+ clubs
- **Product page:** Pricing, license details, hardware requirements

### 2. Bierblock (bierblock.app)
- **Main website:** Features, pricing, workflow
- **Feature analysis:** QR codes, floor plan, real-time overview
- **Comparison:** Positioning, pricing model, target audience

---

## Key Findings

### Orderjutsu Strengths
1. **Mature product** (2019–2026, 14+ major versions)
2. **Offline-first** — works without internet
3. **One-time purchase** (€600 + €60/year updates)
4. **Pre-built Raspberry Pi image** — plug and play
5. **Active community** (Telegram support group)
6. **Comprehensive wiki** — detailed documentation
7. **ESC/POS printer support** — industry standard
8. **Multiple deployment modes** (Service, Bonkasse, Mixed)

### Orderjutsu Weaknesses
1. **Closed source** — can't modify or extend
2. **Android-only** — APK install required
3. **Raspberry Pi only** — limited hardware options
4. **No cloud option** — self-hosted only
5. **Manual setup** — requires technical knowledge

### Bierblock Strengths
1. **Browser-based** — no app install
2. **QR code table ordering** — guest self-service
3. **Real-time shared overview** — all helpers see same state
4. **Floor plan editor** — visual layout
5. **AI analytics** — post-event insights
6. **Modern UI** — clean, intuitive design

### Bierblock Weaknesses
1. **Subscription model** (€299/year)
2. **Cloud-only** — requires internet
3. **No printer support** — browser-based only
4. **Newer product** — less mature
5. **Limited offline** — sync issues

---

## Features for Orderwas

### From Orderjutsu (Core)
✅ **Must-Have (Phase 1):**
- Order taking with customizable button grid
- ESC/POS printer support
- Multiple stations (kitchen, bar, coffee)
- Voucher system (Gutscheine)
- Stock management (Lagerstände)
- Kitchen monitor display
- Settlement and reporting
- User/role management

### From Bierblock (Enhancements)
✅ **High Priority (Phase 1-2):**
- QR Code table ordering
- Real-time shared overview
- Event templates
- PDF export
- Offline mode with sync

🟡 **Medium Priority (Phase 3):**
- Floor plan editor
- Basic analytics

🟢 **Low Priority (Phase 4):**
- AI-powered analytics

---

## Architecture Decisions

### Orderwas Stack
- **Frontend:** Progressive Web App (PWA)
- **Backend:** Node.js/Python/Go REST API
- **Database:** SQLite or PostgreSQL
- **Deployment:** Docker container
- **Network:** Local WiFi or LAN
- **Printers:** ESC/POS protocol over network

### Philipp's Specific Requirements

#### Database Strategy
- **Primary:** SQLite (lightweight, zero-config, single-file)
- **Swappable:** Architecture supports PostgreSQL as alternative
- **No migrations:** DB only lives for a single event/party
- **Export/Import:** Configuration and settings must be exportable/importable
- **Rationale:** Each event starts fresh; no long-term data persistence needed

#### Frontend Requirements
- **Browser-based:** No native app install required
- **Responsive:** Optimized for phones and tablets
- **PWA:** Progressive Web App for offline capability
- **Touch-friendly:** Large buttons, easy tap targets
- **Fast:** < 3 second page loads, < 1 second interactions

#### Localization Strategy
- **Primary:** German (DE)
- **Localizable:** Architecture supports i18n from day one
- **Planned:** English (EN), French (FR), others as needed
- **Approach:** JSON translation files

#### Licensing
- **License:** GPL-3.0 or AGPL-3.0
- **Rationale:** Encourage contributions, prevent closed-source forks
- **Commercial use:** Allowed, but must open-source derivative works

### Key Design Principles
1. **Offline-first** — works without internet
2. **Browser-based** — no app install required
3. **Self-hosted** — clubs own their data
4. **Open source** — MIT/GPL license
5. **Hardware agnostic** — runs on any Linux/Docker

---

## Implementation Roadmap

### Phase 1: Core MVP (Weeks 1–4)
- Basic data model
- Simple order taking
- ESC/POS printer support
- Basic admin interface
- Docker deployment
- Real-time shared overview
- Demo mode

### Phase 2: Essential Features (Weeks 5–8)
- Voucher system
- Stock management
- Kitchen monitor
- Settlement and reporting
- User permissions
- QR Code table ordering
- Event templates
- PDF export
- Offline mode with sync

### Phase 3: Advanced Features (Weeks 9–12)
- App layout customization
- Multi-event support
- Transfer between waiters
- Collective billing
- Excel export
- Floor plan editor
- Basic analytics

### Phase 4: Polish & Scale (Weeks 13–16)
- Multi-language support
- Performance optimization
- Documentation and tutorials
- AI-powered analytics

---

## Success Criteria

### Functional Requirements
- ✅ Waiter can take order in < 10 seconds
- ✅ Receipt prints in < 2 seconds
- ✅ System handles 20+ simultaneous waiters
- ✅ Works offline (no internet required)
- ✅ Supports ESC/POS printers
- ✅ QR code table ordering works
- ✅ Real-time updates visible to all users
- ✅ Offline mode syncs correctly
- ✅ Configuration export/import works
- ✅ German UI is complete and accurate
- ✅ English/French translations load correctly
- ✅ Responsive design works on phones and tablets
- ✅ SQLite database operates correctly
- ✅ PostgreSQL swap works (when implemented)

### Non-Functional Requirements
- ✅ Single Raspberry Pi handles 1000+ orders
- ✅ 99.9% uptime during events
- ✅ Zero data loss on power failure
- ✅ Setup time < 30 minutes
- ✅ Volunteer training time < 5 minutes

---

## Files Created

```
orderwas/
├── README.md                           # Project overview & quick start
└── docs/
    ├── REQUIREMENTS.md                 # 811 lines — comprehensive requirements
    ├── bierblock-analysis.md           # 308 lines — Bierblock feature analysis
    ├── orderjutsu-wiki-analysis.md     # 297 lines — Original wiki crawl data
    └── screenshots/
        ├── orderjutsu-homepage-hero.png
        ├── orderjutsu-process-flow.png
        ├── orderjutsu-advantages.png
        ├── orderjutsu-pricing.png
        └── orderjutsu-wiki-features.png
```

**Total:** 1,416 lines of documentation + 5 screenshots

---

## Next Steps

1. **Review requirements document** — `/home/biephi/hermine/orderwas/docs/REQUIREMENTS.md`
2. **Choose tech stack** — Node.js vs Python vs Go
3. **Create GitHub repository** — Initialize project structure
4. **Begin Phase 1** — Core MVP implementation

---

## Key Insights

### 1. QR Code Table Ordering is the Killer Feature
Bierblock's standout feature is QR code ordering. We should include it in Phase 2 with a simplified approach: guests scan QR codes to order, but a waiter confirms and routes the order. This keeps the human in the loop while reducing friction.

### 2. Offline-First is Non-Negotiable
Both Orderjutsu and Bierblock emphasize offline capability. Festival WiFi is unreliable. Our system must work offline for 8+ hours and sync when connection is restored.

### 3. Simplicity Wins
Volunteers have zero training time. The system must be intuitive enough that a new helper can take orders within 5 minutes. Bierblock's "so schnell wie ein Strich am Block" (as fast as a tally on the pad) is the right benchmark.

### 4. Open Source is Our Differentiator
Orderjutsu is closed source (€600). Bierblock is SaaS (€299/year). Orderwas will be free forever, self-hosted, and community-driven. This is our competitive advantage.

### 5. Hardware Flexibility Matters
Orderjutsu locks you into Raspberry Pi. We should support any Linux/Docker environment, from Raspberry Pi to cloud servers. This makes Orderwas accessible to more clubs.

---

*This research is based on comprehensive analysis of Orderjutsu's website, wiki, YouTube videos, and Bierblock's website. All information is current as of August 2026.*
