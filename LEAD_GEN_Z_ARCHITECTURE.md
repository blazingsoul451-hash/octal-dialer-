# LEAD GEN Z — Product Architecture & System Specification

## 1. Executive Summary
**LEAD GEN Z** is an independent, standalone lead generation and prospect discovery platform engineered as part of the Zestify ecosystem. The system decouples external lead scraping, discovery jobs, and lead list curation from the core Zestify customer relationship management (CRM) and telephony engine.

## 2. Product Identity & Ecosystem Boundaries
- **Product Name**: LEAD GEN Z
- **Brand Subtitle**: Lead Generation by Zestify
- **Mission**: Discovered prospect intelligence, multi-channel extraction (Google Maps & Facebook), deduplication, and export.
- **Zestify Core Mission**: Canonical CRM, GSM Auto Dialer, Cold Email Manager, and Facebook Auto Poster.

| Architecture Dimension | LEAD GEN Z | ZESTIFY CRM |
| :--- | :--- | :--- |
| **Primary Role** | Prospect Discovery & Scraper Extraction | Customer Intelligence & Telephony CRM |
| **Local Frontend Port** | `http://localhost:5174` | `http://localhost:5173` |
| **Local Backend Port** | `http://localhost:5001` | `http://localhost:5000` |
| **Target Cloud Domain** | `leads.zestify7.online` | `app.zestify7.online` |
| **Target Cloud API** | `lead-api.zestify7.online` | `api.zestify7.online` |
| **Data Owned** | Discovered prospects, search presets, lead lists, extraction logs, credit allowances | Contacts, companies, pipelines, campaigns, call logs, SIM pairing, tasks, quotes |
| **External Integrations** | Playwright, Google Maps Places, Facebook Search | GSM Android Telephony, Cloudflare Tunnels, SMTP/IMAP |

## 3. Core Component Layout
```
lead-gen-z/
├── .env.example                     # Environment template without secrets
├── README.md                        # Quick start & documentation
├── backend/                         # Standalone Node/Express Engine (Port 5001)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts                # Express server with RESTful discovery routes
│       └── services/
│           ├── deduplication.ts     # Multi-factor deduplication algorithm
│           └── localDb.ts           # Local persistent store for discovery prospects
└── frontend/                        # Vite + React 19 Frontend (Port 5174)
    ├── package.json
    ├── vite.config.ts               # Strict port 5174 configuration
    ├── tailwind.config.js           # Obsidian dark background + gold accents
    ├── index.html
    └── src/
        ├── App.tsx                  # Standalone layout & routing
        ├── components/
        │   ├── Header.tsx           # Global branding, credits counter, theme toggle
        │   ├── Sidebar.tsx          # 8-tab clean navigation
        │   ├── DedupeBadge.tsx      # Status indicators (NEW, DUPLICATE, SAVED, SENT)
        │   └── SendToZestifyModal.tsx # Canonical integration boundary modal
        ├── pages/
        │   ├── Dashboard.tsx        # 6 KPI cards, activity feed, list highlights
        │   ├── GoogleLeads.tsx      # Google Maps discovery workspace
        │   ├── FacebookLeads.tsx    # Facebook scraper workspace & live log console
        │   ├── LeadLists.tsx        # Curated lists (Dubai Real Estate, Dental Clinics)
        │   ├── SavedLeads.tsx       # Master repository & multi-filter table
        │   ├── Exports.tsx          # CSV & Excel streaming generator
        │   ├── Integrations.tsx     # Zestify Direct Connect & contract spec
        │   └── Settings.tsx         # Deduplication rules & roadmap display
        └── types/
            └── leadgen.ts           # Canonical TypeScript interfaces
```

