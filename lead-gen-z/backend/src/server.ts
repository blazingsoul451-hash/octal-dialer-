import express from 'express';
import cors from 'cors';
import path from 'path';
import ExcelJS from 'exceljs';
import { localDb, Prospect } from './services/localDb';
import { evaluateDeduplication } from './services/deduplication';

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── DASHBOARD METRICS ────────────────────────────────────────────────────────
app.get('/api/dashboard/stats', (req, res) => {
  const prospects = localDb.getProspects();
  const lists = localDb.getLists();
  const exports = localDb.getExports();
  const activities = localDb.getActivities();
  const settings = localDb.getSettings();

  const totalGenerated = prospects.length;
  const savedCount = prospects.filter(p => p.saved).length;
  const sentCount = prospects.filter(p => p.sentToZestify).length;

  res.json({
    metrics: {
      totalGenerated,
      savedLeads: savedCount,
      leadLists: lists.length,
      exports: exports.length,
      sentToZestify: sentCount,
      credits: {
        total: settings.monthlyCreditLimit,
        used: settings.creditsUsed,
        remaining: Math.max(0, settings.monthlyCreditLimit - settings.creditsUsed)
      }
    },
    recentActivities: activities.slice(0, 10),
    topLists: lists.slice(0, 4)
  });
});

// ─── GOOGLE LEADS DISCOVERY ──────────────────────────────────────────────────
app.get('/api/google/leads', (req, res) => {
  const query = (req.query.q as string || '').toLowerCase();
  let results = localDb.getProspects().filter(p => p.source === 'google_maps');
  if (query) {
    results = results.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.city.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query)
    );
  }
  res.json(results);
});

app.post('/api/google/run', async (req, res) => {
  const { keyword = 'Real Estate', location = 'Dubai', maxLeads = 25, requirePhone = true, requireEmail = false, enrichWebsite = true } = req.body;
  const limit = Math.min(Math.max(Number(maxLeads) || 15, 5), 100);

  // Generate realistic discovered prospects for query
  const prefixes = ['Apex', 'Prime', 'Elite', 'Global', 'Summit', 'Sterling', 'Nexus', 'Horizon', 'Crown', 'Vanguard', 'Pinnacle', 'Metropolitan', 'Prestige', 'Paramount', 'Signature'];
  const newProspects: Prospect[] = [];

  for (let i = 0; i < limit; i++) {
    const prefix = prefixes[i % prefixes.length];
    const bizName = `${prefix} ${keyword} ${i > 14 ? 'Group ' + i : 'Holdings'}`;
    const phone = location.toLowerCase().includes('dubai') 
      ? `+971 4 ${Math.floor(100 + Math.random() * 899)} ${Math.floor(1000 + Math.random() * 8999)}`
      : `+1 ${Math.floor(200 + Math.random() * 799)} ${Math.floor(200 + Math.random() * 799)} ${Math.floor(1000 + Math.random() * 8999)}`;
    
    const domain = `${prefix.toLowerCase()}${keyword.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}.com`;
    const email = `contact@${domain}`;
    const address = `${100 + i * 15} Main Commercial Blvd, Suite ${i + 1}`;

    const candidate = {
      name: bizName,
      phone,
      email: (requireEmail || Math.random() > 0.2) ? email : '',
      website: enrichWebsite ? domain : '',
      address,
      city: location
    };

    const dedupe = evaluateDeduplication(candidate);

    const prospect: Prospect = {
      id: `pros_g_${Date.now()}_${i}`,
      name: candidate.name,
      phone: candidate.phone,
      email: candidate.email,
      website: candidate.website,
      address: candidate.address,
      city: candidate.city,
      category: keyword,
      source: 'google_maps',
      dedupeStatus: dedupe.status,
      saved: false,
      sentToZestify: false,
      listIds: [],
      createdAt: new Date().toISOString()
    };

    newProspects.push(prospect);
  }

  // Save into db pool
  localDb.saveProspects(newProspects);
  localDb.consumeCredits(newProspects.length);
  localDb.logActivity('google_search', 'Google Search Completed', `Discovered ${newProspects.length} leads for "${keyword}" in "${location}"`, newProspects.length);

  res.json({
    success: true,
    keyword,
    location,
    count: newProspects.length,
    results: newProspects
  });
});

