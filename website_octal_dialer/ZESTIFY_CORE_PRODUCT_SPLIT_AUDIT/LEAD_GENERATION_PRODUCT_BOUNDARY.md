# Standalone Lead Generation Product: Architectural Boundary & Integration Contract

**Document Status**: Architectural Specification & Design Contract (Design Phase Only — No Implementation Yet)  
**Author**: Antigravity Engineering  
**Target Architecture**: Decoupled Lead Generation SaaS $\leftrightarrow$ Zestify Core CRM & Dialer  

---

## 1. Product Vision & Separation of Concerns

### Zestify Core Product
The core sales execution, communication, and customer relationship platform:
- **CRM Workspace**: Companies, Contacts, Quotes, Tasks, Meetings, Deliverables.
- **OCTAL Auto Dialer**: Multi-line telephony, browser WebRTC, mobile companion, call outcomes.
- **Email Manager**: Cold outreach sequences, SMTP delivery, template management.
- **Facebook Auto Poster**: Organic social presence, group marketing, content scheduling.

### Standalone Lead Generation Product
An independent prospect discovery, scraping, and lead qualification platform:
- **Google Maps Discovery**: Hyper-local B2B business search, geocoding, verified phone/email discovery.
- **Facebook Group Discovery**: Group member analysis, profile interest extraction, lead lists.
- **Search & Filters**: Geographic filters, category taxonomy, review score thresholds, website presence.
- **Lead Lists & Staging**: Prospect buckets, custom tags, verification status.
- **Deduplication Engine**: Internal cross-list deduplication and historical search caching.
- **Lead Credits & Monetization**: Search quotas, export credits, standalone billing model.
- **Export & Dispatch**: CSV/Excel downloads and one-click "Send to Zestify".

---

## 2. Authority & Domain Ownership Matrix

To prevent data drift, double billing, and architectural coupling, strict domain boundaries are defined:

| Domain Entity / Capability | Standalone Lead Generator | Zestify Core Platform | Rationale |
|---|:---:|:---:|---|
| **Prospect Discovery & Web Scraping** | **AUTHORITATIVE** | ❌ None | Scraper engines, Puppeteer headless workers, and proxy rotation belong exclusively to Lead Gen. |
| **Search Queries & Saved Searches** | **AUTHORITATIVE** | ❌ None | Scrape histories, search keywords, radius, and run logs are preserved in Lead Gen. |
| **Prospect Source Records** | **AUTHORITATIVE** | ❌ None | Raw scraped HTML, metadata, opening hours, raw review counts. |
| **Lead Credits & Scraper Billing** | **AUTHORITATIVE** | ❌ None | Consumption of scraping credits is billed independently of Zestify CRM seats. |
| **Canonical Leads Database** | ❌ None | **AUTHORITATIVE** | Once imported, the record becomes a canonical `leads` row owned by the Zestify tenant. |
| **CRM Company & Contact Records** | ❌ None | **AUTHORITATIVE** | Client account lifecycle, deal stages, and account hierarchies live in Zestify CRM. |
| **Calling, Telephony & Recordings** | ❌ None | **AUTHORITATIVE** | WebRTC dialer, Android SIM link, call dispatch, and audio logs belong strictly to Zestify. |
| **Teams, Users & Tenant Hierarchy** | ❌ None | **AUTHORITATIVE** | Zestify maintains the 4-tier RBAC (Platform $\rightarrow$ Owner $\rightarrow$ Team Lead $\rightarrow$ Member). |
| **Outreach Campaigns & Sequences** | ❌ None | **AUTHORITATIVE** | Dialer call queues and Email Manager sequences are scheduled and tracked in Zestify. |

---

## 3. Future User Flow: "Send to Zestify"

