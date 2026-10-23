/**
 * website_octal_dialer/backend/src/uniboxRoutes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unibox Router: Ingests real-time Facebook wire-sniffed DMs/comments, serves
 * paginated threads and message history, triggers 1-click Android dialing,
 * and handles direct omnichannel email/FB replies.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router, Request, Response } from 'express';
import { db } from './databaseManager';
import { getTenantId } from './authManager';
import {
  ingestInboundOmnichannelReply,
  sendUniboxEmailReply,
  triggerDialerCallForThread,
} from './services/omnichannelReplyEngine';

export const uniboxRouter = Router();

/**
 * POST /api/webhooks/facebook/incoming-reply
 * Receives real-time wire-sniffed DMs and comments from desktop_octal_agent
 */
uniboxRouter.post('/webhooks/facebook/incoming-reply', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const {
      channel = 'facebook_dm',
      accountId = 'default',
      externalMessageId,
      externalThreadId,
      senderAddress,
      senderName,
      bodyRaw,
    } = req.body;

    if (!externalMessageId || !bodyRaw) {
      return res.status(400).json({ error: 'externalMessageId and bodyRaw are required.' });
    }

    const result = await ingestInboundOmnichannelReply({
      tenantId,
      channel: channel === 'facebook_comment' ? 'facebook_comment' : 'facebook_dm',
      accountId,
      externalMessageId: String(externalMessageId),
      externalThreadId: String(externalThreadId || senderAddress),
      senderAddress: String(senderAddress || 'fb_user'),
      senderName: String(senderName || 'Facebook Prospect'),
      recipientAddress: String(accountId),
      bodyRaw: String(bodyRaw),
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to ingest Facebook reply' });
  }
});

/**
 * GET /api/unibox/stats
 * Returns overall unread counts and intent breakdown
 */
