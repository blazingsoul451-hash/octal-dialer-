# ZESTIFY / OCTAL DIALER — UI AUDIT ISSUES & REGRESSION REPORT

Audit Date: 2026-09-21T12:32:20.968Z
Total Recorded Issues: 15

## MEDIUM ISSUES (15)

### SCREEN: Network Response Monitor
- **ROLE**: Unauthenticated
- **URL**: http://127.0.0.1:5000/auth/login
- **ACTION**: POST http://127.0.0.1:5000/auth/login
- **VISIBLE ISSUE**: API call returned HTTP status 401
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 401 Unauthorized`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

### SCREEN: Network Response Monitor
- **ROLE**: Company Owner
- **URL**: http://127.0.0.1:5000/api/scraped-leads?limit=200
- **ACTION**: GET http://127.0.0.1:5000/api/scraped-leads?limit=200
- **VISIBLE ISSUE**: API call returned HTTP status 404
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 404 Not Found`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

### SCREEN: Network Response Monitor
- **ROLE**: Company Owner
- **URL**: http://127.0.0.1:5000/api/scraped-leads?limit=200
- **ACTION**: GET http://127.0.0.1:5000/api/scraped-leads?limit=200
- **VISIBLE ISSUE**: API call returned HTTP status 404
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 404 Not Found`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

### SCREEN: Network Response Monitor
- **ROLE**: Company Owner
- **URL**: http://127.0.0.1:5000/api/dnc
- **ACTION**: GET http://127.0.0.1:5000/api/dnc
- **VISIBLE ISSUE**: API call returned HTTP status 404
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 404 Not Found`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

### SCREEN: Network Response Monitor
- **ROLE**: Company Owner
- **URL**: http://127.0.0.1:5000/api/dnc
- **ACTION**: GET http://127.0.0.1:5000/api/dnc
- **VISIBLE ISSUE**: API call returned HTTP status 404
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 404 Not Found`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

### SCREEN: Network Response Monitor
- **ROLE**: Company Owner
- **URL**: http://127.0.0.1:5000/api/facebook-poster/accounts
- **ACTION**: GET http://127.0.0.1:5000/api/facebook-poster/accounts
- **VISIBLE ISSUE**: API call returned HTTP status 404
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 404 Not Found`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

### SCREEN: Network Response Monitor
- **ROLE**: Company Owner
- **URL**: http://127.0.0.1:5000/api/facebook-scraper/status
- **ACTION**: GET http://127.0.0.1:5000/api/facebook-scraper/status
- **VISIBLE ISSUE**: API call returned HTTP status 404
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 404 Not Found`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

### SCREEN: Network Response Monitor
- **ROLE**: Company Owner
- **URL**: http://127.0.0.1:5000/api/facebook-poster/accounts
- **ACTION**: GET http://127.0.0.1:5000/api/facebook-poster/accounts
- **VISIBLE ISSUE**: API call returned HTTP status 404
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 404 Not Found`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

### SCREEN: Network Response Monitor
- **ROLE**: Company Owner
- **URL**: http://127.0.0.1:5000/api/facebook-scraper/status
- **ACTION**: GET http://127.0.0.1:5000/api/facebook-scraper/status
- **VISIBLE ISSUE**: API call returned HTTP status 404
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 404 Not Found`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

### SCREEN: Network Response Monitor
- **ROLE**: Company Owner
- **URL**: http://127.0.0.1:5000/api/facebook-poster/accounts
- **ACTION**: GET http://127.0.0.1:5000/api/facebook-poster/accounts
- **VISIBLE ISSUE**: API call returned HTTP status 404
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 404 Not Found`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

### SCREEN: Network Response Monitor
- **ROLE**: Company Owner
- **URL**: http://127.0.0.1:5000/api/facebook-poster/accounts
- **ACTION**: GET http://127.0.0.1:5000/api/facebook-poster/accounts
- **VISIBLE ISSUE**: API call returned HTTP status 404
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 404 Not Found`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

### SCREEN: Network Response Monitor
- **ROLE**: Member / Agent
- **URL**: http://127.0.0.1:5000/api/scraped-leads?limit=200
- **ACTION**: GET http://127.0.0.1:5000/api/scraped-leads?limit=200
- **VISIBLE ISSUE**: API call returned HTTP status 404
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 404 Not Found`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

### SCREEN: Network Response Monitor
- **ROLE**: Member / Agent
- **URL**: http://127.0.0.1:5000/api/scraped-leads?limit=200
- **ACTION**: GET http://127.0.0.1:5000/api/scraped-leads?limit=200
- **VISIBLE ISSUE**: API call returned HTTP status 404
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 404 Not Found`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

### SCREEN: Network Response Monitor
- **ROLE**: Member / Agent
- **URL**: http://127.0.0.1:5000/api/teams/my-teams
- **ACTION**: GET http://127.0.0.1:5000/api/teams/my-teams
- **VISIBLE ISSUE**: API call returned HTTP status 403
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 403 Forbidden`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

### SCREEN: Network Response Monitor
- **ROLE**: Member / Agent
- **URL**: http://127.0.0.1:5000/api/teams/my-teams
- **ACTION**: GET http://127.0.0.1:5000/api/teams/my-teams
- **VISIBLE ISSUE**: API call returned HTTP status 403
- **CONSOLE ERROR**: `None`
- **NETWORK ERROR**: `Status: 403 Forbidden`
- **SCREENSHOT**: `None`
- **SEVERITY**: **MEDIUM**