```
[ Lead Generation App ]
        │
  1. User discovers prospects via Google Maps / FB Scraper
        │
  2. Prospects saved to staging Lead List ("Dentists in Dallas")
        │
  3. User selects 150 qualified records
        │
  4. User clicks [ Send to Zestify ]
        │
  5. Integration Modal Prompts:
     ├── Select Target Zestify Workspace (Tenant)
     ├── Target Campaign (e.g. "Q4 Inbound Dialer Campaign")
     ├── Target CRM Company (Optional: Create new or link existing)
     ├── Assign to Team / User (Optional)
     └── Deduplication Strategy ("Skip", "Update", "Tag Duplicate")
        │
        ▼
[ Secure API Ingestion ] ── POST /api/integrations/leadgen/import ──▶ [ Zestify Core ]
                                                                             │
                                                                    6. Ingests into canonical `leads`
                                                                    7. Links to `crm_companies`
                                                                    8. Emits `leads:updated` to dialer queue
```

---

## 4. Integration API Specification

### Endpoint: `POST /api/integrations/leadgen/import`
- **Authentication**: Bearer API Key (`x-api-key` or `Authorization: Bearer <tenant_integration_token>`)
- **Tenant Scope**: Derived cryptographically from the integration token.
- **Idempotency**: Supports `Idempotency-Key` header to prevent double imports on network retry.

#### Request Payload (Concept)
```json
{
  "source": "leadgen_google_maps",
  "importBatchId": "batch_lg_20260921_001",
  "targetCampaignId": "camp_us_sales_q4",
  "targetCrmCompanyId": "comp_99812_acme", 
  "assignedUserId": "user_sales_agent_01",
  "assignedTeamId": "team_inbound",
  "deduplication": {
    "matchOn": ["phone", "email"],
    "onDuplicate": "skip"
  },
  "tags": ["leadgen_export", "dentist", "dallas_tx"],
  "leads": [
    {
      "name": "Dr. Sarah Jenkins",
      "phone": "+12145550198",
      "email": "drjenkins@dfwdental.com",
      "address": "4520 Preston Rd, Dallas, TX 75205",
      "country": "US",
      "requirement": "General Dentistry & Orthodontics",
      "companyName": "Preston Hollow Dental Care",
      "website": "https://dfwdental.com",
      "externalSourceId": "gmap_place_ChIJN1t_tDeuEmsRUsoyG83frY4",
      "metadata": {
        "googleRating": 4.8,
        "reviewCount": 142
      }
    }
  ]
}
```

#### Response Payload (Concept)
```json
{
  "success": true,
  "batchId": "batch_lg_20260921_001",
  "summary": {
    "totalReceived": 1,
    "imported": 1,
    "skippedDuplicates": 0,
    "updated": 0,
    "errors": 0
  },
  "createdLeadIds": ["lead_1790002148_a8b9"],
  "crmCompanyLinked": "comp_99812_acme"
}
```

---

## 5. Deduplication Strategy Design

To prevent polluting customer dialer queues and CRM databases with redundant contacts, the import pipeline will enforce 4-tier deduplication:

1. **Normalized Phone Match**:
   - Compares E.164 normalized phone numbers against existing `leads.phone` within the tenant.
2. **Normalized Email Match**:
   - Case-insensitive comparison against `leads.email` and `crm_contacts.email`.
3. **Company / Website Domain Match**:
   - Hostname normalization (e.g. `www.dfwdental.com` $\rightarrow$ `dfwdental.com`) matched against `crm_companies.website`.
4. **External Source Identifier**:
   - Unique place ID / Facebook profile ID stored in `leads.externalId` preventing duplicate ingestion of the exact same scrape hit across batches.

---

## 6. Architectural Invariant: No Shared Database

> [!CAUTION]
> The Standalone Lead Generation product **MUST NOT** directly connect to or modify the Zestify PostgreSQL database.

### Direct Database Access Antipattern (Rejected):
- ❌ Lead Gen connects via SQL to Zestify DB $\rightarrow$ Bypasses tenant access rules, breaks multi-tenant triggers, risks race conditions on call dispatch, and creates tight schema coupling.

### Decoupled API Integration (Approved):
- ✅ Lead Gen calls Zestify's REST API over HTTPS with scoped authentication.
- ✅ Zestify verifies tenant subscription, plan lead limits (`maxLeads`), runs transaction-safe deduplication, logs audit notes, and notifies dialer WebSockets in real time.