## 4. Navigation Structure (8 Tabs)
1. **Dashboard**: High-level telemetry showing Leads Generated, Saved Leads, Lead Lists, Exports, Sent to Zestify, and Credits / Usage meters with live activity feed.
2. **Google Leads**: Query-based B2B lead discovery adapted from Google Maps places, with telephone, email, and website enrichment toggles.
3. **Facebook Leads**: Group member and page extraction with profile selector, rate-limited execution, and live terminal logging.
4. **Lead Lists**: Custom segmented lists (such as *Dubai Real Estate Companies* [430 prospects] and *Dental Clinics Texas* [210 prospects]).
5. **Saved Leads**: Master prospect database with real-time status badges (`NEW`, `POSSIBLE DUPLICATE`, `ALREADY SAVED`, `ALREADY SENT TO ZESTIFY`).
6. **Exports**: Instant generation of clean CSV and XLSX spreadsheets with historical download logs.
7. **Integrations**: Zestify Direct Connect interface, endpoint contract details, and future CRM connector placeholders.
8. **Settings**: Configurable deduplication matching criteria and credit limit controls.

## 5. Deduplication Engine Specification
Prospects are evaluated against local datasets and canonical CRM leads before being marked. Matching rules evaluate:
- **Normalized Email**: Trims whitespace and enforces case-insensitivity.
- **Normalized Phone Digits**: Compares dialable digits, evaluating suffix matches (last 8 digits) across regional dialing codes.
- **Domain Matching**: Strips protocol (`http://`, `https://`), subdomain (`www.`), and path to compare root domains.
- **Entity & Location Match**: Fuzzy match on company title combined with city or regional territory.

Status Hierarchy:
- `NEW`: Completely novel prospect with zero matching identifiers.
- `POSSIBLE DUPLICATE`: Shares phone suffix, email domain, or company name with existing lead.
- `ALREADY SAVED`: Already exists in the user's saved prospects database.
- `ALREADY SENT TO ZESTIFY`: Successfully ingested into Zestify via the integration boundary.

## 6. Integration Boundary & Contract Specification
To avoid database coupling and preserve tenant data isolation, Lead Gen Z never writes directly to Zestify database tables. All transfers flow through the authenticated integration boundary:

- **Endpoint**: `POST /api/integrations/leadgen/import`
- **Host**: `http://localhost:5000` (or `api.zestify7.online`)
- **Headers**:
  ```http
  Content-Type: application/json
  Authorization: Bearer <jwt_or_api_token>
  ```
- **Payload Schema**:
  ```json
  {
    "records": [
      {
        "name": "Acme Holdings LLC",
        "phone": "+971 4 367 3333",
        "email": "contact@acme.com",
        "website": "acme.com",
        "address": "Downtown Dubai, Blvd Plaza",
        "category": "Real Estate",
        "source": "lead_gen_z_google",
        "notes": "Discovered via Lead Gen Z"
      }
    ],
    "source": "lead_gen_z",
    "workspaceId": "tenant_default",
    "campaignName": "Dubai Luxury Real Estate Q4",
    "crmCompanyId": "optional_company_id",
    "teamId": "optional_team_id",
    "assignedUserId": "optional_user_id",
    "tags": ["lead_gen_z", "dubai", "real_estate"]
  }
  ```
- **Zestify Responsibilities**:
  1. Validates dialable telephone numbers (minimum 7 digits).
  2. Executes tenant-isolated deduplication against existing CRM leads.
  3. Creates campaign entries and appends leads within an advisory-locked transaction.
  4. Dispatches WebSocket events (`leads:updated`, `campaigns:updated`) to immediately refresh live agent screens.

## 7. Future Authentication & SSO Roadmap
In local development, Lead Gen Z operates independently with default tenant mapping to `tenant_default` and optional Bearer token passthrough.
For cloud production:
- A shared JWT authentication cookie or OAuth2 session issued by `api.zestify7.online` will allow seamless single sign-on across `app.zestify7.online` and `leads.zestify7.online`.
- Tenant claims and user role permissions will govern cross-product access.

## 8. Future Commercial & Billing Model
Lead Gen Z is structured as an independent commercial product with standalone and bundled options:
- **Lead Discovery Credits**: Metered monthly quota (e.g. Starter: 2,500 leads/mo; Pro: 10,000 leads/mo; Enterprise: 50,000+ leads/mo).
- **Subscription Models**:
  1. *Lead Gen Z Standalone*: For prospecting agencies and SDRs requiring list exports only.
  2. *Zestify CRM Standalone*: For operations teams utilizing dialers and pipeline management.
  3. *Zestify Growth Bundle*: Full access combining discovery credits with automatic CRM push.
