import { Router, Request, Response } from 'express';
import { db } from './databaseManager';

export const crmCommandRouter = Router();

/**
 * Helper: Resolve caller's role & Team Command permission within the active tenant
 */
async function resolveCommandScope(tenantId: string, userId: string, headerRole?: string) {
  const userRow = await db.queryOne<any>(
    `SELECT id, role, 
            COALESCE("reportsToUserId", reports_to_user_id) AS "reportsToUserId",
            COALESCE("teamCommandAccess", team_command_access, 'none') AS "teamCommandAccess",
            COALESCE("canReassignWork", can_reassign_work, FALSE) AS "canReassignWork",
            COALESCE("canApproveQuotes", can_approve_quotes, FALSE) AS "canApproveQuotes"
     FROM users
     WHERE ("tenantId" = $1 OR "tenantId" IS NULL) AND id = $2
     LIMIT 1`,
    [tenantId, userId]
  );

  const effectiveRole = (userRow?.role || headerRole || 'agent').toLowerCase();
  const isOwnerOrAdmin = ['owner', 'company_owner', 'admin', 'super_admin', 'superadmin', 'platform_admin'].includes(effectiveRole);
  const isTeamLead = effectiveRole === 'team_lead' || effectiveRole === 'teamlead' || effectiveRole === 'supervisor';

  return {
    userId,
    role: effectiveRole,
    isOwnerOrAdmin,
    isTeamLead,
    teamCommandAccess: isOwnerOrAdmin ? 'manage' : (userRow?.teamCommandAccess || 'none'),
    canReassignWork: isOwnerOrAdmin ? true : Boolean(userRow?.canReassignWork),
    canApproveQuotes: isOwnerOrAdmin ? true : Boolean(userRow?.canApproveQuotes),
  };
}

/**
 * 1. GET /api/crm/team-command/hierarchy
 * Returns Team Leads, nested Agents under each Team Lead, Unassigned Agents, and live CRM KPIs.
 */
crmCommandRouter.get('/team-command/hierarchy', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller?.tenantId || (req as any).tenantId || (req.headers['x-tenant-id'] as string) || 'tenant_default';
    const userId = caller?.id || (req.headers['x-user-id'] as string);
    const headerRole = caller?.role || (req.headers['x-user-role'] as string);

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Missing tenant or user context' });
    }

    const scope = await resolveCommandScope(tenantId, userId, headerRole);

    if (!scope.isOwnerOrAdmin && (!scope.isTeamLead || scope.teamCommandAccess === 'none')) {
      return res.status(403).json({
        error: 'Access denied. Only the Company Owner or authorized Team Leads can open Team Command.',
      });
    }

    // Fetch roster scoped by role (Owner sees all in tenant; Team Lead sees self + direct reports)
    const params: any[] = [tenantId];
    let rosterFilterSql = '';
    if (!scope.isOwnerOrAdmin) {
      params.push(userId);
      rosterFilterSql = `AND (u.id = $2 OR COALESCE(u."reportsToUserId", u.reports_to_user_id) = $2)`;
    }

    const rosterQuery = `
      SELECT
        u.id,
        COALESCE(u."displayName", u.username, u.email, u.id) AS name,
        COALESCE(u.email, '') AS email,
        LOWER(u.role) AS role,
        COALESCE(u."reportsToUserId", u.reports_to_user_id) AS "reportsToUserId",
        COALESCE(u."teamCommandAccess", u.team_command_access, 'none') AS "teamCommandAccess",
        COALESCE(u."canReassignWork", u.can_reassign_work, FALSE) AS "canReassignWork",
        COALESCE(u."canApproveQuotes", u.can_approve_quotes, FALSE) AS "canApproveQuotes",
        COALESCE((SELECT TRUE FROM devices d WHERE d."userId" = u.id AND d.status = 'connected' LIMIT 1), FALSE) AS "phoneOnline",
        -- Live CRM workload counts (Zero scraper data included)
        (SELECT COUNT(*)::int FROM crm_companies c WHERE c."tenantId" = $1 AND c."assignedUserId" = u.id) AS "companiesCount",
        (SELECT COUNT(*)::int FROM crm_contacts ct WHERE ct."tenantId" = $1 AND ct."assignedUserId" = u.id) AS "contactsCount",
        (SELECT COUNT(*)::int FROM leads l WHERE l."tenantId" = $1 AND l."assignedTo" = u.id AND l.status != 'ARCHIVED') AS "canonicalLeadsCount",
        (SELECT COUNT(*)::int FROM crm_tasks t WHERE t."tenantId" = $1 AND t."assignedUserId" = u.id AND LOWER(t.status) != 'completed' AND t."taskType" NOT IN ('meeting', 'online_meeting')) AS "openTasksCount",
        (SELECT COUNT(*)::int FROM crm_tasks t WHERE t."tenantId" = $1 AND t."assignedUserId" = u.id AND LOWER(t.status) != 'completed' AND t."dueAt" < TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) AS "overdueTasksCount",
        (SELECT COUNT(*)::int FROM crm_tasks m WHERE m."tenantId" = $1 AND m."assignedUserId" = u.id AND m."taskType" IN ('meeting', 'online_meeting') AND m."dueAt" >= TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) AS "upcomingMeetingsCount",
        (SELECT COUNT(*)::int FROM crm_quotes q WHERE q."tenantId" = $1 AND (q."assignedUserId" = u.id OR q."createdByUserId" = u.id)) AS "quotesCount",
        (SELECT COUNT(*)::int FROM crm_work_items w WHERE w."tenantId" = $1 AND w."assignedUserId" = u.id AND UPPER(w.status) != 'COMPLETED') AS "activeWorkCount"
      FROM users u
      WHERE (u."tenantId" = $1 OR ($1 = 'tenant_default' AND u."tenantId" IS NULL))
        ${rosterFilterSql}
      ORDER BY
        CASE WHEN LOWER(u.role) IN ('owner', 'company_owner', 'admin', 'team_lead', 'supervisor') THEN 0 ELSE 1 END,
        name ASC
    `;

    const { rows } = await db.query(rosterQuery, params);

    const teamLeads = rows.filter((r: any) => ['team_lead', 'teamlead', 'supervisor'].includes(r.role));
    const agents = rows.filter((r: any) => !['team_lead', 'teamlead', 'supervisor', 'owner', 'company_owner', 'admin'].includes(r.role));

    return res.json({
      callerScope: scope,
      teamLeads,
      agents,
    });
  } catch (err: any) {
    console.error('[TeamCommand] hierarchy error:', err);
    return res.status(500).json({ error: 'Failed to load Team Command hierarchy' });
  }
});

