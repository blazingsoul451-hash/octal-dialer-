const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = 'C:\\Users\\ice\\Desktop\\crm_screenshots';
const ZIP_PATH = 'C:\\Users\\ice\\Desktop\\crm zip file.zip';
const BACKEND_URL = 'http://localhost:5000';
const FRONTEND_URL = 'http://localhost:5173';

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function seedCrmData(token) {
  console.log('[Seed] Seeding rich CRM sample data...');
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 1. Create Companies
  const companiesData = [
    {
      name: 'Vanguard Global Logistics',
      industry: 'Freight & Supply Chain',
      country: 'United Kingdom',
      phone: '+44 20 7946 0912',
      email: 'operations@vanguardgl.co.uk',
      website: 'https://vanguardgl.co.uk',
      address: '14 St Katharine Docks, London E1W 1LA',
      status: 'active',
      paymentStatus: 'paid',
      initialContact: {
        name: 'Julian Montgomery',
        roleTitle: 'Chief Logistics Officer',
        email: 'j.montgomery@vanguardgl.co.uk',
        phone: '+44 7911 234567'
      },
      initialNote: 'Key enterprise account; multi-depot automated dialer dispatch roll-out.'
    },
    {
      name: 'Apex Horizon Capital',
      industry: 'Financial Advisory & Wealth',
      country: 'United Kingdom',
      phone: '+44 20 7946 0855',
      email: 'inquiries@apexhorizon.com',
      website: 'https://apexhorizon.com',
      address: '25 Bank Street, Canary Wharf, London',
      status: 'active',
      paymentStatus: 'pending',
      initialContact: {
        name: 'Victoria Hastings',
        roleTitle: 'Head of Business Development',
        email: 'victoria@apexhorizon.com',
        phone: '+44 7911 345678'
      },
      initialNote: 'High net worth client advisory pipeline; daily cold call outreach.'
    },
    {
      name: 'Beacon Health Systems',
      industry: 'Healthcare Technology',
      country: 'United States',
      phone: '+1 212 555 0199',
      email: 'contact@beaconhealth.io',
      website: 'https://beaconhealth.io',
      address: '450 Lexington Ave, New York, NY',
      status: 'active',
      paymentStatus: 'due_soon',
      initialContact: {
        name: 'Dr. Marcus Sterling',
        roleTitle: 'VP Clinical Partnerships',
        email: 'msterling@beaconhealth.io',
        phone: '+1 917 555 0144'
      },
      initialNote: 'Hospital network telehealth outreach pilot.'
    },
    {
      name: 'Cobalt Media Group',
      industry: 'Digital Marketing & PR',
      country: 'Australia',
      phone: '+61 2 9876 5432',
      email: 'partners@cobaltmedia.com.au',
      website: 'https://cobaltmedia.com.au',
      address: '88 George St, The Rocks, Sydney NSW',
      status: 'inactive',
      paymentStatus: 'overdue',
      initialContact: {
        name: 'Liam Gallagher',
        roleTitle: 'Marketing Director',
        email: 'liam@cobaltmedia.com.au',
        phone: '+61 412 345 678'
      },
      initialNote: 'Contract paused pending Q4 marketing budget sign-off.'
    }
  ];

  const createdCompanies = [];
  for (const c of companiesData) {
    const res = await fetch(`${BACKEND_URL}/api/crm/companies`, {
      method: 'POST',
      headers,
      body: JSON.stringify(c)
    });
    if (res.ok) {
      const data = await res.json();
      createdCompanies.push(data.company);
    }
  }

  // 2. Create Extra Contacts
  if (createdCompanies[0]) {
    await fetch(`${BACKEND_URL}/api/crm/contacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        crmCompanyId: createdCompanies[0].id,
        name: 'Sarah Jenkins',
        roleTitle: 'Senior Fleet Dispatcher',
        email: 'sjenkins@vanguardgl.co.uk',
        phone: '+44 7911 987654',
        notes: 'Prefers morning call updates; oversees UK central warehouse.'
      })
    });
  }

  if (createdCompanies[1]) {
    await fetch(`${BACKEND_URL}/api/crm/contacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        crmCompanyId: createdCompanies[1].id,
        name: 'Oliver Thorne',
        roleTitle: 'Managing Partner',
        email: 'oliver@apexhorizon.com',
        phone: '+44 7911 555777',
        notes: 'Final signer on commercial agreements.'
      })
    });
  }

  // 3. Create Canonical Leads
  const leadsData = [
    {
      name: 'Vanguard Midlands Fleet',
      phone: '+44 121 496 0123',
      email: 'midlands@vanguardgl.co.uk',
      country: 'United Kingdom',
      requirement: 'Fleet telemetry integration & driver dispatch auto-dialer',
      crmCompanyId: createdCompanies[0]?.id
    },
    {
      name: 'Apex Wealth Client Desk',
      phone: '+44 20 7946 0777',
      email: 'clientdesk@apexhorizon.com',
      country: 'United Kingdom',
      requirement: 'Private wealth portfolio discovery callback',
      crmCompanyId: createdCompanies[1]?.id
    },
    {
      name: 'Solas Solar Energy Ltd',
      phone: '+44 141 496 0888',
      email: 'info@solassolar.co.uk',
      country: 'United Kingdom',
      requirement: 'Commercial solar panel installation cold inbound lead'
    }
  ];

  const createdLeads = [];
  for (const l of leadsData) {
    const res = await fetch(`${BACKEND_URL}/api/crm/leads`, {
      method: 'POST',
      headers,
      body: JSON.stringify(l)
    });
    if (res.ok) {
      const data = await res.json();
      createdLeads.push(data.lead);
    }
  }

  // 4. Create Tasks (variety of types & statuses)
  const now = Date.now();
  const tasksData = [
    {
      title: 'Q3 Enterprise Scope Review Call',
      description: 'Discuss multi-depot deployment timeline and VoIP trunk allocations.',
      taskType: 'meeting',
      priority: 'urgent',
      dueAt: new Date(now + 3600000 * 2).toISOString(), // 2 hours from now (due today)
      crmCompanyId: createdCompanies[0]?.id,
      leadId: createdLeads[0]?.id
    },
    {
      title: 'Send Revised Commercial Proposal',
      description: 'Update pricing table with volume tiers (5,000+ min outbound rate).',
      taskType: 'email',
      priority: 'high',
      dueAt: new Date(now + 86400000).toISOString(),
      crmCompanyId: createdCompanies[1]?.id
    },
    {
      title: 'Payment Reconciliation Follow-up',
      description: 'Verify receipt of August retainer invoice #INV-4921.',
      taskType: 'payment',
      priority: 'high',
      dueAt: new Date(now - 86400000).toISOString(), // Overdue
      crmCompanyId: createdCompanies[3]?.id
    },
    {
      title: 'Clinical Workflow Demonstration',
      description: 'Demonstrate browser softphone integration with hospital registry.',
      taskType: 'meeting',
      priority: 'normal',
      dueAt: new Date(now + 86400000 * 3).toISOString(),
      crmCompanyId: createdCompanies[2]?.id
    },
    {
      title: 'WhatsApp Check-in on Hardware Dispatch',
      description: 'Confirm mobile device pairing with field agent tablets.',
      taskType: 'whatsapp',
      priority: 'low',
      dueAt: new Date(now + 86400000 * 4).toISOString(),
      crmCompanyId: createdCompanies[0]?.id
    }
  ];

  for (const t of tasksData) {
    await fetch(`${BACKEND_URL}/api/crm/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify(t)
    });
  }

  console.log('[Seed] Data seeded successfully.');
}

async function run() {
  console.log('--- Step 1: Logging in as Company Owner ---');
  const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'OwnerPassword1234!' })
  });
  const loginData = await loginRes.json();
  if (!loginData.token) {
    throw new Error('Login failed: ' + JSON.stringify(loginData));
  }
  const token = loginData.token;
  console.log('Logged in successfully. Token acquired.');

  await seedCrmData(token);

  console.log('--- Step 2: Launching Chrome with Puppeteer ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1.5
    },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();

  // Inject token into localStorage before page scripts execute
  await page.goto(`${FRONTEND_URL}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((jwtToken, userObj) => {
    localStorage.setItem('octal_auth_token', jwtToken);
    localStorage.setItem('octal_auth_user', userObj.username);
    localStorage.setItem('octal_theme', 'dark');
  }, token, loginData.user);

  console.log('Navigating to CRM Workspace...');
  await page.goto(`${FRONTEND_URL}`, { waitUntil: 'networkidle2' });
  await sleep(2000);

  // Helper to click tab on main navbar if not on CRM
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    const crmBtn = buttons.find(b => b.textContent && b.textContent.includes('CRM'));
    if (crmBtn) crmBtn.click();
  });
  await sleep(1500);

  // Function to take screenshot
  async function snap(filename, desc) {
    const fullPath = path.join(OUTPUT_DIR, filename);
    await page.screenshot({ path: fullPath });
    console.log(`📸 [${filename}] ${desc}`);
  }

  // 1. CRM Overview Tab
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const ov = tabs.find(b => b.textContent && b.textContent.includes('CRM Overview'));
    if (ov) ov.click();
  });
  await sleep(1000);
  await snap('01_crm_overview_tab.png', 'CRM Workspace Overview with KPIs, Date Range presets, Priority Tasks & Activity Stream');

  // 2. Click 7 Days Date Range
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b7d = btns.find(b => b.textContent && b.textContent.trim() === '7 Days');
    if (b7d) b7d.click();
  });
  await sleep(800);
  await snap('02_crm_overview_date_range_7d.png', 'CRM Overview with 7-Day filter applied');

  // 3. Companies Tab
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const compTab = tabs.find(b => b.textContent && b.textContent.includes('Companies'));
    if (compTab) compTab.click();
  });
  await sleep(1000);
  await snap('03_crm_companies_table.png', 'Client Companies table with Status & Payment filters, contacts/tasks counts');

  // 4. Open Company Profile Drawer (First Company)
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    if (rows[0]) rows[0].click();
  });
  await sleep(1200);
  await snap('04_company_drawer_overview.png', 'Company Profile Drawer - Overview Card & Account Information');

  // 5. Company Drawer - Contacts Tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const contTab = btns.find(b => b.textContent && b.textContent.includes('Contacts ('));
    if (contTab) contTab.click();
  });
  await sleep(800);
  await snap('05_company_drawer_contacts.png', 'Company Profile Drawer - Contacts & Decision Makers');

  // 6. Company Drawer - Leads Tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const leadsTab = btns.find(b => b.textContent && b.textContent.includes('Leads ('));
    if (leadsTab) leadsTab.click();
  });
  await sleep(800);
  await snap('06_company_drawer_leads.png', 'Company Profile Drawer - Linked Canonical Leads & Dial buttons');

  // 7. Company Drawer - Tasks Tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const tasksTab = btns.find(b => b.textContent && b.textContent.includes('Tasks ('));
    if (tasksTab) tasksTab.click();
  });
  await sleep(800);
  await snap('07_company_drawer_tasks.png', 'Company Profile Drawer - Tasks & Meetings with Close/Reschedule buttons');

  // 8. Company Drawer - Activity/Notes Tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const actTab = btns.find(b => b.textContent && b.textContent.includes('Activity ('));
    if (actTab) actTab.click();
  });
  await sleep(800);
  await snap('08_company_drawer_activity_notes.png', 'Company Profile Drawer - Unified Notes Timeline & Category Selector');

  // Close Company Drawer
  await page.keyboard.press('Escape');
  await sleep(600);

  // 9. Contacts Tab
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const contTab = tabs.find(b => b.textContent && b.textContent.trim().startsWith('Contacts'));
    if (contTab) contTab.click();
  });
  await sleep(1000);
  await snap('09_crm_contacts_table.png', 'All Contacts table with direct Dial action and company links');

  // 10. Canonical Leads Tab
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const leadsTab = tabs.find(b => b.textContent && b.textContent.includes('Canonical Leads'));
    if (leadsTab) leadsTab.click();
  });
  await sleep(1000);
  await snap('10_crm_canonical_leads_table.png', 'Canonical Leads table with status badges, campaigns, and dial buttons');

  // 11. Open Lead Profile Drawer
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    if (rows[0]) rows[0].click();
  });
  await sleep(1200);
  await snap('11_lead_profile_drawer.png', 'Lead Profile Drawer with linked Company banner, tasks list, and activity trail');

  // Close Lead Drawer
  await page.keyboard.press('Escape');
  await sleep(600);

  // 12. Tasks & Meetings Tab
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const tasksTab = tabs.find(b => b.textContent && b.textContent.includes('Tasks & Meetings'));
    if (tasksTab) tasksTab.click();
  });
  await sleep(1000);
  await snap('12_crm_tasks_and_meetings_table.png', 'Tasks & Meetings table with action badges, priorities, and lifecycle buttons');

  // 13. Open Close Task Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const closeBtn = btns.find(b => b.textContent && b.textContent.trim() === 'Close');
    if (closeBtn) closeBtn.click();
  });
  await sleep(800);
  // Check the chained follow-up box to show both parts
  await page.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"]');
    if (cb && !cb.checked) cb.click();
  });
  await sleep(500);
  await snap('13_close_task_modal.png', 'Close Task Modal (reference 08_close_meeting_modal) with remarks & chained follow-up');

  // Close modal
  await page.keyboard.press('Escape');
  await sleep(600);

  // 14. Open Reschedule Task Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const reschedBtn = btns.find(b => b.textContent && b.textContent.trim() === 'Reschedule');
    if (reschedBtn) reschedBtn.click();
  });
  await sleep(800);
  await snap('14_reschedule_task_modal.png', 'Reschedule Task Modal (reference 09_reschedule_meeting_modal) with date/type/remarks');

  // Close modal
  await page.keyboard.press('Escape');
  await sleep(600);

  // 15. Open Cancel Task Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const cancelBtn = btns.find(b => b.getAttribute('title') === 'Cancel Task');
    if (cancelBtn) cancelBtn.click();
  });
  await sleep(800);
  await snap('15_cancel_task_modal.png', 'Cancel Task Modal (reference 10_cancel_meeting_modal) with mandatory reason');

  // Close modal
  await page.keyboard.press('Escape');
  await sleep(600);

  // 16. Open Add Company Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const addCompBtn = btns.find(b => b.textContent && b.textContent.includes('+ Company'));
    if (addCompBtn) addCompBtn.click();
  });
  await sleep(800);
  // Toggle primary contact in Add Company modal
  await page.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"]');
    if (cb && !cb.checked) cb.click();
  });
  await sleep(400);
  await snap('16_add_company_modal.png', 'Add Company Modal (reference 04_add_client_company_modal) with contact person fields');

  // Close modal
  await page.keyboard.press('Escape');
  await sleep(600);

  // 17. Open Add Contact Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const addContBtn = btns.find(b => b.textContent && b.textContent.includes('+ Contact'));
    if (addContBtn) addContBtn.click();
  });
  await sleep(800);
  await snap('17_add_contact_modal.png', 'Add Contact Person Modal (reference 05_add_contact_modal)');

  // Close modal
  await page.keyboard.press('Escape');
  await sleep(600);

  // 18. Open Add Lead Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const addLeadBtn = btns.find(b => b.textContent && b.textContent.includes('+ Lead'));
    if (addLeadBtn) addLeadBtn.click();
  });
  await sleep(800);
  await snap('18_add_canonical_lead_modal.png', 'Add Canonical Lead Modal (reference 02_add_lead_modal)');

  // Close modal
  await page.keyboard.press('Escape');
  await sleep(600);

  // 19. Open Create Task Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const addTaskBtn = btns.find(b => b.textContent && b.textContent.includes('+ Task'));
    if (addTaskBtn) addTaskBtn.click();
  });
  await sleep(800);
  await snap('19_create_task_modal.png', 'Create Task / Action Modal with priority, action type, and entity linking');

  // Close modal
  await page.keyboard.press('Escape');
  await sleep(600);

  // 20. Unified Activity Tab
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const actTab = tabs.find(b => b.textContent && b.textContent.includes('Unified Activity'));
    if (actTab) actTab.click();
  });
  await sleep(1000);
  await snap('20_crm_unified_activity_stream.png', 'Unified Cross-Entity Activity stream with category tags and operator audit');

  await browser.close();
  console.log('All 20 screenshots captured successfully.');

  // Step 3: Create ZIP file
  console.log('--- Step 3: Packaging screenshots into ZIP file ---');
  if (fs.existsSync(ZIP_PATH)) {
    fs.unlinkSync(ZIP_PATH);
  }

  // Use PowerShell Compress-Archive for standard ZIP creation on Windows
  const psCmd = `powershell -Command "Compress-Archive -Path '${OUTPUT_DIR}\\*' -DestinationPath '${ZIP_PATH}' -Force"`;
  execSync(psCmd);

  // Also create crm.zip as an alias on Desktop
  const ALIAS_ZIP = 'C:\\Users\\ice\\Desktop\\crm.zip';
  if (fs.existsSync(ALIAS_ZIP)) fs.unlinkSync(ALIAS_ZIP);
  fs.copyFileSync(ZIP_PATH, ALIAS_ZIP);

  const stats = fs.statSync(ZIP_PATH);
  console.log(`✅ SUCCESS! Created ZIP file at:`);
  console.log(`   1. ${ZIP_PATH} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   2. ${ALIAS_ZIP} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

run().catch(err => {
  console.error('Fatal error during screenshot capture:', err);
  process.exit(1);
});
