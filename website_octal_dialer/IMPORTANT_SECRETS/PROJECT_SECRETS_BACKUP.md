# 🔐 IMPORTANT SECRETS & CREDENTIALS BACKUP
# Octal Dialer SaaS Platform

This folder contains backup copies and setup documentation for all third-party API keys, OAuth credentials, and secrets used by the Octal Dialer application.

---

## 1. Google OAuth 2.0 Credentials (Production & Localhost)

* **Project Name:** `OCTAL DIALER`
* **Google Cloud Console:** [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
* **Application Type:** Web Application

### Credentials:
* **Client ID:**
  ```text
  276074980527-6d3r4q4e013ts65tpfq7d8971k6p99ct.apps.googleusercontent.com
  ```
* **Client Secret:**
  ```text
  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
  ```

### Registered URIs in Google Cloud Console:
* **Authorized JavaScript Origins:**
  * `http://localhost:5173`
  * `http://localhost:3000`
  *(When launching live on your domain, add `https://yourdomain.com` here)*
* **Authorized Redirect URIs:**
  * `http://localhost:3000/auth/google/callback`
  *(When launching live on your domain, add `https://yourdomain.com/auth/google/callback` here)*

---

## 2. Server Environment Configuration (`backend/.env`)

Active environment variables loaded by the backend:

```env
# JWT Secret Key
JWT_SECRET=p/tpv+fv+2EAhaLygTnIDbXavKBK0Bb9iUbst5LevvQ=
JWT_EXPIRES_IN=24h
SESSION_TTL_HOURS=24

# Google OAuth 2.0
GOOGLE_CLIENT_ID=276074980527-6d3r4q4e013ts65tpfq7d8971k6p99ct.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Cloudflare Turnstile CAPTCHA (Optional)
# CAPTCHA_SITE_KEY=
# CAPTCHA_SECRET_KEY=

# SMTP Email Verification (Optional)
# EMAIL_PROVIDER=smtp
# EMAIL_FROM=no-reply@octaldialer.com
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASSWORD=
```

---

## 3. Database Location

* **SQLite Database:** `backend/data/octal_dialer.db`
* **Default Admin Account:**
  * Username: `admin`
  * Role: `platform_admin` (Master Admin)
