---
name: vps-devops-and-migration-guard
description: Production VPS operations on 140.245.215.156 / zestify7.online: zero-downtime PostgreSQL migrations (SET lock_timeout = '3s', CREATE INDEX CONCURRENTLY outside transactions), PM2 cluster sticky sessions with @socket.io/postgres-adapter and pg-boss, and strict network/firewall security (127.0.0.1 binding, UFW, Nginx reverse proxy headers).
---

# VPS DevOps, Zero-Downtime Migrations & Infrastructure Guard

This skill governs production deployments, database migrations, process clustering, and network security for Octal Dialer / Zestify running on the production host (`140.245.215.156` / `zestify7.online`). Careless migrations or misconfigured cluster adapters will knock out live GSM dialing, drop active mobile phone websockets, or expose internal services to the public internet.

---

## 1. Zero-Downtime PostgreSQL Migration Protocol

### The Database Lock Threat
When altering tables under heavy call volume (e.g., `leads`, `call_outbox`, `dispositions`), PostgreSQL commands like `ALTER TABLE ADD COLUMN` or `CREATE INDEX` request an `ACCESS EXCLUSIVE` lock.
- If long-running queries are executing, the migration queues behind them.
- All subsequent reads and writes queue behind the migration request.
- The connection pool exhausts in seconds, taking down the entire web portal and mobile app.

### Zero-Downtime Migration Rules

#### Rule 1: Always Set an Explicit Lock Timeout
Every SQL migration script MUST begin with a strict lock timeout so it fails gracefully rather than blocking the SaaS:
```sql
-- Abort immediately if the table lock cannot be acquired within 3 seconds
SET lock_timeout = '3s';
```

#### Rule 2: Always Create Indexes Concurrently & OUTSIDE Transaction Blocks
Never create an index inside a transaction block or without `CONCURRENTLY`:
```sql
-- DANGEROUS: Locks table against writes until index completes
-- CREATE INDEX idx_leads_phone ON leads("phoneNumber");

-- MANDATORY: Builds index without locking writes (MUST run outside transaction blocks)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_phone ON leads("phoneNumber");
```

> [!CRITICAL]
> **Non-Transactional Execution Rule**:
> PostgreSQL strictly forbids running concurrent index creation inside transactions:
> `ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`
> - Any migration using `CREATE INDEX CONCURRENTLY` **must run OUTSIDE a `BEGIN...COMMIT` transaction block**.
> - The migration runner must support a non-transactional flag/marker (e.g., `-- non-transactional` header comment or dedicated runner path) so that these migrations execute statement-by-statement outside an explicit transaction wrapper.
> - Never attempt to execute `CREATE INDEX CONCURRENTLY` inside a standard transactional migration runner, as PostgreSQL will abort immediately.

#### Rule 3: Backward-Compatible Column Additions
1. Always add new columns as **nullable** or with an explicit `DEFAULT`. In PostgreSQL 11+, adding a column with a constant `DEFAULT` is an instantaneous metadata update that does not rewrite the table.
2. Never add a column with `NOT NULL` without a default value in production.
3. Code must tolerate both the presence and absence of new columns during rolling deployments.

#### Rule 4: Mandatory Rollback / Down-Migration Scripts
For every migration `XXX_feature_name.sql`, there must exist a tested rollback strategy or counterpart `XXX_feature_name.down.sql`. Never apply an irreversible DDL change without an audited down path.

#### Rule 5: Run the PostgreSQL Migration Gate Before Every Push
```bash
npm --prefix website_octal_dialer/backend run test:migrations
```
This test spins up an isolated PostgreSQL engine and executes `schema.sql` plus all 35+ migrations sequentially. If a syntax error, duplicate index, or conflicting constraint exists, it halts here before touching production.

---

## 2. PM2 Cluster Deployment & Real-Time Socket.IO Scaling

Octal Dialer operates high-frequency WebSocket channels (`dialer:hot_lead_queued`, `device:heartbeat`, `device:call_status`). Running multiple Node.js instances under PM2 requires sticky sessions and a shared pub/sub adapter. Zestify operates strictly on a **pure PostgreSQL architecture** with zero external cache or key-value server dependencies. Socket.IO cluster broadcast is powered by `@socket.io/postgres-adapter` (using PostgreSQL `LISTEN`/`NOTIFY`), and asynchronous background job queues and distributed locks use `pg-boss` on the existing PostgreSQL database.

### The Socket.IO Multi-Instance Problem
The default Socket.IO handshake begins with HTTP long-polling and upgrades to WebSocket. If PM2 runs in cluster mode (`-i max`) with round-robin load balancing without sticky sessions:
1. Client HTTP Poll 1 reaches PM2 Worker 0 (generates `sid`).
2. Client HTTP Poll 2 reaches PM2 Worker 1. Worker 1 does not recognize `sid` -> throws `HTTP 400 Bad Request: {"code": 1, "message": "Session ID unknown"}`.
3. Mobile dialer disconnects; calls fail to route.