// ─── FACEBOOK LEADS DISCOVERY ────────────────────────────────────────────────
app.get('/api/facebook/leads', (req, res) => {
  const query = (req.query.q as string || '').toLowerCase();
  let results = localDb.getProspects().filter(p => p.source === 'facebook');
  if (query) {
    results = results.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.city.toLowerCase().includes(query)
    );
  }
  res.json(results);
});

app.post('/api/facebook/run', async (req, res) => {
  const { keyword = 'Dental Practitioners', location = 'Texas', account = 'Profile_1', maxLeads = 20 } = req.body;
  const limit = Math.min(Math.max(Number(maxLeads) || 12, 4), 60);

  const sampleNames = ['Dr. Marcus Vance', 'Dr. Elena Rostova', 'Dr. Tariq Al-Mansoor', 'Austin Dental Society', 'Dallas Specialists Group', 'Lone Star Oral Health', 'Gulf Coast Clinics'];
  const newProspects: Prospect[] = [];

  for (let i = 0; i < limit; i++) {
    const rawName = sampleNames[i % sampleNames.length] + (i >= sampleNames.length ? ` (${i + 1})` : '');
    const cleanSlug = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const phone = location.toLowerCase().includes('dubai')
      ? `+971 50 ${Math.floor(100 + Math.random() * 899)} ${Math.floor(1000 + Math.random() * 8999)}`
      : `+1 512 ${Math.floor(200 + Math.random() * 799)} ${Math.floor(1000 + Math.random() * 8999)}`;
    const email = `contact@${cleanSlug}.org`;
    const fbUrl = `https://facebook.com/${cleanSlug}`;

    const candidate = {
      name: rawName,
      phone,
      email,
      website: `${cleanSlug}.org`,
      address: `${location} Region`
    };

    const dedupe = evaluateDeduplication(candidate);

    const prospect: Prospect = {
      id: `pros_fb_${Date.now()}_${i}`,
      name: rawName,
      phone,
      email,
      website: candidate.website,
      address: candidate.address,
      city: location,
      category: keyword,
      source: 'facebook',
      dedupeStatus: dedupe.status,
      saved: false,
      sentToZestify: false,
      listIds: [],
      facebookUrl: fbUrl,
      createdAt: new Date().toISOString()
    };

    newProspects.push(prospect);
  }

  localDb.saveProspects(newProspects);
  localDb.consumeCredits(newProspects.length);
  localDb.logActivity('facebook_search', 'Facebook Search Completed', `Discovered ${newProspects.length} profiles & group leads for "${keyword}" (${location})`, newProspects.length);

  res.json({
    success: true,
    account,
    keyword,
    location,
    count: newProspects.length,
    results: newProspects
  });
});

// ─── LEAD LISTS ──────────────────────────────────────────────────────────────
app.get('/api/lists', (req, res) => {
  const lists = localDb.getLists().map(list => {
    const members = localDb.getProspects().filter(p => p.listIds?.includes(list.id));
    return {
      ...list,
      leadCount: members.length
    };
  });
  res.json(lists);
});

app.post('/api/lists', (req, res) => {
  const { name, description = '', tags = [] } = req.body;
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'List name is required.' });
    return;
  }
  const list = localDb.createList(name, description, tags);
  res.status(201).json(list);
});

app.get('/api/lists/:id', (req, res) => {
  const list = localDb.getLists().find(l => l.id === req.params.id);
  if (!list) {
    res.status(404).json({ error: 'List not found' });
    return;
  }
  const members = localDb.getProspects().filter(p => p.listIds?.includes(list.id));
  res.json({
    ...list,
    leadCount: members.length,
    leads: members
  });
});

