# ZESTIFY — Product Split & CRM Stabilization Report

## 1. Executive Summary & Purpose of Split
The strategic separation of lead generation from the core Zestify platform accomplishes two vital architectural goals:
1. **Core Telephony & CRM Stability**: Zestify is dedicated exclusively to CRM contact management, pipeline tracking, cold email orchestration, GSM multi-channel auto-dialing, and Facebook Auto Posting. Removing unauthenticated and volatile scraper web jobs guarantees that heavy crawling workloads never exhaust server CPU, memory, or bandwidth allocated to active call sessions.
2. **Dedicated Lead Discovery Platform**: LEAD GEN Z can iterate, scale, and schedule scraping workflows independently on dedicated ports (`http://localhost:5174` / `5001`), with its own deduplication logic and data schema.

---

## 2. Zestify Modifications & De-Listing

### 2.1 Navigation Menu De-Listing (`website_octal_dialer/frontend/src/App.tsx`)
The customer navigation sidebar has been cleanly updated. The menu items previously pointing to Google Maps Scraper and Facebook Scraper were removed from customer-facing navigation. 
- **Preserved Feature**: **Facebook Auto Poster** remains 100% active and available under the marketing section of Zestify, as it is an authorized social publishing and automation tool rather than an unauthenticated scraper.

### 2.2 Company Settings Module Grid (`website_octal_dialer/frontend/src/views/CompanySettings.tsx`)
In the company management view, the `Google Scraper` module was de-listed from active tenant toggle surfaces. Existing company configurations are preserved without showing dormant scraper checkboxes.

### 2.3 Role & Permission Matrix (`website_octal_dialer/frontend/src/views/UsersAndRolesView.tsx`)
The module permission keys `googleScraper` and `facebookScraper` were removed from `AVAILABLE_MODULES`. This prevents permission drift or confusing role assignments for platform users while retaining canonical CRM permissions (Contacts, Pipelines, Auto Dialer, Email, Analytics).

---

## 3. Preservation of Underlying Scraper Engine Code

To ensure backward compatibility and prevent broken dependencies with any existing historical campaign logs or database records, **no scraper engine code was deleted**:
- `website_octal_dialer/backend/src/services/googleMapsScraperService.ts` remains intact.
- `website_octal_dialer/backend/src/services/scraperWorker.ts` remains intact.
- `website_octal_dialer/backend/src/scrapers/facebook_scraper.js` remains intact.
- Database tables, historical scraper logs, and lead association foreign keys remain untouched.

---

## 4. The Formal Integration Bridge (`POST /api/integrations/leadgen/import`)

To allow prospects discovered in LEAD GEN Z to seamlessly transition into active sales pipelines, a hardened integration endpoint was implemented in `website_octal_dialer/backend/src/server.ts`:

### 4.1 Endpoint Specification
- **Method**: `POST`
- **URL**: `http://localhost:5000/api/integrations/leadgen/import`
- **Authentication**: Bearer JWT or Pre-Shared Integration Key (`x-integration-key`).

### 4.2 Request Payload
```json
{
  "campaignName": "Dubai Luxury Property Outreach Q4",
  "companyId": "comp_default_octal",
  "leads": [
    {
      "name": "Emaar Properties PJSC",
      "phone": "+97143673333",
      "email": "enquiry@emaar.ae",
      "address": "Downtown Dubai, Dubai, UAE",
      "city": "Dubai",
      "website": "https://www.emaar.com",
      "source": "lead-gen-z:google",
      "notes": "Rating: 4.8 | Reviews: 1,420 | Scraped: 2026-09-21"
    }
  ]
}
```

### 4.3 Internal Processing Flow
1. **Tenant Validation**: Identifies company context from authenticated token or default tenant (`comp_default_octal`).
2. **Campaign Lifecycle**: Checks if `campaignName` exists for the tenant; if not, automatically invokes `createCampaign()` to create a fresh sales campaign.
3. **Contact Normalization & Validation**:
   - Strips non-digit characters to ensure valid E.164 phone number formatting (minimum 7 digits required).
   - Validates email formatting.
4. **Tenant-Isolated Deduplication**:
   - Queries existing contacts for the target company.
   - Skips duplicate phone numbers and emails to preserve pipeline hygiene.
5. **Campaign Linking**: Links newly created contacts directly to the campaign for immediate dialing or email sequencing.
6. **Real-Time WebSocket Notification**: Emits `leads:updated` and `campaigns:updated` socket events to all active Zestify client sessions.

### 4.4 Response Payload
```json
{
  "success": true,
  "importedCount": 1,
  "duplicateCount": 0,
  "campaignId": "camp_hsu0fftgj",
  "message": "Successfully imported 1 leads into campaign camp_hsu0fftgj"
}
```

---

## 5. Data Ownership & Boundary Matrix

| Domain / Entity | LEAD GEN Z | ZESTIFY CRM |
| :--- | :--- | :--- |
| **Search Queries & Geospatial Coordinates** | Primary Owner (Local DB) | None |
| **Raw Scraped Results & HTML DOM Snapshots** | Primary Owner (Local DB) | None |
| **Discovery Credits & Quotas** | Primary Owner | None |
| **Lead Lists (Folders / Tags)** | Primary Owner | None |
| **Deduplication State (Discovered vs Saved)** | Primary Owner | None |
| **Contacts & Companies** | Read/Push Target | Authoritative Master |
| **Dialing Campaigns & Call Queues** | None | Authoritative Master |
| **GSM SIM Cards & Android Device Gateways** | None | Authoritative Master |
| **Call Logs, Recordings & Transcripts** | None | Authoritative Master |
| **Cold Email Sequences & Mailboxes** | None | Authoritative Master |
| **Facebook Auto Poster Scheduled Posts** | None | Authoritative Master |

---

## 6. Multi-Tenant & Security Isolation

- **Zero Cross-Contamination**: Scraper processes running in LEAD GEN Z cannot access Zestify's database connection pool or internal memory tables.
- **Tenant Scoping**: All leads sent via the integration bridge must specify a valid `companyId`. Cross-tenant data injection is prevented at the endpoint boundary.
- **No Shared Secrets**: Lead Gen Z does not store production database passwords, Twilio credentials, or SMTP secrets.

---

## 7. Cloud Deployment & Future SSO Roadmap

### 7.1 Domain & Subdomain Strategy
When ready for cloud deployment, the two products will sit on isolated subdomains behind Cloudflare:
- **Zestify Application**: `https://app.zestify7.online`
- **Zestify Core API**: `https://api.zestify7.online`
- **Lead Gen Z Application**: `https://leads.zestify7.online`
- **Lead Gen Z API**: `https://lead-api.zestify7.online`

### 7.2 Unified Single Sign-On (SSO) Architecture
- An OAuth2 / OpenID Connect authorization server will issue cross-domain JSON Web Tokens with audience scopes (`aud: ["zestify-crm", "lead-gen-z"]`).
- A shared user dropdown in the top header will permit seamless 1-click switching between "CRM & Dialer" and "Lead Gen Z".

---

## 8. Verification & Audit Summary
- Zestify navigation cleanly compiled and verified with zero TypeScript errors.
- Visual audit screenshots (`011_zestify_navigation.png`, `012_zestify_company_modules.png`) prove the de-listing was completed cleanly.
- Loopback transfer from Lead Gen Z to Zestify executed successfully and verified live.
