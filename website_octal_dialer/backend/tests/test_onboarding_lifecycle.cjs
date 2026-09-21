const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function run() {
  console.log('=== ZESTIFY ONBOARDING & ACCOUNT LIFECYCLE AUDIT ===\n');

  // 1. Public Signup (Email + Password)
  console.log('1. Testing Public Customer Signup (No company name on first auth)...');
  const ownerEmail = `zestify_owner_${Date.now()}@zestifycrm.local`;
  const regRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/auth/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    fullName: 'Zestify Owner',
    email: ownerEmail,
    password: 'OwnerPassword1234!'
  });

  if (regRes.status !== 200 || !regRes.body.token) {
    throw new Error(`Public signup failed: ${JSON.stringify(regRes.body)}`);
  }
  console.log('   ✓ Signup successful');
  console.log(`   ✓ Token returned, needsOnboarding: ${regRes.body.needsOnboarding}`);
  console.log(`   ✓ User role: ${regRes.body.user.role}, tenantId: ${regRes.body.user.tenantId || 'NULL'}`);
  const initialOwnerToken = regRes.body.token;
  const ownerUserId = regRes.body.user.id;

  // 2. Complete Customer Onboarding Wizard
  console.log('\n2. Testing Customer Onboarding Wizard Completion...');
  const obRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/onboarding/complete',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${initialOwnerToken}`
    }
  }, {
    workspaceType: 'COMPANY',
    companyName: 'Zestify CRM Test Company',
    fullName: 'Zestify Owner',
    country: 'US',
    timezone: 'America/New_York',
    teamSize: '6-15',
    industry: 'Technology',
    planId: 'plan_starter' // 5 seats
  });

  if (obRes.status !== 200 || !obRes.body.tenant) {
    throw new Error(`Onboarding completion failed: ${JSON.stringify(obRes.body)}`);
  }
  const tenant = obRes.body.tenant;
  const ownerToken = obRes.body.token;
  console.log(`   ✓ Workspace created: "${tenant.name}" (ID: ${tenant.id})`);
  console.log(`   ✓ Customer type: ${tenant.customerType}, Max agents: ${tenant.maxAgents}`);
  console.log(`   ✓ User elevated to: ${obRes.body.user.role} (Company Owner)`);

  // 3. Seat Capacity & Owner Protection
  console.log('\n3. Testing Seat Capacity & Owner Protection...');
  const seatRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/invitations',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  console.log('   ✓ Initial Seat Usage:', seatRes.body.seatUsage);
  if (seatRes.body.seatUsage.maxSeats !== 5 || seatRes.body.seatUsage.activeSeats !== 1) {
    throw new Error(`Seat usage unexpected: ${JSON.stringify(seatRes.body.seatUsage)}`);
  }

  // Owner Protection: Try deleting sole Company Owner
  const delOwnerRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/admin/users/${ownerUserId}`,
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  console.log(`   ✓ Owner deletion rejected with status ${delOwnerRes.status}: "${delOwnerRes.body.error}"`);
  if (delOwnerRes.status !== 400) {
    throw new Error(`Expected 400 deleting final owner, got ${delOwnerRes.status}`);
  }

  // 4. Create Team A
  console.log('\n4. Creating Team A in Workspace...');
  const teamRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/teams',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    }
  }, {
    name: 'Team A',
    description: 'Outbound CRM Sales Squad'
  });
  const teamA = teamRes.body.team || teamRes.body;
  if ((teamRes.status !== 200 && teamRes.status !== 201) || !teamA?.id) {
    throw new Error(`Failed to create team (Status ${teamRes.status}): ${JSON.stringify(teamRes.body)}`);
  }
  console.log(`   ✓ Team created: "${teamA.name}" (ID: ${teamA.id})`);

  // 5. Invitations for Team Lead and Member
  console.log('\n5. Generating Invitations for Team Lead & Member...');
  const leadEmail = `zestify_lead_${Date.now()}@zestifycrm.local`;
  const memberEmail = `zestify_member_${Date.now()}@zestifycrm.local`;

  const invLeadRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/invitations',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    }
  }, {
    email: leadEmail,
    role: 'team_lead',
    teamId: teamA.id,
    initialModules: ['crm', 'octalDialer', 'campaigns', 'leads', 'reports']
  });
  if ((invLeadRes.status !== 200 && invLeadRes.status !== 201) || !invLeadRes.body.token) {
    throw new Error(`Failed to invite team lead: ${JSON.stringify(invLeadRes.body)}`);
  }
  const leadInviteToken = invLeadRes.body.token;
  console.log(`   ✓ Team Lead invitation created for ${leadEmail}`);

  const invMemRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/invitations',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    }
  }, {
    email: memberEmail,
    role: 'user',
    teamId: teamA.id,
    initialModules: ['crm', 'octalDialer', 'campaigns', 'leads', 'reports']
  });
  if ((invMemRes.status !== 200 && invMemRes.status !== 201) || !invMemRes.body.token) {
    throw new Error(`Failed to invite member: ${JSON.stringify(invMemRes.body)}`);
  }
  const memberInviteToken = invMemRes.body.token;
  console.log(`   ✓ Member invitation created for ${memberEmail}`);

  // Test Seat Cap: Active 1 + Pending 2 = 3 / 5 used. Invite 2 more to hit 5/5
  console.log('   Testing seat limit enforcement...');
  const inv3 = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/invitations',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` }
  }, { email: `seat3_${Date.now()}@test.local`, role: 'user' });
  const inv4 = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/invitations',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` }
  }, { email: `seat4_${Date.now()}@test.local`, role: 'user' });

  // 6th invite should fail
  const inv5 = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/admin/invitations',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` }
  }, { email: `seat5_${Date.now()}@test.local`, role: 'user' });
  console.log(`   ✓ Over-capacity invitation rejected with status ${inv5.status}: "${inv5.body.error}"`);
  if (inv5.status !== 400) {
    throw new Error(`Expected 400 for over-capacity seat invitation, got ${inv5.status}`);
  }

  // Revoke dummy invites
  await request({ hostname: '127.0.0.1', port: 5000, path: `/api/admin/invitations/${inv3.body.invitation.id}`, method: 'DELETE', headers: { 'Authorization': `Bearer ${ownerToken}` } });
  await request({ hostname: '127.0.0.1', port: 5000, path: `/api/admin/invitations/${inv4.body.invitation.id}`, method: 'DELETE', headers: { 'Authorization': `Bearer ${ownerToken}` } });
  console.log('   ✓ Dummy seat tests cleaned up.');

  // 6. Accept Team Lead Invitation
  console.log('\n6. Joining as Team Lead...');
  const leadReg = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/auth/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    fullName: 'Zestify Lead',
    email: leadEmail,
    password: 'LeadPassword1234!'
  });
  console.log(`   ✓ Lead registered identity (pending invitation recognized: ${!!leadReg.body.pendingInvitation})`);

  const leadAccept = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/invitations/accept',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${leadReg.body.token}`
    }
  }, { token: leadInviteToken });

  if (leadAccept.status !== 200 || leadAccept.body.user.role !== 'team_lead') {
    throw new Error(`Lead acceptance failed: ${JSON.stringify(leadAccept.body)}`);
  }
  const leadToken = leadAccept.body.token;
  console.log(`   ✓ Lead joined workspace as: ${leadAccept.body.user.role}`);

  // 7. Accept Member Invitation
  console.log('\n7. Joining as Team Member...');
  const memReg = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/auth/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    fullName: 'Zestify Member',
    email: memberEmail,
    password: 'MemberPassword1234!'
  });

  const memAccept = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/invitations/accept',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${memReg.body.token}`
    }
  }, { token: memberInviteToken });

  if (memAccept.status !== 200 || memAccept.body.user.role !== 'user') {
    throw new Error(`Member acceptance failed: ${JSON.stringify(memAccept.body)}`);
  }
  const memberToken = memAccept.body.token;
  console.log(`   ✓ Member joined workspace as: ${memAccept.body.user.role}`);

  // 8. CRM Scoping Validation
  console.log('\n8. Testing CRM Multi-Tier Scoping (Owner vs Team Lead vs Member)...');
  // Create a contact as Owner
  const contactRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/crm/contacts',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ownerToken}`
    }
  }, {
    name: 'Acme Prospect Alpha',
    email: 'alpha@acme.test',
    phone: '+1-555-0199',
    roleTitle: 'VP Technology',
    assignedUserId: memAccept.body.user.id
  });
  if ((contactRes.status !== 200 && contactRes.status !== 201) || !contactRes.body?.contact?.id) {
    throw new Error(`Failed to create CRM contact: ${JSON.stringify(contactRes.body)}`);
  }
  console.log(`   ✓ Created test contact: ${contactRes.body.contact.name} (ID: ${contactRes.body.contact.id})`);

  // Fetch as Owner
  const ownerCrm = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/crm/contacts',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  console.log(`   ✓ Owner sees ${ownerCrm.body.contacts?.length || 0} CRM contacts (Tenant Scope)`);
  if (!ownerCrm.body.contacts || ownerCrm.body.contacts.length !== 1) {
    throw new Error(`Owner should see 1 contact, saw: ${ownerCrm.body.contacts?.length}`);
  }

  // Fetch as Team Lead
  const leadCrm = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/crm/contacts',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${leadToken}` }
  });
  console.log(`   ✓ Team Lead sees ${leadCrm.body.contacts?.length || 0} CRM contacts (Team A Scope)`);
  if (!leadCrm.body.contacts || leadCrm.body.contacts.length !== 1) {
    throw new Error(`Team Lead should see 1 contact in Team A, saw: ${leadCrm.body.contacts?.length}`);
  }

  // Fetch as Member
  const memCrm = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/crm/contacts',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${memberToken}` }
  });
  console.log(`   ✓ Member sees ${memCrm.body.contacts?.length || 0} CRM contacts (Assigned Contact Scope)`);
  if (!memCrm.body.contacts || memCrm.body.contacts.length !== 1) {
    throw new Error(`Member should see 1 assigned contact, saw: ${memCrm.body.contacts?.length}`);
  }

  console.log('\n=== ALL LIFECYCLE & ONBOARDING AUDITS PASSED WITH ZERO ERRORS ===');
}

run().catch(err => {
  console.error('\n❌ AUDIT FAILED:', err);
  process.exit(1);
});