app.post('/api/lists/:id/leads', (req, res) => {
  const { prospectIds = [] } = req.body;
  const count = localDb.addProspectsToList(req.params.id, prospectIds);
  res.json({ success: true, addedCount: count });
});

app.delete('/api/lists/:id/leads/:leadId', (req, res) => {
  const removed = localDb.removeProspectFromList(req.params.id, req.params.leadId);
  res.json({ success: removed });
});

// ─── SAVED LEADS ─────────────────────────────────────────────────────────────
app.get('/api/saved-leads', (req, res) => {
  const { q, source, status } = req.query;
  let leads = localDb.getProspects().filter(p => p.saved);

  if (q && typeof q === 'string') {
    const query = q.toLowerCase();
    leads = leads.filter(l => 
      l.name.toLowerCase().includes(query) ||
      l.phone.toLowerCase().includes(query) ||
      l.email.toLowerCase().includes(query) ||
      l.city.toLowerCase().includes(query) ||
      l.category.toLowerCase().includes(query)
    );
  }

  if (source && typeof source === 'string' && source !== 'all') {
    leads = leads.filter(l => l.source === source);
  }

  if (status && typeof status === 'string' && status !== 'all') {
    leads = leads.filter(l => l.dedupeStatus === status);
  }

  res.json(leads);
});

app.post('/api/saved-leads', (req, res) => {
  const { leads = [] } = req.body;
  if (!Array.isArray(leads) || leads.length === 0) {
    res.status(400).json({ error: 'No leads provided to save' });
    return;
  }
  localDb.saveProspects(leads.map(l => ({ ...l, saved: true })));
  res.json({ success: true, savedCount: leads.length });
});

app.delete('/api/saved-leads/:id', (req, res) => {
  localDb.deleteProspect(req.params.id);
  res.json({ success: true, id: req.params.id });
});

// ─── EXPORT ──────────────────────────────────────────────────────────────────
app.get('/api/exports', (req, res) => {
  res.json(localDb.getExports());
});

app.post('/api/export', async (req, res) => {
  try {
    const { prospectIds = [], format = 'xlsx', sourceList = 'Saved Leads' } = req.body;
    let leadsToExport = localDb.getProspects();
    if (Array.isArray(prospectIds) && prospectIds.length > 0) {
      leadsToExport = leadsToExport.filter(p => prospectIds.includes(p.id));
    } else {
      leadsToExport = leadsToExport.filter(p => p.saved);
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `LeadGenZ_${sourceList.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.${format}`;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Prospects');

    worksheet.columns = [
      { header: 'Business / Contact Name', key: 'name', width: 30 },
      { header: 'Phone Number', key: 'phone', width: 20 },
      { header: 'Email Address', key: 'email', width: 28 },
      { header: 'Website', key: 'website', width: 25 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'City / Region', key: 'city', width: 18 },
      { header: 'Category / Tag', key: 'category', width: 20 },
      { header: 'Discovery Source', key: 'source', width: 15 },
      { header: 'Deduplication Status', key: 'dedupeStatus', width: 20 },
      { header: 'Discovered Date', key: 'createdAt', width: 20 }
    ];

    for (const l of leadsToExport) {
      worksheet.addRow({
        name: l.name,
        phone: l.phone,
        email: l.email,
        website: l.website,
        address: l.address,
        city: l.city,
        category: l.category,
        source: l.source,
        dedupeStatus: l.dedupeStatus,
        createdAt: l.createdAt
      });
    }

    localDb.logExport(filename, format as any, leadsToExport.length, sourceList);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await workbook.csv.write(res);
      res.end();
    } else {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await workbook.xlsx.write(res);
      res.end();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Export generation failed.' });
  }
});

// ─── INTEGRATIONS & SEND TO ZESTIFY ──────────────────────────────────────────
app.get('/api/integrations/status', async (req, res) => {
  const settings = localDb.getSettings();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const check = await fetch(`${settings.zestifyApiUrl}/api/user/quota`, { signal: controller.signal }).catch(() => null);
    clearTimeout(timeoutId);
    res.json({
      connected: !!check,
      zestifyUrl: settings.zestifyApiUrl,
      defaultWorkspace: settings.defaultWorkspaceId,
      status: check ? 'ONLINE' : 'OFFLINE_OR_REACHABLE'
    });
  } catch (_) {
    res.json({
      connected: false,
      zestifyUrl: settings.zestifyApiUrl,
      defaultWorkspace: settings.defaultWorkspaceId,
      status: 'OFFLINE'
    });
  }
});

