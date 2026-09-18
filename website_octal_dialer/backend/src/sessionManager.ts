import os from 'os';
import crypto from 'crypto';
import { db } from './databaseManager';
import { checkLimit } from './entitlementManager';

export interface Session {
  id: string;
  token: string;
  tokenExpiresAt: Date;
  laptopSocketId: string | null;
  phoneSocketId: string | null;
  laptopName: string;
  laptopBtAddress: string;
  phoneDeviceName: string | null;
  phoneBtAddress: string | null;
  phoneOsType: string | null;
  phoneIpAddress: string | null;
  phoneDeviceId?: string | null;
  phoneStatus?: string;
  status: 'WAITING' | 'PAIRED' | 'CALLING';
  lastHeartbeat: Date | null;
  tenantId?: string;
  userId?: string;
  sims?: any[];
  selectedSimSlot?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const sessions = new Map<string, Session>();

export function getSessions() {
  return sessions;
}

export function getLaptopName(): string {
  return os.hostname() || 'Laptop Console';
}

export function getLaptopBtAddress(): string {
  const host = getLaptopName();
  let hash = 0;
  for (let i = 0; i < host.length; i++) {
    hash = host.charCodeAt(i) + ((hash << 5) - hash);
  }
  const mac = ['00', '1A', '7D', 'DA'];
  for (let i = 0; i < 2; i++) {
    const byte = ((hash >> (i * 8)) & 0x00FF).toString(16).toUpperCase().padStart(2, '0');
    mac.push(byte);
  }
  return mac.join(':');
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function createSession(laptopSocketId: string, tenantId?: string, userId?: string): Session {
  const sessionId = 'sess_' + crypto.randomUUID();
  const token = generateToken();
  const now = new Date();
  // No expiry — sessions last until the backend restarts
  const tokenExpiresAt = new Date(now.getTime() + 5 * 60 * 1000);

  const session: Session = {
    id: sessionId,
    token,
    tokenExpiresAt,
    laptopSocketId,
    phoneSocketId: null,
    laptopName: getLaptopName(),
    laptopBtAddress: getLaptopBtAddress(),
    phoneDeviceName: null,
    phoneBtAddress: null,
    phoneOsType: null,
    phoneIpAddress: null,
    phoneDeviceId: null,
    status: 'WAITING',
    lastHeartbeat: null,
    tenantId: tenantId || undefined,
    userId: userId || undefined,
    createdAt: now,
    updatedAt: now
  };
  sessions.set(sessionId, session);
  return session;
}

export function getSessionById(id: string): Session | undefined {
  return sessions.get(id);
}

export function getSessionByToken(token: string): Session | undefined {
  return Array.from(sessions.values()).find(s => s.token === token);
}

export function getSessionBySocketId(socketId: string): Session | undefined {
  return Array.from(sessions.values()).find(
    s => s.laptopSocketId === socketId || s.phoneSocketId === socketId
  );
}

export function refreshSessionToken(sessionId: string, userId?: string, tenantId?: string): Session | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  if (tenantId && session.tenantId !== tenantId) return undefined;
  if (userId && session.userId !== userId) return undefined;

  session.token = generateToken();
  session.tokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
  session.updatedAt = new Date();
  return session;
}

export function reclaimOrCreateSession(laptopSocketId: string, previousSessionId?: string, tenantId?: string): Session;
export function reclaimOrCreateSession(laptopSocketId: string, previousSessionId?: string, tenantId?: string, userId?: string): Session;
export function reclaimOrCreateSession(laptopSocketId: string, previousSessionId?: string, tenantId?: string, userId?: string): Session {
  // 1. Reclaim the exact same session by ID
  if (previousSessionId && sessions.has(previousSessionId)) {
    const s = sessions.get(previousSessionId)!;
    // Tenant isolation: reject cross-tenant session reclaim
    if (!tenantId || s.tenantId !== tenantId || !userId || s.userId !== userId) {
      console.warn(`[Session] Cross-tenant reclaim rejected: session ${s.id} belongs to ${s.tenantId}, requester is ${tenantId}`);
      // Fall through to create a new session instead
    } else {
      s.laptopSocketId = laptopSocketId;
      if (tenantId) s.tenantId = tenantId;
      if (userId) s.userId = userId;
      s.updatedAt = new Date();
      console.log(`[Session] Laptop reclaimed session ${s.id} (tenant: ${s.tenantId || 'unassigned'}, user: ${s.userId || 'unassigned'})`);
      return s;
    }
  }

  // 2. Reclaim any session for THIS TENANT & USER that has no active laptop socket (laptop reconnect)
  if (tenantId) {
    const orphaned = Array.from(sessions.values()).find(
      s => !s.laptopSocketId && s.tenantId === tenantId && !!userId && s.userId === userId
    );
    if (orphaned) {
      orphaned.laptopSocketId = laptopSocketId;
      if (userId) orphaned.userId = userId;
      orphaned.updatedAt = new Date();
      console.log(`[Session] Laptop reclaimed orphaned session ${orphaned.id} (tenant: ${orphaned.tenantId || 'unassigned'}, user: ${orphaned.userId || 'unassigned'})`);
      return orphaned;
    }
  }

  // 3. Create fresh session
  return createSession(laptopSocketId, tenantId, userId);
}

/**
 * Deterministically find the active WAITING laptop session for an authenticated user.
 * Selection rules:
 * 1. Must match identical tenantId and userId (same account).
 * 2. Must have an active laptop socket.
 * 3. If isSocketAlive checker is provided, laptop socket must be confirmed alive.
 * 4. Status must be 'WAITING' (or PAIRED with targetDeviceId if re-pairing).
 * 5. If multiple exist, return the most recently updated session.
 */
export function findActiveWaitingSessionForUser(
  userId: string,
  tenantId: string,
  isSocketAlive?: (socketId: string) => boolean,
  targetDeviceId?: string
): Session | undefined {
  if (!userId || !tenantId) return undefined;

  const candidates = Array.from(sessions.values()).filter(s => {
    if (s.tenantId !== tenantId) return false;
    if (s.userId !== userId) return false;
    if (!s.laptopSocketId) return false;
    if (isSocketAlive && !isSocketAlive(s.laptopSocketId)) return false;

    // If session is targeted/bound to a DIFFERENT device, skip when targetDeviceId is specified
    if (targetDeviceId && s.phoneDeviceId && s.phoneDeviceId !== targetDeviceId) {
      return false;
    }

    // WAITING session is eligible
    if (s.status === 'WAITING') return true;

    // Or if it was already paired with this device (reconnect/re-pair)
    if (s.status === 'PAIRED' && targetDeviceId && s.phoneDeviceId === targetDeviceId) return true;

    return false;
  });

  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => {
    if (targetDeviceId) {
      const aMatch = a.phoneDeviceId === targetDeviceId ? 1 : 0;
      const bMatch = b.phoneDeviceId === targetDeviceId ? 1 : 0;
      if (bMatch !== aMatch) return bMatch - aMatch;
    }
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  return candidates[0];
}

const pairingInProgress = new Set<string>();
export async function pairPhone(
  token: string, phoneSocketId: string, phoneDeviceName: string,
  phoneBtAddress: string | null | undefined, phoneOsType: string, phoneIpAddress: string,
  sessionIdHint?: string, identity?: { tenantId: string; userId: string }
): Promise<Session | null> {
  const cleanToken = typeof token === 'string' ? token.trim() : '';
  const session = sessionIdHint ? sessions.get(sessionIdHint) : getSessionByToken(cleanToken);
  if (!session || !cleanToken || cleanToken !== session.token || session.tokenExpiresAt.getTime() <= Date.now()) return null;
  if (!session.tenantId || (identity && (identity.tenantId !== session.tenantId || identity.userId !== session.userId))) return null;
  if (session.status === 'CALLING' || pairingInProgress.has(session.id)) return null;
  const tenantId = session.tenantId;
  pairingInProgress.add(session.id);
  try {
    const deviceId = await db.withTransaction(async () => {
      // IDs are tenant-namespaced; a matching hardware label cannot reassign another tenant's row.
      const devId = 'dev_' + crypto.createHash('sha256').update(tenantId + ':' + (phoneBtAddress || phoneDeviceName || phoneSocketId)).digest('hex');
      const existing = await db.queryOne<{ id: string }>(
        'SELECT id FROM devices WHERE (id = $1 OR ("btAddress" IS NOT NULL AND "btAddress" = $2)) AND "tenantId" = $3',
        [devId, phoneBtAddress || '', tenantId]);
      if (!existing) {
        const limit = await checkLimit(tenantId, 'maxDevices', 1);
        if (!limit.allowed) throw new Error('Device limit reached.');
      }
      const targetId = existing?.id || devId;
      await db.execute(`INSERT INTO devices (id, name, "btAddress", "osType", "ipAddress", status, "tenantId", "lastSeenAt")
        VALUES ($1, $2, $3, $4, $5, 'ONLINE', $6, $7)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "osType" = EXCLUDED."osType",
          "ipAddress" = EXCLUDED."ipAddress", status = 'ONLINE', "lastSeenAt" = EXCLUDED."lastSeenAt"
        WHERE devices."tenantId" = EXCLUDED."tenantId"`,
        [targetId, phoneDeviceName || 'Android Device', phoneBtAddress || null, phoneOsType || 'Android', phoneIpAddress || '', tenantId, new Date().toISOString()]);
      return targetId;
    });
    if (sessions.get(session.id) !== session || session.token !== cleanToken) return null;
    Object.assign(session, { phoneSocketId, phoneDeviceId: deviceId,
      phoneDeviceName: phoneDeviceName || 'Android Device', phoneBtAddress: phoneBtAddress || null,
      phoneOsType: phoneOsType || 'Android', phoneIpAddress: phoneIpAddress || '',
      status: 'PAIRED', lastHeartbeat: new Date(), updatedAt: new Date() });
    return session;
  } catch (err) {
    console.error('[Pairing] Device registration failed:', err);
    return null;
  } finally {
    pairingInProgress.delete(session.id);
  }
}

export async function pairAuthenticatedDevice(
  sessionId: string,
  deviceId: string,
  phoneSocketId: string,
  phoneDeviceName: string,
  phoneBtAddress: string,
  phoneOsType: string,
  phoneIpAddress: string,
  userId: string,
  tenantId: string
): Promise<Session | null> {
  const session = sessions.get(sessionId);
  if (!session) {
    console.warn(`[Pairing] Failed: Session ${sessionId} not found`);
    return null;
  }

  if (!session.tenantId || session.tenantId !== tenantId || !userId || (session.userId && session.userId !== userId)) {
    console.error(`[Pairing] Rejected: Session tenant ${session.tenantId} != device tenant ${tenantId}`);
    return null;
  }

  if (session.status === 'CALLING' && session.phoneDeviceId !== deviceId) return null;
  if (pairingInProgress.has(session.id)) return null;
  pairingInProgress.add(session.id);
  const priorSocketId = session.phoneSocketId;
  try {
    const now = new Date().toISOString();
    const result = await db.execute(`UPDATE devices SET status = 'PAIRED', "lastSeenAt" = $1, "updatedAt" = $1
      WHERE id = $2 AND "tenantId" = $3 AND "userId" = $4 AND COALESCE("isRevoked", 0) = 0`,
      [now, deviceId, tenantId, userId]);
    if (!result.rowCount || sessions.get(session.id) !== session || session.phoneSocketId !== priorSocketId) return null;
    Object.assign(session, { userId, phoneSocketId, phoneDeviceId: deviceId,
      phoneDeviceName: phoneDeviceName || 'Android Device', phoneBtAddress: phoneBtAddress || null,
      phoneOsType: phoneOsType || 'Android', phoneIpAddress: phoneIpAddress || '',
      status: session.status === 'CALLING' ? 'CALLING' : 'PAIRED', lastHeartbeat: new Date(), updatedAt: new Date() });
    const activeCall = getCallSessionBySessionId(session.id);
    if (activeCall && activeCall.phoneDeviceId === deviceId) activeCall.phoneSocketId = phoneSocketId;
  } catch (err) {
    console.error('[SessionManager] Error updating device status:', err);
    return null;
  } finally {
    pairingInProgress.delete(session.id);
  }
  return session;
}

export async function revokePhone(sessionId: string): Promise<string | null> {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const prevDevId = session.phoneDeviceId || session.phoneBtAddress;
  if (prevDevId) {
    try {
      const nowIso = new Date().toISOString();
      await db.execute(`UPDATE devices SET status = 'ONLINE', "updatedAt" = $1 WHERE id = $2`, [nowIso, prevDevId]);
    } catch {}
  }

  session.phoneSocketId = null;
  session.phoneDeviceName = null;
  session.phoneBtAddress = null;
  session.phoneOsType = null;
  session.phoneIpAddress = null;
  session.phoneDeviceId = null;
  session.status = 'WAITING';
  session.token = generateToken();
  session.tokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
  session.updatedAt = new Date();
  return session.token;
}

export function setSessionStatus(sessionId: string, status: 'WAITING' | 'PAIRED' | 'CALLING') {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = status;
    session.updatedAt = new Date();
  }
}

export function setPhoneStatus(sessionId: string, phoneStatus: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.phoneStatus = phoneStatus;
    session.updatedAt = new Date();
  }
}