/**
 * 2. GET /api/crm/team-command/agent/:agentId/workspace
 * Fetches everything an Agent is working on so the Owner/Team Lead can inspect & act in-place.
 */
crmCommandRouter.get('/team-command/agent/:agentId/workspace', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller?.tenantId || (req as any).tenantId || (req.headers['x-tenant-id'] as string) || 'tenant_default';
    const userId = caller?.id || (req.headers['x-user-id'] as string);
    const headerRole = caller?.role || (req.headers['x-user-role'] as string);
    const { agentId } = req.params;

    const scope = await resolveCommandScope(tenantId, userId, headerRole);
    if (!scope.isOwnerOrAdmin && (!scope.isTeamLead || scope.teamCommandAccess === 'none')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // If caller is a Team Lead, verify the target agent actually reports to them
    if (!scope.isOwnerOrAdmin) {
      const check = await db.query(
        `SELECT 1 FROM users
         WHERE ("tenantId" = $1 OR "tenantId" IS NULL) AND id = $2 AND (COALESCE("reportsToUserId", reports_to_user_id) = $3 OR id = $3)`,
        [tenantId, agentId, userId]
      );
      if (check.rowCount === 0) {
        return res.status(403).json({ error: 'This agent is not assigned to your squad.' });
      }
    }

    const [leads, tasks, meetings, quotes, clientWork, activities] = await Promise.all([
      db.query(
        `SELECT l.id, l.name, l.phone, l.email, l.status, co.name AS "companyName", l."createdAt" AS "updatedAt"
         FROM leads l
         LEFT JOIN crm_companies co ON l."crmCompanyId" = co.id
         WHERE l."tenantId" = $1 AND l."assignedTo" = $2 AND l.status != 'ARCHIVED'
         ORDER BY l."createdAt" DESC LIMIT 50`,
        [tenantId, agentId]
      ),
      db.query(
        `SELECT id, title, priority, status, "dueAt", "taskType" AS "entityType"
         FROM crm_tasks
         WHERE "tenantId" = $1 AND "assignedUserId" = $2 AND "taskType" NOT IN ('meeting', 'online_meeting')
         ORDER BY CASE WHEN LOWER(status) = 'completed' THEN 1 ELSE 0 END, "dueAt" ASC NULLS LAST LIMIT 50`,
        [tenantId, agentId]
      ),
      db.query(
        `SELECT id, title, "dueAt" AS "scheduledAt", status, description AS "meetingLink"
         FROM crm_tasks
         WHERE "tenantId" = $1 AND "assignedUserId" = $2 AND "taskType" IN ('meeting', 'online_meeting')
         ORDER BY "dueAt" DESC LIMIT 30`,
        [tenantId, agentId]
      ),
      db.query(
        `SELECT id, "quoteNumber", COALESCE(notes, 'Quote #' || "quoteNumber") AS title, "totalAmount" AS amount, status, "createdAt"
         FROM crm_quotes
         WHERE "tenantId" = $1 AND ("assignedUserId" = $2 OR "createdByUserId" = $2)
         ORDER BY "createdAt" DESC LIMIT 30`,
        [tenantId, agentId]
      ),
      db.query(
        `SELECT id, title, status, "dueAt" AS "dueDate", 0 AS progress
         FROM crm_work_items
         WHERE "tenantId" = $1 AND "assignedUserId" = $2
         ORDER BY "createdAt" DESC LIMIT 30`,
        [tenantId, agentId]
      ),
      db.query(
        `SELECT id, "eventType" AS "type", description AS summary, "createdAt"
         FROM lead_activities
         WHERE "tenantId" = $1 AND "userId" = $2
         ORDER BY "createdAt" DESC LIMIT 40`,
        [tenantId, agentId]
      ),
    ]);

    return res.json({
      agentId,
      canonicalLeads: leads.rows,
      tasks: tasks.rows,
      meetings: meetings.rows,
      quotes: quotes.rows,
      clientWork: clientWork.rows,
      unifiedActivity: activities.rows,
    });
  } catch (err: any) {
    console.error('[TeamCommand] agent workspace error:', err);
    return res.status(500).json({ error: 'Failed to load agent workspace details' });
  }
});