uniboxRouter.get('/unibox/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const totalRow = await db.queryOne<{ unread: string | number; total: string | number }>(
      `SELECT SUM("unreadCount") as unread, COUNT(*) as total FROM outreach_threads WHERE "tenantId" = $1`,
      [tenantId]
    );

    const intentRows = await db.queryAll<{ status: string; count: string | number }>(
      `SELECT status, COUNT(*) as count FROM outreach_threads WHERE "tenantId" = $1 GROUP BY status`,
      [tenantId]
    );

    res.json({
      unreadCount: Number(totalRow?.unread || 0),
      totalThreads: Number(totalRow?.total || 0),
      statusBreakdown: intentRows || [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/unibox/threads
 * Returns paginated omnichannel threads for the 3-Pane Unibox UI
 */
uniboxRouter.get('/unibox/threads', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { channel, status, search } = req.query;

    let sql = `SELECT * FROM outreach_threads WHERE "tenantId" = $1`;
    const params: any[] = [tenantId];

    if (channel && channel !== 'all') {
      params.push(channel);
      sql += ` AND channel = $${params.length}`;
    }
    if (status && status !== 'all') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      sql += ` AND ("prospectName" ILIKE $${params.length} OR "prospectAddress" ILIKE $${params.length} OR "lastMessageSnippet" ILIKE $${params.length})`;
    }

    sql += ` ORDER BY "lastMessageAt" DESC LIMIT 100`;
    const threads = await db.queryAll(sql, params);
    res.json({ threads: threads || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/unibox/threads/:threadId/messages
 * Returns chronological conversation messages + marks thread as read
 */
uniboxRouter.get('/unibox/threads/:threadId/messages', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { threadId } = req.params;

    await db.execute(
      `UPDATE outreach_threads SET "unreadCount" = 0 WHERE id = $1 AND "tenantId" = $2`,
      [threadId, tenantId]
    );

    const messages = await db.queryAll(
      `SELECT * FROM outreach_messages WHERE "threadId" = $1 AND "tenantId" = $2 ORDER BY "createdAt" ASC`,
      [threadId, tenantId]
    );
    res.json({ messages: messages || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/unibox/threads/:threadId/reply
 * Dispatches an outbound reply directly from Unibox
 */
uniboxRouter.post('/unibox/threads/:threadId/reply', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { threadId } = req.params;
    const { body } = req.body;

    if (!body || !String(body).trim()) {
      return res.status(400).json({ error: 'Reply body cannot be empty.' });
    }

    const thread = await db.queryOne<any>(
      `SELECT * FROM outreach_threads WHERE id = $1 AND "tenantId" = $2`,
      [threadId, tenantId]
    );
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found.' });
    }

    // Route Facebook DM / Comment replies to the Desktop Agent Task Queue
    if (thread.channel === 'facebook_dm' || thread.channel === 'facebook_comment') {
      const now = new Date().toISOString();
      const taskId = `fbt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      await db.execute(
        `INSERT INTO fb_task_queue (id, "tenantId", "profileId", "taskType", payload, status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'send_dm', $4, 'pending', $5, $5)`,
        [
          taskId,
          tenantId,
          thread.accountId || 'default',
          JSON.stringify({
            externalThreadId: thread.externalThreadId,
            recipientAddress: thread.prospectAddress,
            body: String(body).trim(),
          }),
          now,
        ]
      );

      await db.execute(
        `INSERT INTO outreach_messages (
          id, "threadId", "tenantId", direction, channel, "senderAddress", "recipientAddress",
          "externalMessageId", "bodyRaw", "bodyClean", intent, "createdAt"
        ) VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, $8, 'outbound_reply', $9)`,
        [
          msgId,
          threadId,
          tenantId,
          thread.channel,
          thread.accountId || 'fb_agent',
          thread.prospectAddress,
          taskId,
          String(body).trim(),
          now,
        ]
      );

      await db.execute(
        `UPDATE outreach_threads SET status = 'replied', "lastMessageSnippet" = $1, "lastMessageAt" = $2, "updatedAt" = $2 WHERE id = $3`,
        [String(body).trim().slice(0, 180), now, threadId]
      );

      return res.json({ success: true, messageId: msgId, queuedTaskId: taskId });
    }

    // Standard Email Reply
    const result = await sendUniboxEmailReply({
      tenantId,
      threadId,
      body: String(body).trim(),
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, messageId: result.messageId });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to send reply' });
  }
});

/**
 * POST /api/unibox/threads/:threadId/trigger-call
 * Immediately promotes/queues prospect to Android handset (Priority = 100)
 */
uniboxRouter.post('/unibox/threads/:threadId/trigger-call', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { threadId } = req.params;

    const result = await triggerDialerCallForThread({
      tenantId,
      threadId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, phone: result.phone, leadId: result.leadId });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to trigger dialer call' });
  }
});

/**
 * PATCH /api/unibox/threads/:threadId/status
 * Updates thread triage status
 */
uniboxRouter.patch('/unibox/threads/:threadId/status', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { threadId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required.' });
    }

    await db.execute(
      `UPDATE outreach_threads SET status = $1, "updatedAt" = $2 WHERE id = $3 AND "tenantId" = $4`,
      [status, new Date().toISOString(), threadId, tenantId]
    );

    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/fb-tasks/pending
 * Polled by desktop_octal_agent to fetch outbound Facebook tasks (send_dm, post_group)
 */
uniboxRouter.get('/fb-tasks/pending', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const tasks = await db.queryAll(
      `SELECT * FROM fb_task_queue 
       WHERE "tenantId" = $1 AND status = 'pending' 
       ORDER BY "createdAt" ASC LIMIT $2`,
      [tenantId, limit]
    );

    res.json({ success: true, tasks: tasks || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/fb-tasks/:taskId/claim
 * Atomically marks task 'processing' by agentId to avoid duplicate worker execution
 */
uniboxRouter.post('/fb-tasks/:taskId/claim', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { taskId } = req.params;
    const { agentId = 'desktop_worker' } = req.body;

    const updated = await db.queryOne(
      `UPDATE fb_task_queue 
       SET status = 'processing', "claimedByAgentId" = $1, "updatedAt" = $2 
       WHERE id = $3 AND "tenantId" = $4 AND status = 'pending'
       RETURNING *`,
      [agentId, new Date().toISOString(), taskId, tenantId]
    );

    if (!updated) {
      return res.status(409).json({ error: 'Task already claimed or not found' });
    }

    res.json({ success: true, task: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/fb-tasks/:taskId/complete
 * Marks task as completed (or failed) with optional output payload / error
 */
uniboxRouter.post('/fb-tasks/:taskId/complete', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { taskId } = req.params;
    const { status = 'completed', error } = req.body;

    await db.execute(
      `UPDATE fb_task_queue 
       SET status = $1, "errorMessage" = $2, "updatedAt" = $3 
       WHERE id = $4 AND "tenantId" = $5`,
      [status === 'failed' ? 'failed' : 'completed', error || null, new Date().toISOString(), taskId, tenantId]
    );

    res.json({ success: true, taskId, status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
