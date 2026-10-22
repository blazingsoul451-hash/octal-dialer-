/**
 * website_octal_dialer/backend/src/services/omnichannelReplyEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * World-Class Deterministic Reply Detection (Email IMAP IDLE + FB Wire Ingestion)
 * + Atomic Stop-on-Reply + Instant Android Auto-Dialer Hot-Lead Handoff
 * + Perpetual 24/7 Auto-Reconnect Watchdog + Direct In-App Reply Dispatcher.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
const rawEmailReplyParser = require('email-reply-parser');
const EmailReplyParser = rawEmailReplyParser.default || rawEmailReplyParser;
import { db, normalizePhone, recordLeadActivity } from '../databaseManager';

// Map of active persistent IMAP IDLE connections keyed by `${tenantId}:${accountId}`
const activeImapWorkers = new Map<string, ImapFlow>();
const imapReconnectTimers = new Map<string, NodeJS.Timeout>();
let ioInstance: any = null;

export function setReplyEngineSocketIo(io: any): void {
  ioInstance = io;
}

/**
 * 1. Generate Deterministic RFC 2822 Message-ID for Outbound Emails
 * Embeds tenantId, campaignRunId, leadId, and stage into the Message-ID header.
 */
export function generateDeterministicMessageId(params: {
  tenantId: string;
  campaignRunId: string;
  leadId: string;
  stage: number;
  senderEmail: string;
}): string {
  const domain = params.senderEmail.includes('@')
    ? params.senderEmail.split('@')[1].trim()
    : 'octaldialer.com';
  const rand = crypto.randomBytes(4).toString('hex');
  // Safe base64url encoding of routing metadata
  const token = Buffer.from(
    JSON.stringify({
      t: params.tenantId,
      c: params.campaignRunId,
      l: params.leadId,
      s: params.stage,
    })
  ).toString('base64url');

  return `<octal.${token}.${rand}@${domain}>`;
}

/**
 * Decode deterministic Message-ID token if present in In-Reply-To or References
 */
export function decodeDeterministicHeader(headerVal?: string | string[] | null): {
  tenantId: string;
  campaignRunId: string;
  leadId: string;
  stage: number;
} | null {
  if (!headerVal) return null;
  const raw = Array.isArray(headerVal) ? headerVal.join(' ') : String(headerVal);
  const match = raw.match(/<octal\.([A-Za-z0-9_-]+)\.[0-9a-f]+@/i);
  if (!match || !match[1]) return null;

  try {
    const parsed = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
    if (parsed && parsed.t && parsed.l) {
      return {
        tenantId: parsed.t,
        campaignRunId: parsed.c || '',
        leadId: parsed.l,
        stage: Number(parsed.s || 1),
      };
    }
  } catch {}
  return null;
}

/**
 * 2. Clean Email Reply & Classify Intent + Extract Phone Numbers
 */
export function parseAndClassifyReply(rawBody: string, subject: string = ''): {
  cleanText: string;
  intent: 'phone_shared' | 'positive' | 'question' | 'ooo' | 'dnc';
  extractedPhone: string | null;
} {
  // Strip quoted history and corporate signatures using crisp-im/email-reply-parser
  let cleanText = (rawBody || '').trim();
  try {
    const parsedReply = new EmailReplyParser().read(rawBody || '');
    const visible = parsedReply.getVisibleText();
    if (visible && visible.trim().length > 0) {
      cleanText = visible.trim();
    }
  } catch {
    cleanText = (rawBody || '').trim();
  }

  const combined = `${subject} ${cleanText}`.toLowerCase();

  // Extract phone number if shared in the reply body
  const phoneRegex = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\b03\d{2}[\s.-]?\d{7}\b/;
  const phoneMatch = cleanText.match(phoneRegex);
  const extractedPhone = phoneMatch ? normalizePhone(phoneMatch[0]) : null;

  // Intent Classification Rules
  if (
    /\b(unsubscribe|remove me|stop emailing|do not contact|take me off|opt out)\b/i.test(cleanText)
  ) {
    return { cleanText, intent: 'dnc', extractedPhone: null };
  }

  if (
    /\b(out of office|automatic reply|auto-reply|on vacation|away from my desk|annual leave)\b/i.test(combined)
  ) {
    return { cleanText, intent: 'ooo', extractedPhone };
  }

  if (extractedPhone && extractedPhone.length >= 10) {
    return { cleanText, intent: 'phone_shared', extractedPhone };
  }

  if (
    /\b(interested|call me|let's talk|lets talk|schedule|book a time|send pricing|sounds good|yes please|let's connect)\b/i.test(cleanText)
  ) {
    return { cleanText, intent: 'positive', extractedPhone };
  }

  return { cleanText, intent: 'question', extractedPhone };
}