/**
 * 3. PATCH /api/crm/team-command/delegation (Company Owner Only)
 * Lets the Owner configure Team Lead access ('none' | 'view' | 'manage') and assign Agents to Team Leads.
 */
crmCommandRouter.patch('/team-command/delegation', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller?.tenantId || (req as any).tenantId || (req.headers['x-tenant-id'] as string) || 'tenant_default';
    const userId = caller?.id || (req.headers['x-user-id'] as string);
    const headerRole = caller?.role || (req.headers['x-user-role'] as string);

    const scope = await resolveCommandScope(tenantId, userId, headerRole);
    if (!scope.isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only the Company Owner can change delegation and squad assignments.' });
    }

    const {
      targetUserId,
      reportsToUserId,
      teamCommandAccess,
      canReassignWork,
      canApproveQuotes,
    } = req.body;

    const targetReportsTo = reportsToUserId === '' ? null : reportsToUserId;

    // Update users table
    await db.query(
      `UPDATE users
       SET
         "reportsToUserId" = COALESCE($3, "reportsToUserId"),
         reports_to_user_id = COALESCE($3, reports_to_user_id),
         "teamCommandAccess" = COALESCE($4, "teamCommandAccess"),
         team_command_access = COALESCE($4, team_command_access),
         "canReassignWork" = COALESCE($5, "canReassignWork"),
         can_reassign_work = COALESCE($5, can_reassign_work),
         "canApproveQuotes" = COALESCE($6, "canApproveQuotes"),
         can_approve_quotes = COALESCE($6, can_approve_quotes),
         "updatedAt" = NOW()
       WHERE ("tenantId" = $1 OR "tenantId" IS NULL) AND id = $2`,
      [
        tenantId,
        targetUserId,
        targetReportsTo,
        teamCommandAccess,
        canReassignWork,
        canApproveQuotes,
      ]
    );

    // Also update tenant_members compatibility table
    try {
      await db.query(
        `UPDATE tenant_members
         SET
           reports_to_user_id = COALESCE($3, reports_to_user_id),
           team_command_access = COALESCE($4, team_command_access),
           can_reassign_work = COALESCE($5, can_reassign_work),
           can_approve_quotes = COALESCE($6, can_approve_quotes)
         WHERE tenant_id = $1 AND user_id = $2`,
        [
          tenantId,
          targetUserId,
          targetReportsTo,
          teamCommandAccess,
          canReassignWork,
          canApproveQuotes,
        ]
      );
    } catch {}

    // Audit logging
    await db.query(
      `INSERT INTO crm_command_audit_logs (tenant_id, actor_user_id, actor_role, target_agent_id, action_type, metadata)
       VALUES ($1, $2, $3, $4, 'UPDATE_DELEGATION', $5::jsonb)`,
      [
        tenantId,
        userId,
        scope.role,
        targetUserId,
        JSON.stringify({ reportsToUserId: targetReportsTo, teamCommandAccess, canReassignWork, canApproveQuotes }),
      ]
    );

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[TeamCommand] delegation update error:', err);
    return res.status(500).json({ error: 'Failed to update delegation settings' });
  }
});