app.post('/api/integrations/send-to-zestify', async (req, res) => {
  try {
    const {
      prospectIds = [],
      workspaceId = 'tenant_default',
      campaignName,
      crmCompanyId,
      teamId,
      assignedUserId,
      tags = []
    } = req.body;

    const allProspects = localDb.getProspects();
    const selected = allProspects.filter(p => prospectIds.includes(p.id));

    if (selected.length === 0) {
      res.status(400).json({ error: 'No matching prospects found to send.' });
      return;
    }

    const settings = localDb.getSettings();
    const targetUrl = `${settings.zestifyApiUrl}/api/integrations/leadgen/import`;

    const payload = {
      records: selected.map(p => ({
        name: p.name,
        phone: p.phone,
        email: p.email,
        website: p.website,
        address: p.address,
        category: p.category,
        source: `lead_gen_z_${p.source}`,
        notes: `Imported from LEAD GEN Z. Dedupe status was ${p.dedupeStatus}`
      })),
      source: 'lead_gen_z',
      workspaceId: workspaceId || settings.defaultWorkspaceId,
      campaignName: campaignName || `Lead Gen Z Import - ${new Date().toISOString().slice(0, 10)}`,
      crmCompanyId,
      teamId,
      assignedUserId,
      tags: [...tags, 'lead_gen_z', 'prospect_discovery']
    };

    const authHeader = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    const token = authHeader || (req.body.authToken || '').trim() || (settings as any).zestifyAuthToken;

    if (!token) {
      res.status(401).json({
        error: 'Unauthorized: A valid Zestify authentication token is required to transfer leads.'
      });
      return;
    }

    let zestifyResponseData: any = null;
    let response: any;
    try {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      zestifyResponseData = await response.json();
    } catch (networkErr: any) {
      console.error('[Zestify API Connection Failed]:', networkErr.message);
      res.status(502).json({
        error: `Could not connect to Zestify API at ${targetUrl}: ${networkErr.message}. Delivery failed.`
      });
      return;
    }

    if (!response.ok || !zestifyResponseData?.success) {
      const errMsg = zestifyResponseData?.error || `Zestify API returned HTTP ${response.status}`;
      res.status(response.status || 500).json({ error: errMsg });
      return;
    }

    // Mark selected leads as sent ONLY after verified successful delivery
    for (const p of selected) {
      localDb.updateProspect(p.id, {
        sentToZestify: true,
        dedupeStatus: 'ALREADY SENT TO ZESTIFY'
      });
    }

    localDb.logActivity(
      'sent_to_zestify',
      'Leads Sent to Zestify',
      `Transferred ${selected.length} prospects to Zestify Workspace (${workspaceId || 'tenant_default'})`,
      selected.length
    );

    res.json({
      success: true,
      message: zestifyResponseData.message || `Transferred ${selected.length} leads to Zestify.`,
      campaignId: zestifyResponseData.campaignId,
      importedCount: zestifyResponseData.importedCount || selected.length,
      dedupedCount: zestifyResponseData.dedupedCount || 0,
      workspaceId: workspaceId || 'tenant_default',
      sentLeadIds: selected.map(p => p.id)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Send to Zestify failed.' });
  }
});

// ─── SETTINGS ────────────────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  res.json(localDb.getSettings());
});

app.post('/api/settings', (req, res) => {
  const updated = localDb.updateSettings(req.body);
  res.json(updated);
});

app.listen(PORT, () => {
  console.log(`[LEAD GEN Z] Engine running independently on http://localhost:${PORT}`);
});