/**
 * 3. Unified Ingestion Handler for BOTH Email Replies & Facebook DMs/Comments
 * Enforces Idempotency, Atomic Stop-on-Reply, Unibox Threading, and Android Dialer Promotion
 */
export async function ingestInboundOmnichannelReply(params: {
  tenantId: string;
  channel: 'email' | 'facebook_dm' | 'facebook_comment';
  accountId: string;
  externalMessageId: string;
  externalThreadId: string;
  senderAddress: string;
  senderName: string;
  recipientAddress: string;
  subject?: string;
  bodyRaw: string;
  inReplyTo?: string;
  referencesHeader?: string;
  matchedEmailLeadId?: string;
}): Promise<{ processed: boolean; threadId?: string; intent?: string }> {
  const now = new Date().toISOString();
  const { cleanText, intent, extractedPhone } = parseAndClassifyReply(params.bodyRaw, params.subject);

  return db.withTransaction(async () => {
    // A. Idempotency Guard: Never process the same email/FB message twice
    const existingMsg = await db.queryOne<{ id: string }>(
      `SELECT id FROM outreach_messages WHERE "tenantId" = $1 AND channel = $2 AND "externalMessageId" = $3`,
      [params.tenantId, params.channel, params.externalMessageId]
    );
    if (existingMsg) {
      return { processed: false };
    }

    // B. Resolve Email Lead (Deterministic Header Match -> Fallback to Sender Email)
    let emailLead: any = null;
    if (params.matchedEmailLeadId) {
      emailLead = await db.queryOne(
        `SELECT * FROM email_leads WHERE id = $1 AND "tenantId" = $2`,
        [params.matchedEmailLeadId, params.tenantId]
      );
    }
    if (!emailLead && params.channel === 'email') {
      emailLead = await db.queryOne(
        `SELECT * FROM email_leads WHERE "tenantId" = $1 AND LOWER(email) = LOWER($2)`,
        [params.tenantId, params.senderAddress]
      );
    }

    // C. Atomic Stop-on-Reply Lock: Immediately halt future sequence steps across Email & FB
    if (emailLead && intent !== 'ooo') {
      const nextStatus = intent === 'dnc' ? 'unsubscribed' : 'completed';
      await db.execute(
        `UPDATE email_leads SET status = $1, "repliedAt" = $2, "lastIntent" = $3, phone = COALESCE($4, phone) WHERE id = $5 AND "tenantId" = $6`,
        [nextStatus, now, intent, extractedPhone, emailLead.id, params.tenantId]
      );
    }

    // Cancel any pending Facebook tasks for this prospect
    await db.execute(
      `UPDATE fb_task_queue SET status = 'cancelled_on_reply', "updatedAt" = $1 WHERE "tenantId" = $2 AND status = 'pending' AND payload LIKE $3`,
      [now, params.tenantId, `%${params.senderAddress}%`]
    );

    // D. Upsert Omnichannel Thread in Unibox
    const threadStatus =
      intent === 'positive' || intent === 'phone_shared'
        ? 'replied_hot'
        : intent === 'dnc'
        ? 'dnc'
        : intent === 'ooo'
        ? 'ooo'
        : 'objection';

    let thread = await db.queryOne<{ id: string; leadId: string | null }>(
      `SELECT id, "leadId" FROM outreach_threads WHERE "tenantId" = $1 AND channel = $2 AND "externalThreadId" = $3`,
      [params.tenantId, params.channel, params.externalThreadId]
    );

    const threadId = thread?.id || `thd_${crypto.randomBytes(8).toString('hex')}`;
    if (!thread) {
      await db.execute(
        `INSERT INTO outreach_threads (
          id, "tenantId", "leadId", "emailLeadId", channel, "accountId", "externalThreadId",
          "prospectAddress", "prospectName", "prospectCompany", subject, status,
          "sequenceLocked", "unreadCount", "lastMessageSnippet", "lastMessageAt", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1, 1, $13, $14, $14, $14)
        ON CONFLICT ("tenantId", channel, "externalThreadId") DO UPDATE SET
          status = EXCLUDED.status,
          "sequenceLocked" = 1,
          "unreadCount" = outreach_threads."unreadCount" + 1,
          "lastMessageSnippet" = EXCLUDED."lastMessageSnippet",
          "lastMessageAt" = EXCLUDED."lastMessageAt",
          "updatedAt" = EXCLUDED."updatedAt"`,
        [
          threadId,
          params.tenantId,
          emailLead?.dialerLeadId || null,
          emailLead?.id || null,
          params.channel,
          params.accountId,
          params.externalThreadId,
          params.senderAddress,
          emailLead?.name || params.senderName || params.senderAddress,
          emailLead?.company || '',
          params.subject || (params.channel.startsWith('facebook') ? 'Facebook Outreach' : 'Re: Outreach'),
          threadStatus,
          cleanText.slice(0, 180),
          now,
        ]
      );
    } else {
      await db.execute(
        `UPDATE outreach_threads 
         SET status = $1, "sequenceLocked" = 1, "unreadCount" = "unreadCount" + 1,
             "lastMessageSnippet" = $2, "lastMessageAt" = $3, "updatedAt" = $3
         WHERE id = $4`,
        [threadStatus, cleanText.slice(0, 180), now, threadId]
      );
    }

    // E. Insert Inbound Message Record
    const msgId = `msg_${crypto.randomBytes(8).toString('hex')}`;
    await db.execute(
      `INSERT INTO outreach_messages (
        id, "threadId", "tenantId", direction, channel, "senderAddress", "recipientAddress",
        "externalMessageId", "inReplyTo", "referencesHeader", subject, "bodyRaw", "bodyClean",
        intent, "extractedPhone", "createdAt"
      ) VALUES ($1, $2, $3, 'inbound', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT ("tenantId", channel, "externalMessageId") DO NOTHING`,
      [
        msgId,
        threadId,
        params.tenantId,
        params.channel,
        params.senderAddress,
        params.recipientAddress,
        params.externalMessageId,
        params.inReplyTo || null,
        params.referencesHeader || null,
        params.subject || null,
        params.bodyRaw,
        cleanText,
        intent,
        extractedPhone,
        now,
      ]
    );

    // F. Cross-Channel Handoff: Auto-Promote Hot Leads or Extracted Phones to Android Dialer!
    const dialablePhone = extractedPhone || (emailLead?.phone ? normalizePhone(emailLead.phone) : null);
    let promotedLeadId = thread?.leadId || emailLead?.dialerLeadId || null;

    if ((intent === 'positive' || intent === 'phone_shared') && dialablePhone) {
      // Find or create dedicated "🔥 Hot Omnichannel Replies" Campaign for this tenant
      let hotCamp = await db.queryOne<{ id: string }>(
        `SELECT id FROM campaigns WHERE "tenantId" = $1 AND name = '🔥 Hot Omnichannel Replies' LIMIT 1`,
        [params.tenantId]
      );
      if (!hotCamp) {
        const newCampId = `camp_hot_${crypto.randomBytes(4).toString('hex')}`;
        await db.execute(
          `INSERT INTO campaigns (id, name, "fileName", "leadCount", status, "tenantId", "createdAt")
           VALUES ($1, '🔥 Hot Omnichannel Replies', 'omnichannel_auto_sync', 0, 'ACTIVE', $2, $3)`,
          [newCampId, params.tenantId, now]
        );
        hotCamp = { id: newCampId };
      }

      if (!promotedLeadId) {
        promotedLeadId = `lead_hot_${crypto.randomBytes(6).toString('hex')}`;
        await db.execute(
          `INSERT INTO leads (
            id, "campaignId", name, phone, email, status, priority, "sourceChannel", "lastReplySnippet", "tenantId", "createdAt"
          ) VALUES ($1, $2, $3, $4, $5, 'PENDING', 100, $6, $7, $8, $9)`,
          [
            promotedLeadId,
            hotCamp.id,
            emailLead?.name || params.senderName || 'Hot Prospect',
            dialablePhone,
            params.channel === 'email' ? params.senderAddress : null,
            params.channel,
            cleanText.slice(0, 200),
            params.tenantId,
            now,
          ]
        );
        await db.execute(
          `UPDATE campaigns SET "leadCount" = "leadCount" + 1 WHERE id = $1 AND "tenantId" = $2`,
          [hotCamp.id, params.tenantId]
        );
        await db.execute(`UPDATE outreach_threads SET "leadId" = $1 WHERE id = $2`, [promotedLeadId, threadId]);
      } else {
        // Boost existing lead priority to 100 so Android dialer calls them next
        await db.execute(
          `UPDATE leads SET priority = 100, status = 'PENDING', "lastReplySnippet" = $1 WHERE id = $2 AND "tenantId" = $3`,
          [cleanText.slice(0, 200), promotedLeadId, params.tenantId]
        );
      }

      await recordLeadActivity({
        leadId: promotedLeadId,
        tenantId: params.tenantId,
        eventType: 'OMNICHANNEL_HOT_REPLY',
        description: `Hot reply detected via ${params.channel.toUpperCase()} (${intent}): "${cleanText.slice(0, 100)}"`,
        metadata: { threadId, channel: params.channel, intent, phone: dialablePhone },
      });
    }

    // G. Real-time Socket.IO Push to Web CRM Unibox AND Android Handset
    if (ioInstance) {
      const eventPayload = {
        threadId,
        messageId: msgId,
        channel: params.channel,
        senderName: emailLead?.name || params.senderName,
        senderAddress: params.senderAddress,
        snippet: cleanText.slice(0, 160),
        intent,
        extractedPhone: dialablePhone,
        promotedLeadId,
        timestamp: now,
      };
      ioInstance.to(`tenant_${params.tenantId}`).emit('unibox:new_reply', eventPayload);
      if (promotedLeadId) {
        ioInstance.to(`tenant_${params.tenantId}`).emit('leads:updated');
        ioInstance.to(`tenant_${params.tenantId}`).emit('dialer:hot_lead_queued', eventPayload);
      }
    }

    return { processed: true, threadId, intent };
  });
}

