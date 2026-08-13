# Orderwas — Design Decisions

**Date:** 2026-08-14
**Status:** Final

---

## Philipp's Requirements Summary

### 1. Database Strategy ✅

**Decision:** SQLite as primary, PostgreSQL as swappable alternative

**Rationale:**
- **SQLite:** Lightweight, zero-config, single-file database
- **No migrations:** DB only lives for a single event/party
- **Swappable:** Architecture supports database abstraction layer
- **Export/Import:** Configuration and settings must be exportable/importable

**Implementation:**
- Use ORM (Prisma, TypeORM, SQLAlchemy) for database abstraction
- SQLite for development and single-server deployments
- PostgreSQL option for multi-server or cloud deployments
- Export/import via JSON configuration files

**Why this works:**
- Each event starts fresh — no need for long-term data persistence
- Clubs can save their configuration (products, stations, layouts) and reload for next event
- No complex migration scripts needed
- SQLite is perfect for Raspberry Pi deployments

---

### 2. Frontend Design ✅

**Decision:** Browser-based PWA, responsive, optimized for phones and tablets

**Rationale:**
- **No app install:** Volunteers use their own devices (BYOD)
- **Responsive:** Works on phones, tablets, and desktops
- **Touch-friendly:** Large buttons (44x44px minimum), easy tap targets
- **Fast:** < 3 second page loads, < 1 second interactions
- **Offline-capable:** PWA with Service Workers

**Implementation:**
- Progressive Web App (PWA) architecture
- Mobile-first responsive design
- Touch-optimized UI components
- Service Workers for offline operation
- Local storage for offline data

**Why this works:**
- Zero friction for volunteers — just open a URL
- Works on personal devices (no need to provide hardware)
- Modern web standards ensure compatibility
- PWA provides native-app-like experience

---

### 3. Localization Strategy ✅

**Decision:** German (DE) primary, localizable architecture

**Rationale:**
- **Primary:** German (target audience is Austrian/German clubs)
- **Localizable:** Architecture supports i18n from day one
- **Planned:** English (EN), French (FR), others as needed
- **Approach:** JSON translation files, locale detection

**Implementation:**
- i18n library (react-intl, vue-i18n, or similar)
- JSON translation files per language
- Locale detection from browser settings
- Language switcher in UI
- RTL support not needed initially

**Why this works:**
- Serves the primary market (DACH region)
- Architecture supports future expansion
- JSON files are easy to maintain and translate
- Community can contribute translations

---

### 4. Licensing ✅

**Decision:** GPL-3.0 or AGPL-3.0

**Rationale:**
- **Encourage contributions:** Users must share modifications
- **Prevent closed forks:** Can't create proprietary versions
- **Community-driven:** Ensures improvements benefit everyone
- **Commercial use:** Allowed, but must open-source derivative works

**Implementation:**
- GPL-3.0 for desktop/server applications
- AGPL-3.0 for web applications (if SaaS hosting is a concern)
- Clear license file in repository
- Contributor License Agreement (CLA) optional

**Why this works:**
- Protects the open-source nature of the project
- Encourages community contributions
- Prevents "embrace and extend" strategies
- Aligns with the festival community's collaborative spirit

---

### 5. Development Approach ✅

**Decision:** Local git repository for now

**Rationale:**
- **No GitHub yet:** Keep development private until ready
- **Version control:** Git from day one
- **Collaboration:** Add contributors later when stable
- **Migration:** Easy to push to GitHub/GitLab later

**Implementation:**
- Local git repository
- Conventional commits
- Feature branches
- Pull request workflow (when going public)

**Why this works:**
- Allows experimentation without public scrutiny
- Can develop and test before announcing
- Git history preserved when going public
- No pressure to maintain public image during development

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    ORDERWAS ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Frontend   │    │   Backend    │    │   Database   │  │
│  │    (PWA)     │◄──►│   (REST)     │◄──►│   (SQLite)   │  │
│  │              │    │              │    │              │  │
│  │ • React/Vue  │    │ • Node.js    │    │ • Primary    │  │
│  │ • Responsive │    │ • Express    │    │ • Swappable  │  │
│  │ • i18n       │    │ • WebSocket  │    │ • Exportable │  │
│  │ • Offline    │    │ • REST API   │    │              │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Printers   │    │   Kitchen    │    │   QR Codes   │  │
│  │  (ESC/POS)   │    │   Monitor    │    │   (Tables)   │  │
│  │              │    │              │    │              │  │
│  │ • Network    │    │ • Real-time  │    │ • Generation │  │
│  │ • Bluetooth  │    │ • WebSocket  │    │ • Scanning   │  │
│  │ • USB        │    │ • Display    │    │ • Ordering   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend
- **Framework:** React or Vue.js (TBD)
- **Styling:** Tailwind CSS or similar
- **State:** Zustand, Pinia, or Redux
- **i18n:** react-intl, vue-i18n, or similar
- **PWA:** Service Workers, Web App Manifest

### Backend
- **Runtime:** Node.js (TypeScript)
- **Framework:** Express.js or Fastify
- **ORM:** Prisma, TypeORM, or Sequelize
- **Database:** SQLite (primary), PostgreSQL (alternative)
- **WebSocket:** Socket.io or ws

### Infrastructure
- **Container:** Docker
- **Deployment:** Docker Compose
- **Reverse Proxy:** Nginx or Caddy
- **SSL:** Let's Encrypt (optional)

---

## Development Phases

### Phase 1: Core MVP (Weeks 1–4)
- [ ] Project setup (git, Docker, CI/CD)
- [ ] Database schema (SQLite)
- [ ] Basic REST API
- [ ] Simple order taking UI
- [ ] ESC/POS printer support
- [ ] German localization

### Phase 2: Essential Features (Weeks 5–8)
- [ ] Voucher system
- [ ] Stock management
- [ ] Kitchen monitor
- [ ] QR code table ordering
- [ ] Event templates
- [ ] Export/import configuration

### Phase 3: Advanced Features (Weeks 9–12)
- [ ] Floor plan editor
- [ ] Real-time shared overview
- [ ] Offline mode with sync
- [ ] PDF export
- [ ] English/French localization

### Phase 4: Polish & Scale (Weeks 13–16)
- [ ] Performance optimization
- [ ] Advanced analytics
- [ ] Documentation
- [ ] Community preparation
- [ ] GitHub/GitLab migration

---

## Next Steps

1. **Initialize git repository** — `/home/biephi/hermine/orderwas`
2. **Choose frontend framework** — React vs Vue.js
3. **Choose backend framework** — Express vs Fastify
4. **Design database schema** — SQLite tables
5. **Create project structure** — Directories, config files
6. **Begin Phase 1** — Core MVP implementation

---

*These design decisions are based on Philipp's specific requirements and the comprehensive analysis of Orderjutsu and Bierblock.*