export function handleLaptopDisconnect(socketId: string): void {
  const session = getSessionBySocketId(socketId);
  if (!session) return;

  session.laptopSocketId = null;
  session.updatedAt = new Date();

  if (!session.phoneSocketId) {
    sessions.delete(session.id);
  }
}

export async function updateHeartbeat(socketId: string): Promise<Session | undefined> {
  const session = getSessionBySocketId(socketId);
  if (session && session.phoneSocketId === socketId) {
    session.lastHeartbeat = new Date();
    session.updatedAt = new Date();

    const devId = session.phoneBtAddress || (session.phoneDeviceName ? 'dev_' + session.phoneDeviceName.replace(/\s+/g, '_') : null);
    if (devId) {
      try {
        await db.execute(`UPDATE devices SET "lastSeenAt" = $1, status = 'ONLINE' WHERE id = $2`, [new Date().toISOString(), devId]);
      } catch {}
    }
  }
  return session;
}

export async function handlePhoneDisconnect(socketId: string): Promise<Session | undefined> {
  const session = getSessionBySocketId(socketId);
  if (!session || session.phoneSocketId !== socketId) return undefined;

  const devId = session.phoneBtAddress || (session.phoneDeviceName ? 'dev_' + session.phoneDeviceName.replace(/\s+/g, '_') : null);
  if (devId) {
    try {
      await db.execute(`UPDATE devices SET status = 'OFFLINE', "lastSeenAt" = $1 WHERE id = $2`, [new Date().toISOString(), devId]);
    } catch {}
  }

  // A reconnect may have replaced the socket while the DB update was awaiting.
  if (session.phoneSocketId !== socketId) return undefined;
  session.phoneSocketId = null;
  session.status = 'WAITING';
  session.lastHeartbeat = null;
  session.updatedAt = new Date();
  return session;
}