/**
 * 4. IMAP IDLE Real-Time Inbox Watcher per Mailbox (24/7 Perpetual Auto-Reconnect Watchdog)
 */
export async function startImapIdleForAccount(account: {
  id: string;
  tenantId: string;
  email: string;
  password?: string;
  smtpHost: string;
  imapHost?: string;
  imapPort?: number;
  authType?: string;
  accessToken?: string;
  refreshToken?: string;
}): Promise<void> {
  if (account.authType === 'sandbox' || !account.email || !account.email.includes('@')) return;

  const key = `${account.tenantId}:${account.id}`;
  if (activeImapWorkers.has(key)) return;

  // Clear any existing reconnect timer
  if (imapReconnectTimers.has(key)) {
    clearTimeout(imapReconnectTimers.get(key)!);
    imapReconnectTimers.delete(key);
  }

  const scheduleReconnect = (delayMs = 15000) => {
    activeImapWorkers.delete(key);
    if (imapReconnectTimers.has(key)) {
      clearTimeout(imapReconnectTimers.get(key)!);
    }
    const timer = setTimeout(() => {
      imapReconnectTimers.delete(key);
      console.log(`[IMAP IDLE] Auto-reconnecting IDLE listener for ${account.email}...`);
      startImapIdleForAccount(account).catch((e) => {
        console.warn(`[IMAP IDLE] Reconnect error for ${account.email}:`, e.message);
      });
    }, delayMs);
    imapReconnectTimers.set(key, timer);
  };

  const derivedImapHost =
    account.imapHost ||
    (account.authType === 'oauth_google' ? 'imap.gmail.com' :
     account.authType === 'oauth_microsoft' ? 'outlook.office365.com' :
     account.authType === 'oauth_yahoo' ? 'imap.mail.yahoo.com' :
     account.smtpHost
       .replace(/^smtp\./i, 'imap.')
       .replace(/^smtpout\.secureserver\.net$/i, 'imap.secureserver.net'));

  const authOptions: any = account.accessToken
    ? { user: account.email, accessToken: account.accessToken }
    : { user: account.email, pass: account.password || '' };

  const client = new ImapFlow({
    host: derivedImapHost,
    port: account.imapPort || 993,
    secure: true,
    auth: authOptions,
    logger: false,
  });

  activeImapWorkers.set(key, client);

  client.on('error', (err) => {
    console.warn(`[IMAP IDLE] Connection warning for ${account.email}:`, err.message);
    scheduleReconnect(15000);
  });

  client.on('close', () => {
    console.log(`[IMAP IDLE] Socket closed for ${account.email}. Rescheduling...`);
    scheduleReconnect(10000);
  });

  try {
    await client.connect();
    await db.execute(
      `UPDATE email_accounts SET "imapStatus" = 'connected', "lastSyncedAt" = $1 WHERE id = $2`,
      [new Date().toISOString(), account.id]
    );

    const lock = await client.getMailboxLock('INBOX');
    try {
      client.on('exists', async (data?: any) => {
        try {
          if (!client.mailbox) return;
          const existsCount = typeof client.mailbox === 'object' ? client.mailbox.exists : 1;
          const fetchRange = (data && data.prev && data.count)
            ? `${Math.max(1, data.prev + 1)}:*`
            : `${Math.max(1, existsCount)}:*`;

          for await (const msg of client.fetch(fetchRange, {
            uid: true,
            envelope: true,
            source: true,
            headers: ['message-id', 'in-reply-to', 'references'],
          })) {
            if (!msg.source) continue;
            const parsed: any = await (simpleParser as any)(msg.source);
            const fromAddress = parsed.from?.value?.[0]?.address || '';
            const fromName = parsed.from?.value?.[0]?.name || fromAddress;
            if (!fromAddress || fromAddress.toLowerCase() === account.email.toLowerCase()) continue;

            const inReplyTo = parsed.inReplyTo || '';
            const refs = Array.isArray(parsed.references)
              ? parsed.references.join(' ')
              : parsed.references || '';

            // Step 1: Deterministic header decoding (<octal.{base64}@domain>)
            let matchedLeadId: string | undefined;
            const decoded = decodeDeterministicHeader(inReplyTo) || decodeDeterministicHeader(refs);
            if (decoded && decoded.tenantId === account.tenantId) {
              matchedLeadId = decoded.leadId;
            } else if (inReplyTo) {
              // Step 2: Check email_dispatch_logs by exact Message-ID match
              const dispatchMatch = await db.queryOne<{ leadId: string }>(
                `SELECT "leadId" FROM email_dispatch_logs WHERE "tenantId" = $1 AND "messageId" = $2 LIMIT 1`,
                [account.tenantId, inReplyTo]
              );
              if (dispatchMatch) matchedLeadId = dispatchMatch.leadId;
            }

            await ingestInboundOmnichannelReply({
              tenantId: account.tenantId,
              channel: 'email',
              accountId: account.id,
              externalMessageId: parsed.messageId || `imap_${account.id}_${msg.uid}`,
              externalThreadId: inReplyTo || parsed.messageId || `thd_${fromAddress}`,
              senderAddress: fromAddress,
              senderName: fromName,
              recipientAddress: account.email,
              subject: parsed.subject || '',
              bodyRaw: parsed.text || parsed.html || '',
              inReplyTo,
              referencesHeader: refs,
              matchedEmailLeadId: matchedLeadId,
            });
          }
        } catch (fetchErr: any) {
          console.warn(`[IMAP IDLE Fetch Error for ${account.email}]:`, fetchErr.message);
        }
      });

      // Hold persistent IMAP IDLE loop (re-idles cleanly across 29-min RFC timeout)
      while (client.usable) {
        try {
          await client.idle();
        } catch (idleErr: any) {
          console.warn(`[IMAP IDLE] Cycle ended for ${account.email}:`, idleErr.message);
          break;
        }
      }
    } finally {
      lock.release();
    }
  } catch (err: any) {
    scheduleReconnect(20000);
    await db.execute(
      `UPDATE email_accounts SET "imapStatus" = 'error' WHERE id = $1`,
      [account.id]
    ).catch(() => {});
  }
}

