/**
 * roleUtils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central Canonical Structural Role Normalization & Utilities for Octal / Zestify.
 *
 * Authoritative hierarchy:
 *  - 'platform_admin' : Global Platform Owner Console
 *  - 'admin'          : Tenant Company Owner (Full 8-card Settings & Module Suite)
 *  - 'team_lead'      : Supervisor (Scoped 3-card Settings & Team Workspace)
 *  - 'user'           : Standard Tenant Member (Personal Profile & Scoped Access)
 *  - 'agent'          : Member-compatible Operator (Legacy alias for Member)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type StructuralRole =
  | 'superadmin'
  | 'platform_admin'
  | 'admin'
  | 'team_lead'
  | 'user'
  | 'agent';

export interface AuthIdentity {
  username: string;
  role: StructuralRole;
  displayName?: string;
  tenantId?: string;
  userId?: string;
  email?: string;
  needsOnboarding?: boolean;
  pendingInvitation?: any;
}

/**
 * Normalizes any raw role string into a canonical StructuralRole.
 * Preserves 'user' and 'agent' as member-level roles.
 * Handles legacy aliases like 'master_admin', 'owner', 'supervisor'.
 */
export function normalizeStructuralRole(rawRole: unknown): StructuralRole {
  if (!rawRole || typeof rawRole !== 'string') {
    throw new Error(`Invalid role supplied for normalization: ${String(rawRole)}`);
  }
  const clean = rawRole.trim().toLowerCase();

  if (clean === 'superadmin') {
    return 'superadmin';
  }
  if (clean === 'platform_admin' || clean === 'master_admin' || clean === 'super_admin') {
    return 'platform_admin';
  }
  if (clean === 'admin' || clean === 'owner' || clean === 'company_owner') {
    return 'admin';
  }
  if (clean === 'team_lead' || clean === 'team_leader' || clean === 'supervisor') {
    return 'team_lead';
  }
  if (clean === 'user') {
    return 'user';
  }
  if (clean === 'agent' || clean === 'member') {
    return 'agent';
  }

  throw new Error(`Unrecognized structural role: ${rawRole}`);
}

/**
 * Safely attempts to normalize a role without throwing, returning null if invalid.
 */
export function tryNormalizeStructuralRole(rawRole: unknown): StructuralRole | null {
  try {
    return normalizeStructuralRole(rawRole);
  } catch {
    return null;
  }
}

/**
 * Human-friendly display name for the structural role.
 */
export function getRoleDisplayName(role: unknown): string {
  const norm = tryNormalizeStructuralRole(role);
  switch (norm) {
    case 'superadmin':
      return 'Super Admin';
    case 'platform_admin':
      return 'Platform Owner';
    case 'admin':
      return 'Company Owner';
    case 'team_lead':
      return 'Team Lead';
    case 'user':
    case 'agent':
      return 'Member';
    default:
      return 'Unknown';
  }
}

/**
 * True if the role is Global Platform Administrator or Superadmin.
 */
export function isPlatformOwner(role: unknown): boolean {
  const norm = tryNormalizeStructuralRole(role);
  return norm === 'platform_admin' || norm === 'superadmin';
}

/**
 * True if the role is superadmin (master_mohsin7).
 */
export function isSuperAdmin(role: unknown): boolean {
  return tryNormalizeStructuralRole(role) === 'superadmin';
}

/**
 * True if the role is any platform-level role (superadmin, platform_admin, master_admin).
 */
export function isPlatformRole(role: unknown): boolean {
  const norm = tryNormalizeStructuralRole(role);
  return norm === 'platform_admin' || norm === 'superadmin';
}

/**
 * True if the user has Company Owner authority within a tenant workspace.
 * (A Platform Admin is NOT a customer Company Owner).
 */
export function isCompanyOwner(role: unknown): boolean {
  const norm = tryNormalizeStructuralRole(role);
  return norm === 'admin';
}

/**
 * True if the user has Company Owner authority OR Platform Owner oversight.
 */
export function isPlatformOrCompanyOwner(role: unknown): boolean {
  const norm = tryNormalizeStructuralRole(role);
  return norm === 'admin' || norm === 'platform_admin';
}

/**
 * True if the user is a Team Lead supervisor.
 */
export function isTeamLead(role: unknown): boolean {
  return tryNormalizeStructuralRole(role) === 'team_lead';
}

/**
 * True if the user is a standard operator / member (user or agent).
 */
export function isMember(role: unknown): boolean {
  const norm = tryNormalizeStructuralRole(role);
  return norm === 'user' || norm === 'agent';
}

/**
 * Extracts the JWT payload locally for INITIAL UI HYDRATION ONLY on page reload.
 * This is an initial UI rendering hint, NOT authorization. Authoritative verification
 * is performed server-side on every protected API call and refreshed via /auth/me.
 */
export function getInitialIdentityHintFromToken(token: string | null | undefined): AuthIdentity | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonStr);
    if (!payload || !payload.role) return null;
    const norm = tryNormalizeStructuralRole(payload.role);
    if (!norm) return null;

    return {
      username: payload.username || '',
      role: norm,
      tenantId: payload.tenantId,
      userId: payload.sub
    };
  } catch {
    return null;
  }
}