// ─── CANONICAL CALL SESSION ENGINE ───────────────────────────────────────────
export type CallState =
  | 'IDLE'
  | 'COMMAND_SENT'
  | 'COMMAND_RECEIVED'
  | 'DIALING'
  | 'RINGING'
  | 'ACTIVE'
  | 'ENDING'
  | 'ENDED'
  | 'DIAL_FAILED'
  | 'PERMISSION_FAILED'
  | 'REJECTED'
  | 'BUSY'
  | 'NO_ANSWER'
  | 'LOCAL_HANGUP'
  | 'REMOTE_HANGUP'
  | 'NETWORK_FAILURE'
  | 'PHONE_DISCONNECTED'
  | 'SOCKET_DISCONNECTED'
  | 'TIMEOUT'
  | 'RECOVERY_REQUIRED';

export interface CallSession {
  callId: string;
  sessionId: string;
  tenantId: string;
  userId: string;
  phoneDeviceId: string;
  laptopSocketId: string;
  phoneSocketId: string;
  leadId?: string;
  phone: string;
  name: string;
  direction: 'OUTBOUND' | 'INCOMING';
  state: CallState;
  commandId?: string;
  campaignId?: string;
  simSlot?: number | null;
  createdAt: string;
  startedAt?: string;
  activeAt?: string;
  endedAt?: string;
  endReason?: string;
  duration: number;
}