/**
 * 5. Cleanly stop IMAP IDLE worker for an account
 */
export async function stopImapIdleForAccount(tenantId: string, accountId: string): Promise<void> {
  const key = `${tenantId}:${accountId}`;
  if (imapReconnectTimers.has(key)) {
    clearTimeout(imapReconnectTimers.get(key)!);
    imapReconnectTimers.delete(key);
  }
  const client = activeImapWorkers.get(key);
  if (client) {
    activeImapWorkers.delete(key);
    try {
      await client.logout();
    } catch {}
  }
}

/**
 * 6. Send Outbound Email Reply Directly From Unibox UI
 * Preserves In-Reply-To and References headers for RFC 2822 thread continuity.
 */
export async function sendUniboxEmailReply(params: {
  tenantId: string;
  threadId: string;
  body: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const thread = await db.queryOne<any>(
    `SELECT * FROM outreach_threads WHERE id = $1 AND "tenantId" = $2`,
    [params.threadId, params.tenantId]
  );
  if (!thread) {
    return { success: false, error: 'Thread not found' };
  }

  let account = await db.queryOne<any>(
    `SELECT * FROM email_accounts WHERE id = $1 AND "tenantId" = $2`,
    [thread.accountId, params.tenantId]
  );
  if (!account) {
    account = await db.queryOne<any>(
      `SELECT * FROM email_accounts WHERE "tenantId" = $1 AND ("smtpHost" IS NOT NULL OR "accessToken" IS NOT NULL) LIMIT 1`,
      [params.tenantId]
    );
  }
  if (!account) {
    return { success: false, error: 'No active email account found to send reply' };
  }

  const latestInbound = await db.queryOne<any>(
    `SELECT * FROM outreach_messages 
     WHERE "threadId" = $1 AND "tenantId" = $2 
     ORDER BY "createdAt" DESC LIMIT 1`,
    [params.threadId, params.tenantId]
  );

  const rawSubject = latestInbound?.subject || thread.subject || 'Outreach';
  const subject = rawSubject.toLowerCase().startsWith('re:') ? rawSubject : `Re: ${rawSubject}`;
  const inReplyTo = latestInbound?.externalMessageId || undefined;
  const references = latestInbound?.referencesHeader
    ? `${latestInbound.referencesHeader} ${latestInbound.externalMessageId || ''}`.trim()
    : inReplyTo;

  const isOAuth = account.authType && account.authType.startsWith('oauth_');
  const authConfig: any = isOAuth
    ? {
        type: 'OAuth2',
        user: account.email,
        clientId:
          account.authType === 'oauth_google'
            ? process.env.GOOGLE_CLIENT_ID
            : account.authType === 'oauth_microsoft'
            ? process.env.MICROSOFT_CLIENT_ID
            : process.env.YAHOO_CLIENT_ID,
        clientSecret:
          account.authType === 'oauth_google'
            ? process.env.GOOGLE_CLIENT_SECRET
            : account.authType === 'oauth_microsoft'
            ? process.env.MICROSOFT_CLIENT_SECRET
            : process.env.YAHOO_CLIENT_SECRET,
        refreshToken: account.refreshToken,
        accessToken: account.accessToken,
      }
    : {
        user: account.email,
        pass: account.password,
      };

  const derivedSmtpHost = account.smtpHost || (
    account.authType === 'oauth_google' ? 'smtp.gmail.com' :
    account.authType === 'oauth_microsoft' ? 'smtp.office365.com' :
    account.authType === 'oauth_yahoo' ? 'smtp.mail.yahoo.com' : 'smtp.gmail.com'
  );

  const transporter = nodemailer.createTransport({
    host: derivedSmtpHost,
    port: Number(account.smtpPort) || 587,
    secure: Number(account.smtpPort) === 465,
    auth: authConfig,
    tls: { rejectUnauthorized: false },
  });

  const deterministicMessageId = generateDeterministicMessageId({
    tenantId: params.tenantId,
    campaignRunId: 'unibox_manual_reply',
    leadId: thread.leadId || thread.emailLeadId || 'prospect',
    stage: 99,
    senderEmail: account.email,
  });

  const mailOptions: any = {
    from: `"${account.fromName || account.name || 'Sales Team'}" <${account.email}>`,
    to: thread.prospectAddress,
    subject,
    text: params.body,
    html: params.body.replace(/\n/g, '<br/>'),
    messageId: deterministicMessageId,
    inReplyTo,
    references,
  };

  const sendResult = await transporter.sendMail(mailOptions);
  const now = new Date().toISOString();
  const msgId = `msg_${crypto.randomBytes(8).toString('hex')}`;

  await db.execute(
    `INSERT INTO outreach_messages (
      id, "threadId", "tenantId", direction, channel, "senderAddress", "recipientAddress",
      "externalMessageId", "inReplyTo", "referencesHeader", subject, "bodyRaw", "bodyClean",
      intent, "createdAt"
    ) VALUES ($1, $2, $3, 'outbound', 'email', $4, $5, $6, $7, $8, $9, $10, $11, 'outbound_reply', $12)`,
    [
      msgId,
      params.threadId,
      params.tenantId,
      account.email,
      thread.prospectAddress,
      deterministicMessageId || sendResult.messageId,
      inReplyTo || null,
      references || null,
      subject,
      params.body,
      params.body,
      now,
    ]
  );

  await db.execute(
    `UPDATE outreach_threads 
     SET status = 'replied', "lastMessageSnippet" = $1, "lastMessageAt" = $2, "updatedAt" = $2
     WHERE id = $3 AND "tenantId" = $4`,
    [params.body.slice(0, 180), now, params.threadId, params.tenantId]
  );

  if (ioInstance) {
    ioInstance.to(`tenant_${params.tenantId}`).emit('unibox:message_sent', {
      threadId: params.threadId,
      messageId: msgId,
      direction: 'outbound',
      channel: 'email',
      senderAddress: account.email,
      body: params.body,
      timestamp: now,
    });
  }

  return { success: true, messageId: msgId };
}

/**
 * 7. Cross-Channel Trigger: Instant Handoff to Android Handset for Direct Calling
 */
export async function triggerDialerCallForThread(params: {
  tenantId: string;
  threadId: string;
}): Promise<{ success: boolean; phone?: string; leadId?: string; error?: string }> {
  const thread = await db.queryOne<any>(
    `SELECT * FROM outreach_threads WHERE id = $1 AND "tenantId" = $2`,
    [params.threadId, params.tenantId]
  );
  if (!thread) return { success: false, error: 'Thread not found' };

  let phone: string | null = null;
  let leadName: string = thread.prospectName || 'Prospect';
  let leadId = thread.leadId;

  if (leadId) {
    const existingLead = await db.queryOne<any>(
      `SELECT * FROM leads WHERE id = $1 AND "tenantId" = $2`,
      [leadId, params.tenantId]
    );
    if (existingLead) {
      phone = existingLead.phone;
      leadName = existingLead.name || leadName;
    }
  }

  if (!phone && thread.emailLeadId) {
    const eml = await db.queryOne<any>(
      `SELECT * FROM email_leads WHERE id = $1 AND "tenantId" = $2`,
      [thread.emailLeadId, params.tenantId]
    );
    if (eml?.phone) {
      phone = normalizePhone(eml.phone);
    }
  }

  if (!phone) {
    const msgWithPhone = await db.queryOne<any>(
      `SELECT "extractedPhone" FROM outreach_messages 
       WHERE "threadId" = $1 AND "tenantId" = $2 AND "extractedPhone" IS NOT NULL 
       ORDER BY "createdAt" DESC LIMIT 1`,
      [params.threadId, params.tenantId]
    );
    if (msgWithPhone?.extractedPhone) {
      phone = normalizePhone(msgWithPhone.extractedPhone);
    }
  }

  if (!phone) {
    return { success: false, error: 'No phone number available for this prospect.' };
  }

  const now = new Date().toISOString();

  if (!leadId) {
    let hotCamp = await db.queryOne<{ id: string }>(
      `SELECT id FROM campaigns WHERE "tenantId" = $1 AND name = '🔥 Hot Omnichannel Replies' LIMIT 1`,
      [params.tenantId]
    );
    if (!hotCamp) {
      const newCampId = `camp_hot_${crypto.randomBytes(4).toString('hex')}`;
      await db.execute(
        `INSERT INTO campaigns (id, name, "fileName", "leadCount", status, "tenantId", "createdAt")
         VALUES ($1, '🔥 Hot Omnichannel Replies', 'omnichannel_auto_sync', 0, 'ACTIVE', $2, $3)`,
        [newCampId, params.tenantId, now]
      );
      hotCamp = { id: newCampId };
    }

    leadId = `lead_hot_${crypto.randomBytes(6).toString('hex')}`;
    await db.execute(
      `INSERT INTO leads (
        id, "campaignId", name, phone, email, status, priority, "sourceChannel", "lastReplySnippet", "tenantId", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, 'PENDING', 100, $6, $7, $8, $9)`,
      [
        leadId,
        hotCamp.id,
        leadName,
        phone,
        thread.channel === 'email' ? thread.prospectAddress : null,
        thread.channel,
        thread.lastMessageSnippet || 'Manual Unibox trigger',
        params.tenantId,
        now,
      ]
    );
    await db.execute(`UPDATE outreach_threads SET "leadId" = $1 WHERE id = $2`, [leadId, params.threadId]);
  } else {
    await db.execute(
      `UPDATE leads SET priority = 100, status = 'PENDING' WHERE id = $1 AND "tenantId" = $2`,
      [leadId, params.tenantId]
    );
  }

  if (ioInstance) {
    const payload = {
      leadId,
      phone,
      name: leadName,
      priority: 100,
      timestamp: now,
    };
    ioInstance.to(`tenant_${params.tenantId}`).emit('dialer:initiate_call', payload);
    ioInstance.to(`tenant_${params.tenantId}`).emit('dialer:hot_lead_queued', payload);
    ioInstance.to(`tenant_${params.tenantId}`).emit('leads:updated');
  }

  return { success: true, phone, leadId };
}
