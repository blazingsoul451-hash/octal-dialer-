/**
 * Automated Verification Suite for Teams & Scoping Hierarchy:
 * Company/Tenant -> Users -> Roles -> Permissions -> Teams / scoping -> Campaigns -> Leads -> Calls
 */

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '.env') });

import { initializeSchema } from './src/db/pool';
import {
  db,
  createTeam,
  getTeams,
  getTeamById,
  updateTeam,
  deleteTeam,
  getTeamMembers,
  setTeamMembers,
  getTeamCampaigns,
  setTeamCampaigns,
  getUserTeamIds,
  getUserScopedCampaignIds
} from './src/databaseManager';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, title: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${title}`);
  } else {
    console.error(`  ❌ FAIL: ${title}`);
    if (details) console.error(`     Details: ${details}`);
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('TEAMS & SCOPING HIERARCHY COMPREHENSIVE VERIFICATION SUITE');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  // Initialize schema if using fallback/in-memory provider
  await initializeSchema();

  const now = new Date().toISOString();
  const testTenantA = 'tenant_test_alpha_' + Date.now();
  const testTenantB = 'tenant_test_beta_' + Date.now();

  try {
    // 0. Ensure schema / tables exist
    console.log('\n1. Verifying Database Schema & Table Structure:');
    const tables = await db.queryAll<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('teams', 'team_members', 'campaign_teams')
    `);
    const foundTables = tables.map(t => t.table_name);
    assert(foundTables.includes('teams'), 'Table "teams" exists in PostgreSQL');
    assert(foundTables.includes('team_members'), 'Table "team_members" exists in PostgreSQL');
    assert(foundTables.includes('campaign_teams'), 'Table "campaign_teams" exists in PostgreSQL');

    // 1. Setup Test Fixtures: Tenants, Users, Campaigns
    console.log('\n2. Setting up Test Fixtures (Tenants, Users, Campaigns):');
    await db.execute(
      `INSERT INTO tenants (id, name, slug, "createdAt", "updatedAt") VALUES ($1, 'Alpha Corp', $2, $3, $4)`,
      [testTenantA, 'alpha-corp-' + Date.now(), now, now]
    );
    await db.execute(
      `INSERT INTO tenants (id, name, slug, "createdAt", "updatedAt") VALUES ($1, 'Beta Corp', $2, $3, $4)`,
      [testTenantB, 'beta-corp-' + Date.now(), now, now]
    );

    const userLeaderA = 'u_lead_a_' + Date.now();
    const userAgentA1 = 'u_agent_a1_' + Date.now();
    const userAgentA2 = 'u_agent_a2_' + Date.now();
    const userAgentB = 'u_agent_b_' + Date.now();

    await db.execute(
      `INSERT INTO users (id, username, email, "displayName", role, "tenantId", "passwordHash", "createdAt")
       VALUES ($1, 'lead_a', 'lead@alpha.com', 'Lead Alpha', 'admin', $2, 'hash', $3)`,
      [userLeaderA, testTenantA, now]
    );
    await db.execute(
      `INSERT INTO users (id, username, email, "displayName", role, "tenantId", "passwordHash", "createdAt")
       VALUES ($1, 'agent_a1', 'agent1@alpha.com', 'Agent Alpha 1', 'agent', $2, 'hash', $3)`,
      [userAgentA1, testTenantA, now]
    );
    await db.execute(
      `INSERT INTO users (id, username, email, "displayName", role, "tenantId", "passwordHash", "createdAt")
       VALUES ($1, 'agent_a2', 'agent2@alpha.com', 'Agent Alpha 2', 'agent', $2, 'hash', $3)`,
      [userAgentA2, testTenantA, now]
    );
    await db.execute(
      `INSERT INTO users (id, username, email, "displayName", role, "tenantId", "passwordHash", "createdAt")
       VALUES ($1, 'agent_b', 'agent@beta.com', 'Agent Beta', 'agent', $2, 'hash', $3)`,
      [userAgentB, testTenantB, now]
    );

    const campAlpha1 = 'c_alpha_1_' + Date.now();
    const campAlpha2 = 'c_alpha_2_' + Date.now();
    const campBeta1 = 'c_beta_1_' + Date.now();

    await db.execute(
      `INSERT INTO campaigns (id, name, "fileName", "leadCount", status, "createdAt", "tenantId")
       VALUES ($1, 'Alpha Outbound Campaign 1', 'leads1.csv', 10, 'ACTIVE', $2, $3)`,
      [campAlpha1, now, testTenantA]
    );
    await db.execute(
      `INSERT INTO campaigns (id, name, "fileName", "leadCount", status, "createdAt", "tenantId")
       VALUES ($1, 'Alpha Inbound Campaign 2', 'leads2.csv', 5, 'ACTIVE', $2, $3)`,
      [campAlpha2, now, testTenantA]
    );
    await db.execute(
      `INSERT INTO campaigns (id, name, "fileName", "leadCount", status, "createdAt", "tenantId")
       VALUES ($1, 'Beta Dedicated Campaign', 'leads_beta.csv', 20, 'ACTIVE', $2, $3)`,
      [campBeta1, now, testTenantB]
    );
    assert(true, 'Test fixtures created cleanly');

    // 2. Test Team Creation & Tenant Isolation
    console.log('\n3. Testing Team Creation & Strict Tenant Isolation:');
    const teamAlpha = await createTeam({
      name: 'Alpha Strike Squad',
      description: 'Primary outbound sales team',
      leaderId: userLeaderA,
      tenantId: testTenantA,
      status: 'active'
    });
    assert(!!teamAlpha.id && teamAlpha.name === 'Alpha Strike Squad', 'Team Alpha created successfully');

    const teamBeta = await createTeam({
      name: 'Beta Defensive Unit',
      description: 'Beta support team',
      tenantId: testTenantB,
      status: 'active'
    });
    assert(!!teamBeta.id && teamBeta.name === 'Beta Defensive Unit', 'Team Beta created successfully');

    const teamsA = await getTeams(testTenantA);
    assert(teamsA.some(t => t.id === teamAlpha.id), 'Tenant A sees Team Alpha');
    assert(!teamsA.some(t => t.id === teamBeta.id), 'Tenant A CANNOT see Team Beta (Tenant Isolation PASS)');

    const teamsB = await getTeams(testTenantB);
    assert(teamsB.some(t => t.id === teamBeta.id), 'Tenant B sees Team Beta');
    assert(!teamsB.some(t => t.id === teamAlpha.id), 'Tenant B CANNOT see Team Alpha (Tenant Isolation PASS)');

    const crossTenantGet = await getTeamById(teamBeta.id, testTenantA);
    assert(crossTenantGet === null, 'Tenant A cannot fetch Team Beta by ID');

    const crossTenantUpdate = await updateTeam(teamBeta.id, testTenantA, { name: 'Hacked Beta' });
    assert(crossTenantUpdate === false, 'Tenant A cannot update Team Beta');

    const crossTenantDelete = await deleteTeam(teamBeta.id, testTenantA);
    assert(crossTenantDelete === false, 'Tenant A cannot delete Team Beta');

    // 3. Test Team Member Assignments
    console.log('\n4. Testing Team Member & Leadership Associations:');
    await setTeamMembers(teamAlpha.id, testTenantA, [userAgentA1], userLeaderA);
    const membersAlpha = await getTeamMembers(teamAlpha.id, testTenantA);

    assert(membersAlpha.length === 2, 'Team Alpha has exactly 2 members (Leader + Agent 1)');
    const leaderMem = membersAlpha.find(m => m.userId === userLeaderA);
    const agent1Mem = membersAlpha.find(m => m.userId === userAgentA1);
    assert(leaderMem?.roleInTeam === 'leader', 'Team leader has roleInTeam = "leader"');
    assert(agent1Mem?.roleInTeam === 'member', 'Team member has roleInTeam = "member"');

    const userATeams = await getUserTeamIds(userAgentA1, testTenantA);
    assert(userATeams.includes(teamAlpha.id), 'Agent 1 is recognized as part of Team Alpha');

    const userA2Teams = await getUserTeamIds(userAgentA2, testTenantA);
    assert(userA2Teams.length === 0, 'Agent 2 has no teams assigned');

    // 4. Test Campaign Scoping
    console.log('\n5. Testing Campaign Binding & Scoping Resolution:');
    await setTeamCampaigns(teamAlpha.id, testTenantA, [campAlpha1]);
    const alphaTeamCamps = await getTeamCampaigns(teamAlpha.id, testTenantA);
    assert(alphaTeamCamps.length === 1 && alphaTeamCamps[0].id === campAlpha1, 'Campaign Alpha 1 bound to Team Alpha');

    // Check scoped campaigns for Agent 1 (in Team Alpha)
    const agent1Scoped = await getUserScopedCampaignIds(userAgentA1, testTenantA);
    assert(
      agent1Scoped.length === 1 && agent1Scoped[0] === campAlpha1,
      'Agent 1 (Team Alpha member) sees scoped Campaign Alpha 1'
    );
    assert(!agent1Scoped.includes(campAlpha2), 'Agent 1 does NOT see unassigned Campaign Alpha 2');
    assert(!agent1Scoped.includes(campBeta1), 'Agent 1 does NOT see Tenant B Campaign Beta 1');

    // Check scoped campaigns for Agent 2 (not in any team)
    const agent2Scoped = await getUserScopedCampaignIds(userAgentA2, testTenantA);
    assert(agent2Scoped.length === 0, 'Agent 2 (not in any team) has 0 scoped campaigns');

    // 5. Test Cascade Clean-up on Team Deletion
    console.log('\n6. Testing Cascade Clean-up on Team Deletion:');
    const deleteOk = await deleteTeam(teamAlpha.id, testTenantA);
    assert(deleteOk === true, 'Team Alpha deleted successfully');

    const remainingMembers = await db.queryAll(
      `SELECT * FROM team_members WHERE "teamId" = $1`,
      [teamAlpha.id]
    );
    assert(remainingMembers.length === 0, 'All team_members for Team Alpha were cleaned up');

    const remainingCampaignTeams = await db.queryAll(
      `SELECT * FROM campaign_teams WHERE "teamId" = $1`,
      [teamAlpha.id]
    );
    assert(remainingCampaignTeams.length === 0, 'All campaign_teams mappings for Team Alpha were cleaned up');

    const userStillExists = await db.queryOne(`SELECT id FROM users WHERE id = $1`, [userAgentA1]);
    assert(userStillExists !== null, 'Underlying user was NOT affected by team deletion');

    const campaignStillExists = await db.queryOne(`SELECT id FROM campaigns WHERE id = $1`, [campAlpha1]);
    assert(campaignStillExists !== null, 'Underlying campaign was NOT affected by team deletion');

  } catch (err: any) {
    console.error('Unhandled test exception:', err);
    assert(false, 'Test execution completed without uncaught exceptions', err.message);
  } finally {
    // Clean up test data
    console.log('\n7. Cleaning up test fixtures...');
    try {
      await db.execute(`DELETE FROM campaign_teams WHERE "tenantId" IN ($1, $2)`, [testTenantA, testTenantB]);
      await db.execute(`DELETE FROM team_members WHERE "tenantId" IN ($1, $2)`, [testTenantA, testTenantB]);
      await db.execute(`DELETE FROM teams WHERE "tenantId" IN ($1, $2)`, [testTenantA, testTenantB]);
      await db.execute(`DELETE FROM campaigns WHERE "tenantId" IN ($1, $2)`, [testTenantA, testTenantB]);
      await db.execute(`DELETE FROM users WHERE "tenantId" IN ($1, $2)`, [testTenantA, testTenantB]);
      await db.execute(`DELETE FROM tenants WHERE id IN ($1, $2)`, [testTenantA, testTenantB]);
      console.log('  ✅ Fixtures cleaned up.');
    } catch (e: any) {
      console.error('  ⚠️ Cleanup warning:', e.message);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