const activeCallSessions = new Map<string, CallSession>();
const terminalStates = new Set<CallState>(['ENDED', 'DIAL_FAILED', 'PERMISSION_FAILED', 'REJECTED', 'BUSY', 'NO_ANSWER', 'LOCAL_HANGUP', 'REMOTE_HANGUP', 'NETWORK_FAILURE', 'PHONE_DISCONNECTED', 'SOCKET_DISCONNECTED', 'TIMEOUT']);
const allowedStates = new Set<CallState>(['IDLE', 'COMMAND_SENT', 'COMMAND_RECEIVED', 'DIALING', 'RINGING', 'ACTIVE', 'ENDING', 'RECOVERY_REQUIRED', ...terminalStates]);

export function createCallSession(params: {
  sessionId: string;
  tenantId: string;
  userId: string;
  phoneDeviceId: string;
  laptopSocketId: string;
  phoneSocketId: string;
  leadId?: string;
  phone: string;
  name: string;
  direction: 'OUTBOUND' | 'INCOMING';
  commandId?: string;
  campaignId?: string;
  simSlot?: number | null;
}): CallSession {
  const callId = 'call_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
  const now = new Date().toISOString();
  const cs: CallSession = {
    callId,
    sessionId: params.sessionId,
    tenantId: params.tenantId,
    userId: params.userId,
    phoneDeviceId: params.phoneDeviceId,
    laptopSocketId: params.laptopSocketId,
    phoneSocketId: params.phoneSocketId,
    leadId: params.leadId,
    phone: params.phone,
    name: params.name,
    direction: params.direction,
    state: 'COMMAND_SENT',
    commandId: params.commandId,
    campaignId: params.campaignId,
    simSlot: params.simSlot,
    createdAt: now,
    startedAt: now,
    duration: 0
  };
  activeCallSessions.set(callId, cs);
  return cs;
}

