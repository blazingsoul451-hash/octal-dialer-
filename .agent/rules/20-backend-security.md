---
trigger: glob
globs: "website_octal_dialer/backend/**, src/**/*.ts"
description: "Multi-tenant SQL/Socket/Path isolation, migration safety, licensing, and error handling rules."
---

# Octal Dialer — Backend, Database & Security Rules

## 1. Strict Multi-Tenant Isolation
- **SQL Queries:** Every query touching tenant-scoped tables MUST filter by `"tenantId"` derived from `getTenantId(req)`.
- **Socket.IO Rooms:** Every real-time emit for calls, leads, unibox messages, or device heartbeats MUST be room-scoped (`io.to(tenantRoom).emit(...)`), never broadcast globally via `io.emit(...)`.
- **Filesystem Paths:** Every file path derived from request params/body MUST be sanitized to a single segment (`path.basename()`) and asserted with `path.resolve()` to reside inside the tenant's directory.
- **Route Guards:** Before adding or moving any Express route, explicitly attach `requireAuth`, `requirePermission([...])`, and `requireModule` where applicable.

## 2. Database & Migration Discipline
- **ASCII-Only SQL:** All `.sql` and migration files must contain strict 7-bit ASCII characters only.
- **Pre-Dedup & Orphans:** Before creating any `UNIQUE` index, deduplicate existing rows inside the same migration. Before adding any `FOREIGN KEY`, delete or nullify orphaned records first.
- **Real Postgres Verification:** Never validate a migration by reading SQL; always run `npm --prefix website_octal_dialer/backend run test:migrations`.

## 3. Secrets & Error Handling
- **Encrypted Credentials at Rest:** All mailbox passwords (`email_accounts`), OAuth tokens, and Facebook session cookies must be encrypted via `SECRETS_KEY` before database storage.
- **No Empty Catches:** Never write `catch {}` or `catch (e) {}`. Always log context or return an explicit HTTP error status.

## 4. Dependency Licensing
- Shipped production dependencies must be `MIT`, `Apache-2.0`, or `BSD`. Never introduce `AGPL` packages into the backend or frontend bundle.