/**
 * 4. POST /api/crm/team-command/agent/:agentId/action
 * Unified in-place execution endpoint: Dispatch Task, Schedule Meeting, Reassign Lead/Work, or Approve Quote.
 */
crmCommandRouter.post('/team-command/agent/:agentId/action', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const tenantId = caller?.tenantId || (req as any).tenantId || (req.headers['x-tenant-id'] as string) || 'tenant_default';
    const userId = caller?.id || (req.headers['x-user-id'] as string);
    const headerRole = caller?.role || (req.headers['x-user-role'] as string);
    const { agentId } = req.params;
    const { actionType, payload } = req.body;

    const scope = await resolveCommandScope(tenantId, userId, headerRole);
    if (!scope.isOwnerOrAdmin && scope.teamCommandAccess !== 'manage') {
      return res.status(403).json({ error: 'You only have view access or lack permission to execute commands.' });
    }

    // Verify squad ownership if caller is a Team Lead
    if (!scope.isOwnerOrAdmin) {
      const squadCheck = await db.query(
        `SELECT 1 FROM users WHERE ("tenantId" = $1 OR "tenantId" IS NULL) AND id = $2 AND (COALESCE("reportsToUserId", reports_to_user_id) = $3 OR id = $3)`,
        [tenantId, agentId, userId]
      );
      if (squadCheck.rowCount === 0) {
        return res.status(403).json({ error: 'Target agent is outside your assigned squad.' });
      }
    }

    const nowIso = new Date().toISOString();

    if (actionType === 'DISPATCH_TASK') {
      const { title, priority = 'high', dueAt } = payload;
      const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      await db.query(
        `INSERT INTO crm_tasks (id, "tenantId", "assignedUserId", "createdByUserId", title, priority, status, "taskType", "dueAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'open', 'task', $7, $8, $8)`,
        [taskId, tenantId, agentId, userId, title, priority, dueAt || new Date(Date.now() + 86400000).toISOString(), nowIso]
      );
    } else if (actionType === 'SCHEDULE_MEETING') {
      const { title, scheduledAt, meetingLink } = payload;
      const meetingId = 'task_mtg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      await db.query(
        `INSERT INTO crm_tasks (id, "tenantId", "assignedUserId", "createdByUserId", title, description, priority, status, "taskType", "dueAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'high', 'open', 'meeting', $7, $8, $8)`,
        [meetingId, tenantId, agentId, userId, title, meetingLink || '', scheduledAt || nowIso, nowIso]
      );
    } else if (actionType === 'REASSIGN_ENTITY') {
      if (!scope.canReassignWork) {
        return res.status(403).json({ error: 'Reassignment permission not enabled for your role.' });
      }
      const { entityType, entityId, newAgentId } = payload;
      const tableMap: Record<string, { table: string; col: string }> = {
        lead: { table: 'leads', col: '"assignedTo"' },
        company: { table: 'crm_companies', col: '"assignedUserId"' },
        contact: { table: 'crm_contacts', col: '"assignedUserId"' },
        task: { table: 'crm_tasks', col: '"assignedUserId"' },
        quote: { table: 'crm_quotes', col: '"assignedUserId"' },
        client_work: { table: 'crm_work_items', col: '"assignedUserId"' },
      };
      const target = tableMap[entityType];
      if (!target) return res.status(400).json({ error: 'Invalid entityType' });

      await db.query(
        `UPDATE ${target.table} SET ${target.col} = $3, "updatedAt" = NOW() WHERE "tenantId" = $1 AND id = $2`,
        [tenantId, entityId, newAgentId]
      );
    } else if (actionType === 'UPDATE_QUOTE_STATUS') {
      if (!scope.canApproveQuotes) {
        return res.status(403).json({ error: 'Quote approval permission not enabled for your role.' });
      }
      const { quoteId, status } = payload;
      await db.query(
        `UPDATE crm_quotes SET status = $3, "updatedAt" = NOW() WHERE "tenantId" = $1 AND id = $2`,
        [tenantId, quoteId, status]
      );
    } else if (actionType === 'UPDATE_WORK_STATUS') {
      const { workId, status } = payload;
      await db.query(
        `UPDATE crm_work_items SET status = $3, "updatedAt" = NOW() WHERE "tenantId" = $1 AND id = $2`,
        [tenantId, workId, status]
      );
    } else {
      return res.status(400).json({ error: 'Unsupported actionType' });
    }

    // Record in Audit Log
    await db.query(
      `INSERT INTO crm_command_audit_logs (tenant_id, actor_user_id, actor_role, target_agent_id, action_type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [tenantId, userId, scope.role, agentId, actionType, JSON.stringify(payload || {})]
    );

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[TeamCommand] action execution error:', err);
    return res.status(500).json({ error: 'Failed to execute command action' });
  }
});
