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
      if (userId && !s.userId) s.userId = userId;
      s.updatedAt = new Date();
      console.log(`[Session] Laptop reclaimed session ${s.id} (tenant: ${s.tenantId || 'unassigned'})`);
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
      if (userId && !orphaned.userId) orphaned.userId = userId;
      orphaned.updatedAt = new Date();
      console.log(`[Session] Laptop reclaimed orphaned session ${orphaned.id} (tenant: ${orphaned.tenantId || 'unassigned'})`);
      return orphaned;
    }
  }

  // 3. Create fresh session
  return createSession(laptopSocketId, tenantId, userId);
}

export function pairPhone(
  tokenOrSessionId: string,
  phoneSocketId: string,
  phoneDeviceName: string,
  phoneBtAddress: string,
  phoneOsType: string,
  phoneIpAddress: string,
  sessionIdHint?: string
): Session | null {
  const cleanKey = (tokenOrSessionId || '').trim();
  const cleanHint = (sessionIdHint || '').trim();

  // 1. Try matching by sessionId directly
  let session = (cleanHint && sessions.get(cleanHint)) || (cleanKey && sessions.get(cleanKey));

  // 2. Try matching by token (case-insensitive)
  if (!session && cleanKey) {
    session = Array.from(sessions.values()).find(
      s => s.token.toUpperCase() === cleanKey.toUpperCase()
    );
  }

  if (!session) {
    console.warn(`[Pairing] Failed: No active session found for key: "${cleanKey}"`);
    return null;
  }

  // Fail-closed: session must belong to a verified tenant
  const tenantId = session.tenantId;
  if (!tenantId) {
    console.error(`[Pairing] Failed: Session ${session.id} has no assigned tenantId. Pairing rejected (fail-closed).`);
    return null;
  }

  // Hardened Invariant: If session is paired with an authenticated device, reject anonymous/QR phone:join attempts
  if (session.phoneDeviceId != null) {
    console.warn(`[Pairing] Rejected: Session ${session.id} is paired with authenticated device ${session.phoneDeviceId} and cannot be hijacked via phone:join.`);
    return null;
  }

  // If another phone is already paired in QR mode, explicitly handle it (prevent silent orphaning)
  if (session.phoneSocketId && session.phoneSocketId !== phoneSocketId) {
    console.warn(`[Pairing] Replacing QR phone ${session.phoneSocketId} with ${phoneSocketId} in session ${session.id}`);
    // The old phone will be notified via socket events by the caller (server.ts)
  }

  session.phoneSocketId = phoneSocketId;
  session.phoneDeviceName = phoneDeviceName || 'Android Device';
  session.phoneBtAddress = phoneBtAddress || '48:D2:24:D3:5F:AA';
  session.phoneOsType = phoneOsType || 'Android';
  session.phoneIpAddress = phoneIpAddress || '127.0.0.1';
  session.status = 'PAIRED';
  session.lastHeartbeat = new Date();
  session.updatedAt = new Date();

  // Phase 7 Invariant: Atomic check for plan device limit and registration inside transaction
  try {
    const pairDeviceTxn = db.transaction(() => {
      const devId = phoneBtAddress || 'dev_' + phoneDeviceName.replace(/\s+/g, '_');
      const existingDevice = db.prepare(`SELECT id FROM devices WHERE (id = ? OR (btAddress IS NOT NULL AND btAddress = ?)) AND tenantId = ?`).get(devId, phoneBtAddress || '', tenantId) as { id: string } | undefined;
      if (!existingDevice) {
        const limitCheck = checkLimit(tenantId, 'maxDevices', 1);
        if (!limitCheck.allowed) {
          const err: any = new Error(`Tenant ${tenantId} reached device limit (${limitCheck.current}/${limitCheck.limit}).`);
          (err as any).limitRejected = true;
          throw err;
        }
      }

      const targetId = existingDevice ? existingDevice.id : devId;

      db.prepare(`
        INSERT INTO devices (id, name, btAddress, osType, ipAddress, status, tenantId, lastSeenAt)
        VALUES (@id, @name, @btAddress, @osType, @ipAddress, 'ONLINE', @tenantId, @lastSeenAt)
        ON CONFLICT(id) DO UPDATE SET
          name = @name,
          osType = @osType,
          ipAddress = @ipAddress,
          status = 'ONLINE',
          tenantId = @tenantId,
          lastSeenAt = @lastSeenAt
      `).run({
        id: targetId,
        name: phoneDeviceName,
        btAddress: phoneBtAddress,
        osType: phoneOsType,
        ipAddress: phoneIpAddress,
        tenantId: tenantId,
        lastSeenAt: new Date().toISOString()
      });
    });

    pairDeviceTxn();
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

export function pairAuthenticatedDevice(
  sessionId: string,
  deviceId: string,
  phoneSocketId: string,
  phoneDeviceName: string,
  phoneBtAddress: string,
  phoneOsType: string,
  phoneIpAddress: string,
  userId: string,
  tenantId: string
): Session | null {
  const session = sessions.get(sessionId);
  if (!session) {
    console.warn(`[Pairing] Failed: Session ${sessionId} not found`);
    return null;
  }

  // Tenant isolation check
  if (!session.tenantId || session.tenantId !== tenantId) {
    console.error(`[Pairing] Rejected: Session tenant ${session.tenantId} != device tenant ${tenantId}`);
    return null;
  }

  // If another phone is already paired, cleanly replace it
  if (session.phoneSocketId && session.phoneSocketId !== phoneSocketId) {
    console.warn(`[Pairing] Replacing phone ${session.phoneSocketId} with ${phoneSocketId} in session ${session.id}`);
  }

  session.phoneSocketId = phoneSocketId;
  session.phoneDeviceName = phoneDeviceName || 'Android Device';
  session.phoneBtAddress = phoneBtAddress || '48:D2:24:D3:5F:AA';
  session.phoneOsType = phoneOsType || 'Android';
  session.phoneIpAddress = phoneIpAddress || '127.0.0.1';
  session.phoneDeviceId = deviceId;
  session.status = 'PAIRED';
  session.lastHeartbeat = new Date();
  session.updatedAt = new Date();

  try {
    db.prepare(`
      UPDATE devices 
      SET status = 'PAIRED', lastSeenAt = @now, updatedAt = @now 
      WHERE id = @id AND tenantId = @tenantId
    `).run({
      id: deviceId,
      tenantId,
      now: new Date().toISOString()
    });
  } catch (err) {
    console.error('[SessionManager] Error updating device status:', err);
  }

  return session;
}

export function revokePhone(sessionId: string): string | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const prevDevId = session.phoneDeviceId || session.phoneBtAddress;
  if (prevDevId) {
    try {
      db.prepare(`UPDATE devices SET status = 'ONLINE', updatedAt = datetime('now') WHERE id = ?`).run(prevDevId);
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

export function updateHeartbeat(socketId: string): Session | undefined {
  const session = getSessionBySocketId(socketId);
  if (session && session.phoneSocketId === socketId) {
    session.lastHeartbeat = new Date();
    session.updatedAt = new Date();

    // Update SQLite device lastSeenAt
    const devId = session.phoneBtAddress || (session.phoneDeviceName ? 'dev_' + session.phoneDeviceName.replace(/\s+/g, '_') : null);
    if (devId) {
      try {
        db.prepare(`UPDATE devices SET lastSeenAt = @now, status = 'ONLINE' WHERE id = @id`).run({
          now: new Date().toISOString(),
          id: devId
        });
      } catch {}
    }
  }
  return session;
}

export function handlePhoneDisconnect(socketId: string): Session | undefined {
  const session = getSessionBySocketId(socketId);
  if (!session || session.phoneSocketId !== socketId) return undefined;

  const devId = session.phoneBtAddress || (session.phoneDeviceName ? 'dev_' + session.phoneDeviceName.replace(/\s+/g, '_') : null);
  if (devId) {
    try {
      db.prepare(`UPDATE devices SET status = 'OFFLINE', lastSeenAt = @now WHERE id = @id`).run({
        now: new Date().toISOString(),
        id: devId
      });
    } catch {}
  }

  // IMPORTANT: Keep device name/address so the reconnect fallback can find the same session!
  session.phoneSocketId = null;  // clear socket — phone is gone
  // Do NOT clear phoneDeviceName, phoneBtAddress etc — needed to re-pair on reconnect
  session.status = 'WAITING';
  session.lastHeartbeat = null;
  session.updatedAt = new Date();
  return session;
}
