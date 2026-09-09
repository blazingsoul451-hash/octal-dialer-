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
  const sessionId = 'sess_' + Math.random().toString(36).substring(2, 11);
  const token = generateToken();
  const now = new Date();
  // No expiry — sessions last until the backend restarts
  const tokenExpiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

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

export function reclaimOrCreateSession(laptopSocketId: string, previousSessionId?: string, tenantId?: string): Session;
export function reclaimOrCreateSession(laptopSocketId: string, previousSessionId?: string, tenantId?: string, userId?: string): Session;
export function reclaimOrCreateSession(laptopSocketId: string, previousSessionId?: string, tenantId?: string, userId?: string): Session {
  // 1. Reclaim the exact same session by ID
  if (previousSessionId && sessions.has(previousSessionId)) {
    const s = sessions.get(previousSessionId)!;
    // Tenant isolation: reject cross-tenant session reclaim
    if (tenantId && s.tenantId && s.tenantId !== tenantId) {
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
      s => !s.laptopSocketId && s.tenantId === tenantId && (!userId || !s.userId || s.userId === userId)
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

export async function pairPhone(
  tokenOrSessionId: string,
  phoneSocketId: string,
  phoneDeviceName: string,
  phoneBtAddress: string | null | undefined,
  phoneOsType: string,
  phoneIpAddress: string,
  sessionIdHint?: string
): Promise<Session | null> {
  const cleanKey = (tokenOrSessionId || '').trim();
  const cleanHint = (sessionIdHint || '').trim();

  let session = (cleanHint && sessions.get(cleanHint)) || (cleanKey && sessions.get(cleanKey));

  if (!session && cleanKey) {
    session = Array.from(sessions.values()).find(
      s => s.token.toUpperCase() === cleanKey.toUpperCase()
    );
  }

  if (!session) {
    console.warn(`[Pairing] Failed: No active session found for key: "${cleanKey}"`);
    return null;
  }

  const tenantId = session.tenantId;
  if (!tenantId) {
    console.error(`[Pairing] Failed: Session ${session.id} has no assigned tenantId. Pairing rejected (fail-closed).`);
    return null;
  }

  if (session.phoneDeviceId != null) {
    console.warn(`[Pairing] Rejected: Session ${session.id} is paired with authenticated device ${session.phoneDeviceId} and cannot be hijacked via phone:join.`);
    return null;
  }

  if (session.phoneSocketId && session.phoneSocketId !== phoneSocketId) {
    console.warn(`[Pairing] Replacing QR phone ${session.phoneSocketId} with ${phoneSocketId} in session ${session.id}`);
  }

  session.phoneSocketId = phoneSocketId;
  session.phoneDeviceName = phoneDeviceName || 'Android Device';
  session.phoneBtAddress = phoneBtAddress || null;
  session.phoneOsType = phoneOsType || 'Android';
  session.phoneIpAddress = phoneIpAddress || '127.0.0.1';
  session.status = 'PAIRED';
  session.lastHeartbeat = new Date();
  session.updatedAt = new Date();

  try {
    await db.withTransaction(async () => {
      const devId = phoneBtAddress || 'dev_' + phoneDeviceName.replace(/\s+/g, '_');
      const existingDevice = await db.queryOne<{ id: string }>(`
        SELECT id FROM devices WHERE (id = $1 OR ("btAddress" IS NOT NULL AND "btAddress" = $2)) AND "tenantId" = $3
      `, [devId, phoneBtAddress || '', tenantId]);

      if (!existingDevice) {
        const limitCheck = await checkLimit(tenantId, 'maxDevices', 1);
        if (!limitCheck.allowed) {
          const err: any = new Error(`Tenant ${tenantId} reached device limit (${limitCheck.current}/${limitCheck.limit}).`);
          (err as any).limitRejected = true;
          throw err;
        }
      }

      const targetId = existingDevice ? existingDevice.id : devId;
      const now = new Date().toISOString();

      await db.execute(`
        INSERT INTO devices (id, name, "btAddress", "osType", "ipAddress", status, "tenantId", "lastSeenAt")
        VALUES ($1, $2, $3, $4, $5, 'ONLINE', $6, $7)
        ON CONFLICT ("id") DO UPDATE SET
          name = EXCLUDED.name,
          "osType" = EXCLUDED."osType",
          "ipAddress" = EXCLUDED."ipAddress",
          status = 'ONLINE',
          "tenantId" = EXCLUDED."tenantId",
          "lastSeenAt" = EXCLUDED."lastSeenAt"
      `, [targetId, phoneDeviceName, phoneBtAddress, phoneOsType, phoneIpAddress, tenantId, now]);
    });
  } catch (err: any) {
    if (err.limitRejected) {
      console.error(`[Pairing] Rejected: ${err.message}`);
    } else {
      console.error('[SessionManager] Device upsert error:', err);
    }
    return null;
  }

  return session;
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

  if (!session.tenantId || session.tenantId !== tenantId) {
    console.error(`[Pairing] Rejected: Session tenant ${session.tenantId} != device tenant ${tenantId}`);
    return null;
  }

  if (!session.userId && userId) {
    session.userId = userId;
  }

  if (session.phoneSocketId && session.phoneSocketId !== phoneSocketId) {
    console.warn(`[Pairing] Replacing phone ${session.phoneSocketId} with ${phoneSocketId} in session ${session.id}`);
  }

  session.phoneSocketId = phoneSocketId;
  session.phoneDeviceName = phoneDeviceName || 'Android Device';
  session.phoneBtAddress = phoneBtAddress || null;
  session.phoneOsType = phoneOsType || 'Android';
  session.phoneIpAddress = phoneIpAddress || '127.0.0.1';
  session.phoneDeviceId = deviceId;
  session.status = 'PAIRED';
  session.lastHeartbeat = new Date();
  session.updatedAt = new Date();

  try {
    const now = new Date().toISOString();
    await db.execute(`
      UPDATE devices
      SET status = 'PAIRED', "lastSeenAt" = $1, "updatedAt" = $1
      WHERE id = $2 AND "tenantId" = $3
    `, [now, deviceId, tenantId]);
  } catch (err) {
    console.error('[SessionManager] Error updating device status:', err);
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
  createdAt: string;
  startedAt?: string;
  activeAt?: string;
  endedAt?: string;
  endReason?: string;
  duration: number;
}

const activeCallSessions = new Map<string, CallSession>();

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
    if (cs.sessionId === sessionId && cs.state !== 'ENDED') {
      return cs;
    }
  }
  return undefined;
}

export function getCallSessionByCommandId(commandId: string): CallSession | undefined {
  for (const cs of activeCallSessions.values()) {
    if (cs.commandId === commandId && cs.state !== 'ENDED') {
      return cs;
    }
  }
  return undefined;
}

export function updateCallSessionState(callId: string, state: CallState, extra?: Partial<CallSession>): CallSession | undefined {
  const cs = activeCallSessions.get(callId);
  if (!cs) return undefined;
  cs.state = state;
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