### Sticky Sessions & PostgreSQL Adapter Architecture
```
                         Internet (HTTPS / WSS)
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │    Nginx Reverse Proxy        │
                   │  - ip_hash / sticky cookie   │
                   │  - WebSocket upgrade headers │
                   └───────────────┬───────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  PM2 Worker 0   │       │  PM2 Worker 1   │       │  PM2 Worker 2   │
│ (Octal Backend) │       │ (Octal Backend) │       │ (Octal Backend) │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   ▼
                   ┌───────────────────────────────┐
                   │ PostgreSQL Adapter & pg-boss  │
                   │  @socket.io/postgres-adapter  │
                   │  LISTEN/NOTIFY + DB Queues    │
                   └───────────────────────────────┘
```

### Server Configuration (`server.ts`)
```typescript
import { createAdapter } from '@socket.io/postgres-adapter';
import { getPool } from './db/pool';
import PgBoss from 'pg-boss';

if (process.env.NODE_ENV === 'production') {
  const pgPool = getPool();
  io.adapter(createAdapter(pgPool));
  console.log('[Socket.IO] PostgreSQL adapter initialized successfully across PM2 cluster.');

  // Asynchronous background job processing and distributed locks on existing Postgres
  const boss = new PgBoss({ db: { client: pgPool } });
  await boss.start();
  console.log('[pg-boss] PostgreSQL background job queue initialized successfully.');
}
```

### Production PM2 Ecosystem (`ecosystem.config.cjs`)
```javascript
module.exports = {
  apps: [{
    name: 'octal-backend',
    script: 'dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      TRUST_PROXY: '1'
    },
    wait_ready: true,
    listen_timeout: 10000,
    kill_timeout: 5000,
    max_memory_restart: '1G'
  }]
};
```

---

## 3. Network, Firewall & Microservice Lockdown

Host: `140.245.215.156` / `zestify7.online`

### The Zero-Exposure Surface Rule
External clients must interact solely with ports `80` (HTTP redirect) and `443` (HTTPS) managed by Nginx. **Under no circumstances should database or internal microservice ports be bound to `0.0.0.0` or exposed through UFW.**

| Service | Port | Allowed Binding | Public Access |
|---|---|---|---|
| **Nginx Web Server** | 80, 443 | `0.0.0.0` | **ALLOWED** (SSL via Let's Encrypt) |
| **SSH** | 22 | `0.0.0.0` (Key-only) | Restricted / Rate-limited |
| **Octal Core Backend** | 5000 | `127.0.0.1` | **FORBIDDEN** (Proxied via Nginx) |
| **Lead-Gen-Z Service** | 5001 | `127.0.0.1` | **FORBIDDEN** (Internal loopback only) |
| **PostgreSQL Database**| 5432 / 54330| `127.0.0.1` | **FORBIDDEN** (Local unix/loopback only) |

### Microservice Binding Verification (`lead-gen-z/backend/src/server.ts`)
```typescript
// SECURE: Strictly bound to loopback interface
const PORT = process.env.PORT || 5001;
app.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`Lead-Gen-Z internal microservice listening strictly on 127.0.0.1:${PORT}`);
});
```

### UFW Firewall Rules Enforcement
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 4. Nginx Reverse Proxy & Header Sanitization

### Nginx Configuration (`/etc/nginx/sites-available/default`)
```nginx
upstream octal_nodes {
    ip_hash; # Sticky sessions for polling fallback
    server 127.0.0.1:5000;
}

upstream lead_gen_z_node {
    server 127.0.0.1:5001;
}

server {
    listen 80;
    server_name zestify7.online www.zestify7.online;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name zestify7.online www.zestify7.online;

    ssl_certificate /etc/letsencrypt/live/zestify7.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/zestify7.online/privkey.pem;

    # Security Headers
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Frontend Static SPA
    root /var/www/octal-frontend;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend Core REST & Socket.IO
    location ~ ^/(api|socket.io)/ {
        proxy_pass http://octal_nodes;
        proxy_http_version 1.1;

        # WebSocket Upgrade Headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Client Origin Sanitization
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Internal Microservice: Lead-Gen-Z Proxied Path
    location /api/leadgen/ {
        proxy_pass http://lead_gen_z_node/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Express Trust Proxy Setting
Because Express sits behind Nginx, `req.ip` will read as `127.0.0.1` unless `trust proxy` is configured:
```typescript
// website_octal_dialer/backend/src/server.ts
app.set('trust proxy', 1); // Trust first-hop proxy (Nginx)
```
This guarantees rate-limiting, audit logs, and IP geolocation capture the real client IP.

---

## 5. Deployment Verification Checklist

Run this gate before and after running `deploy_remote.sh`:

```bash
# 1. Verify remote port bindings on VPS (Run via SSH)
ssh ubuntu@140.245.215.156 "sudo ss -tulpn | grep -E '5001|5432'"
# All lines MUST display '127.0.0.1' or '::1'. None should display '0.0.0.0:*'

# 2. Test Nginx configuration and reload
ssh ubuntu@140.245.215.156 "sudo nginx -t && sudo systemctl reload nginx"

# 3. Check PM2 cluster status and logs
ssh ubuntu@140.245.215.156 "pm2 status octal-backend && pm2 logs octal-backend --lines 20"

# 4. Verify live health check endpoint
curl -sI https://zestify7.online/api/health
# Expected: HTTP/2 200 OK
```