export function getCallSession(callId: string): CallSession | undefined {
  return activeCallSessions.get(callId);
}

export function getCallSessionBySessionId(sessionId: string): CallSession | undefined {
  for (const cs of activeCallSessions.values()) {
    if (cs.sessionId === sessionId && !terminalStates.has(cs.state)) {
      return cs;
    }
  }
  return undefined;
}

export function getCallSessionByCommandId(commandId: string): CallSession | undefined {
  for (const cs of activeCallSessions.values()) {
    if (cs.commandId === commandId && !terminalStates.has(cs.state)) {
      return cs;
    }
  }
  return undefined;
}

export function updateCallSessionState(callId: string, state: CallState, extra?: Partial<CallSession>): CallSession | undefined {
  const cs = activeCallSessions.get(callId);
  if (!cs || !allowedStates.has(state) || terminalStates.has(cs.state)) return undefined;
  if (cs.state === 'ACTIVE' && ['COMMAND_SENT', 'COMMAND_RECEIVED', 'DIALING', 'RINGING'].includes(state)) return undefined;
  if (cs.state === 'ENDING' && !terminalStates.has(state)) return undefined;
  cs.state = state;
  if (terminalStates.has(state)) {
    cs.endedAt = new Date().toISOString();
    setTimeout(() => activeCallSessions.delete(callId), 10 * 60 * 1000).unref?.();
  }
  if (state === 'ACTIVE' && !cs.activeAt) {
    cs.activeAt = new Date().toISOString();
  }
  if (extra) {
    Object.assign(cs, extra);
  }
  return cs;
}

export function finalizeCallSession(callId: string, reason: string, duration: number): CallSession | undefined {
  const cs = activeCallSessions.get(callId);
  if (!cs) return undefined;
  cs.state = 'ENDED';
  cs.endedAt = new Date().toISOString();
  cs.endReason = reason;
  cs.duration = duration;
  // Retain in memory for 10 minutes then prune
  setTimeout(() => {
    activeCallSessions.delete(callId);
  }, 10 * 60 * 1000);
  return cs;
}
