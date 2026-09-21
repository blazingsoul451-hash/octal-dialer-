# LEAD GEN Z

**Lead Generation by Zestify**

Dedicated, standalone lead generation and prospect discovery platform.

## Architecture
- **Frontend**: Vite + React 19 + TypeScript + Tailwind CSS (Port 5174)
- **Backend Engine**: Express + TypeScript / Node.js (Port 5001)
- **Integration Boundary**: Connects cleanly with Zestify CRM API (`POST http://localhost:5000/api/integrations/leadgen/import`)

## Navigation & Features
1. **Dashboard**: Metrics (Generated, Saved, Lists, Exports, Sent to Zestify, Credits), Activity Feed
2. **Google Leads**: Google Maps lead discovery workflow with phone/email filters and website enrichment
3. **Facebook Leads**: Facebook lead search with profile selector, execution logs, and lead extraction
4. **Lead Lists**: Custom targeted lists (e.g. Dubai Real Estate, Texas Dental Clinics)
5. **Saved Leads**: Master prospect database with deduplication status indicators
6. **Exports**: Instant CSV and XLSX data generation
7. **Integrations**: Zestify Direct Connect & workspace configuration
8. **Settings**: Deduplication matching rules and operational defaults

## Quick Start
```bash
# 1. Start Lead Gen Z Backend (Port 5001)
cd backend
npm install
npm run dev

# 2. Start Lead Gen Z Frontend (Port 5174)
cd ../frontend
npm install
npm run dev
```
