import fs from 'fs';
import path from 'path';

export interface Prospect {
  id: string;
  name: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  category: string;
  source: 'google_maps' | 'facebook' | 'manual';
  dedupeStatus: 'NEW' | 'POSSIBLE DUPLICATE' | 'ALREADY SAVED' | 'ALREADY SENT TO ZESTIFY';
  saved: boolean;
  sentToZestify: boolean;
  listIds: string[];
  createdAt: string;
  notes?: string;
  facebookUrl?: string;
}

export interface LeadList {
  id: string;
  name: string;
  description: string;
  targetCount: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ActivityItem {
  id: string;
  action: 'google_search' | 'facebook_search' | 'list_created' | 'leads_exported' | 'sent_to_zestify';
  title: string;
  description: string;
  count: number;
  timestamp: string;
}

export interface ExportItem {
  id: string;
  filename: string;
  format: 'csv' | 'xlsx';
  count: number;
  sourceList: string;
  createdAt: string;
}

export interface SettingsConfig {
  dedupeMatchEmail: boolean;
  dedupeMatchPhone: boolean;
  dedupeMatchDomain: boolean;
  dedupeMatchNameAddress: boolean;
  defaultMaxLeads: number;
  monthlyCreditLimit: number;
  creditsUsed: number;
  zestifyApiUrl: string;
  defaultWorkspaceId: string;
  zestifyAuthToken?: string;
}

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

interface StoreData {
  prospects: Prospect[];
  lists: LeadList[];
  activities: ActivityItem[];
  exports: ExportItem[];
  settings: SettingsConfig;
}

const DEFAULT_SETTINGS: SettingsConfig = {
  dedupeMatchEmail: true,
  dedupeMatchPhone: true,
  dedupeMatchDomain: true,
  dedupeMatchNameAddress: true,
  defaultMaxLeads: 100,
  monthlyCreditLimit: 5000,
  creditsUsed: 1240,
  zestifyApiUrl: 'http://localhost:5000',
  defaultWorkspaceId: 'tenant_default'
};

function generateInitialSeed(): StoreData {
  const lists: LeadList[] = [
    {
      id: 'list_dubai_re',
      name: 'Dubai Real Estate Companies',
      description: 'Prime commercial and residential brokerage firms in Business Bay and Downtown Dubai.',
      targetCount: 430,
      tags: ['Dubai', 'Real Estate', 'Commercial'],
      createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString()
    },
    {
      id: 'list_texas_dental',
      name: 'Dental Clinics Texas',
      description: 'Private pediatric and cosmetic dentistry practices in Austin and Dallas.',
      targetCount: 210,
      tags: ['Texas', 'Healthcare', 'Dental'],
      createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    }
  ];

  const seedProspects: Prospect[] = [
    {
      id: 'pros_dxb_001',
      name: 'Emaar Horizon Properties LLC',
      phone: '+971 4 367 3333',
      email: 'invest@emaarhorizon.ae',
      website: 'emaarhorizon.ae',
      address: 'Downtown Dubai, Boulevard Plaza Tower 1',
      city: 'Dubai',
      category: 'Real Estate Agency',
      source: 'google_maps',
      dedupeStatus: 'ALREADY SAVED',
      saved: true,
      sentToZestify: false,
      listIds: ['list_dubai_re'],
      createdAt: new Date(Date.now() - 40 * 3600 * 1000).toISOString(),
      notes: 'Premier luxury developer partner. High net worth portfolio.'
    },
    {
      id: 'pros_dxb_002',
      name: 'Damac Heights Realty Group',
      phone: '+971 4 520 8800',
      email: 'sales@damacheights.ae',
      website: 'damacheights.ae',
      address: 'Dubai Marina, Damac Heights St',
      city: 'Dubai',
      category: 'Real Estate Agency',
      source: 'google_maps',
      dedupeStatus: 'ALREADY SENT TO ZESTIFY',
      saved: true,
      sentToZestify: true,
      listIds: ['list_dubai_re'],
      createdAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
      notes: 'Transferred to Zestify Enterprise Campaign.'
    },
    {
      id: 'pros_dxb_003',
      name: 'Gulf Luxury Homes Real Estate',
      phone: '+971 4 456 1234',
      email: 'info@gulfluxuryhomes.com',
      website: 'gulfluxuryhomes.com',
      address: 'Business Bay, Iris Bay Tower #1204',
      city: 'Dubai',
      category: 'Real Estate Agency',
      source: 'google_maps',
      dedupeStatus: 'NEW',
      saved: true,
      sentToZestify: false,
      listIds: ['list_dubai_re'],
      createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString()
    },
    {
      id: 'pros_dxb_004',
      name: 'Al Wasl Estate Consultants',
      phone: '+971 4 398 7654',
      email: 'contact@alwaslestates.ae',
      website: 'alwaslestates.ae',
      address: 'Sheikh Zayed Road, Al Wasl Tower',
      city: 'Dubai',
      category: 'Property Management',
      source: 'google_maps',
      dedupeStatus: 'POSSIBLE DUPLICATE',
      saved: true,
      sentToZestify: false,
      listIds: ['list_dubai_re'],
      createdAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString()
    },
    {
      id: 'pros_tx_001',
      name: 'Austin Family Dental Care',
      phone: '+1 512 454 5678',
      email: 'care@austinfamilydental.com',
      website: 'austinfamilydental.com',
      address: '3801 N Lamar Blvd Ste 300',
      city: 'Austin, TX',
      category: 'Dentist',
      source: 'google_maps',
      dedupeStatus: 'ALREADY SAVED',
      saved: true,
      sentToZestify: false,
      listIds: ['list_texas_dental'],
      createdAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString()
    },
    {
      id: 'pros_tx_002',
      name: 'Lone Star Cosmetic Dentistry',
      phone: '+1 512 892 2222',
      email: 'smile@lonestardental.com',
      website: 'lonestardental.com',
      address: '4300 Westbank Dr #150',
      city: 'Austin, TX',
      category: 'Cosmetic Dentist',
      source: 'google_maps',
      dedupeStatus: 'ALREADY SENT TO ZESTIFY',
      saved: true,
      sentToZestify: true,
      listIds: ['list_texas_dental'],
      createdAt: new Date(Date.now() - 18 * 3600 * 1000).toISOString()
    },
    {
      id: 'pros_tx_003',
      name: 'Dallas Pediatric Smiles Center',
      phone: '+1 214 696 9000',
      email: 'office@dallassmilespediatric.com',
      website: 'dallassmilespediatric.com',
      address: '8222 Douglas Ave Ste 700',
      city: 'Dallas, TX',
      category: 'Pediatric Dentist',
      source: 'google_maps',
      dedupeStatus: 'NEW',
      saved: true,
      sentToZestify: false,
      listIds: ['list_texas_dental'],
      createdAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString()
    },
    {
      id: 'pros_fb_001',
      name: 'Dr. Sarah Jenkins DDS',
      phone: '+1 214 555 0192',
      email: 'sarah@jenkinsdentalsmiles.com',
      website: 'jenkinsdentalsmiles.com',
      address: 'Dallas Metro Area',
      city: 'Dallas, TX',
      category: 'Orthodontics & Implants',
      source: 'facebook',
      dedupeStatus: 'NEW',
      saved: true,
      sentToZestify: false,
      listIds: ['list_texas_dental'],
      facebookUrl: 'https://facebook.com/sarahjenkinsdds',
      createdAt: new Date(Date.now() - 14 * 3600 * 1000).toISOString()
    },
    {
      id: 'pros_fb_002',
      name: 'Sheikh Hamdan Real Estate Forum',
      phone: '+971 50 123 4567',
      email: 'leads@hamdanbrokerage.ae',
      website: 'hamdanbrokerage.ae',
      address: 'Sheikh Zayed Rd',
      city: 'Dubai',
      category: 'Commercial Broker',
      source: 'facebook',
      dedupeStatus: 'ALREADY SAVED',
      saved: true,
      sentToZestify: false,
      listIds: ['list_dubai_re'],
      facebookUrl: 'https://facebook.com/groups/dubaibrokersclub',
      createdAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString()
    }
  ];

  const activities: ActivityItem[] = [
    {
      id: 'act_1',
      action: 'google_search',
      title: 'Google Search Completed',
      description: 'Extracted 65 prospect listings for "Real Estate Agency in Dubai"',
      count: 65,
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString()
    },
    {
      id: 'act_2',
      action: 'facebook_search',
      title: 'Facebook Search Completed',
      description: 'Discovered 42 group and page prospects for "Dental Clinics Texas"',
      count: 42,
      timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    },
    {
      id: 'act_3',
      action: 'list_created',
      title: 'Lead List Created',
      description: 'Created list "Dubai Real Estate Companies" (430 target prospects)',
      count: 430,
      timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    },
    {
      id: 'act_4',
      action: 'leads_exported',
      title: 'Leads Exported',
      description: 'Exported 150 verified prospects to Dubai_Real_Estate_Prospects.xlsx',
      count: 150,
      timestamp: new Date(Date.now() - 16 * 3600 * 1000).toISOString()
    },
    {
      id: 'act_5',
      action: 'sent_to_zestify',
      title: 'Leads Sent to Zestify',
      description: 'Transferred 25 prospects into Zestify CRM Workspace (tenant_default)',
      count: 25,
      timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString()
    }
  ];

  const exports: ExportItem[] = [
    {
      id: 'exp_1',
      filename: 'Dubai_Real_Estate_Prospects.xlsx',
      format: 'xlsx',
      count: 150,
      sourceList: 'Dubai Real Estate Companies',
      createdAt: new Date(Date.now() - 16 * 3600 * 1000).toISOString()
    },
    {
      id: 'exp_2',
      filename: 'Texas_Dental_Practices.csv',
      format: 'csv',
      count: 85,
      sourceList: 'Dental Clinics Texas',
      createdAt: new Date(Date.now() - 32 * 3600 * 1000).toISOString()
    }
  ];

  return {
    prospects: seedProspects,
    lists,
    activities,
    exports,
    settings: DEFAULT_SETTINGS
  };
}

export class LocalDb {
  private data: StoreData;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORE_FILE)) {
      try {
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        this.data = JSON.parse(raw);
      } catch (_) {
        this.data = generateInitialSeed();
        this.save();
      }
    } else {
      this.data = generateInitialSeed();
      this.save();
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save LocalDb store:', e);
    }
  }

  getProspects(): Prospect[] {
    return this.data.prospects;
  }

  getProspectById(id: string): Prospect | undefined {
    return this.data.prospects.find(p => p.id === id);
  }

  saveProspects(newProspects: Prospect[]): void {
    for (const p of newProspects) {
      const idx = this.data.prospects.findIndex(existing => existing.id === p.id);
      if (idx >= 0) {
        this.data.prospects[idx] = { ...this.data.prospects[idx], ...p, saved: true };
      } else {
        this.data.prospects.unshift({ ...p, saved: true });
      }
    }
    this.save();
  }

  deleteProspect(id: string): void {
    this.data.prospects = this.data.prospects.filter(p => p.id !== id);
    this.save();
  }

  updateProspect(id: string, patch: Partial<Prospect>): Prospect | undefined {
    const p = this.data.prospects.find(x => x.id === id);
    if (p) {
      Object.assign(p, patch);
      this.save();
    }
    return p;
  }

  getLists(): LeadList[] {
    return this.data.lists;
  }

  createList(name: string, description: string, tags: string[] = []): LeadList {
    const list: LeadList = {
      id: 'list_' + Math.random().toString(36).slice(2, 9),
      name: name.trim(),
      description: description.trim(),
      targetCount: 0,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.data.lists.unshift(list);
    this.logActivity('list_created', 'Lead List Created', `Created lead list "${list.name}"`, 0);
    this.save();
    return list;
  }

  addProspectsToList(listId: string, prospectIds: string[]): number {
    const list = this.data.lists.find(l => l.id === listId);
    if (!list) return 0;
    let added = 0;
    for (const pid of prospectIds) {
      const p = this.data.prospects.find(x => x.id === pid);
      if (p) {
        if (!p.listIds) p.listIds = [];
        if (!p.listIds.includes(listId)) {
          p.listIds.push(listId);
          added++;
        }
      }
    }
    list.targetCount = this.data.prospects.filter(p => p.listIds?.includes(listId)).length;
    list.updatedAt = new Date().toISOString();
    this.save();
    return added;
  }

  removeProspectFromList(listId: string, prospectId: string): boolean {
    const p = this.data.prospects.find(x => x.id === prospectId);
    if (p && p.listIds) {
      p.listIds = p.listIds.filter(id => id !== listId);
      const list = this.data.lists.find(l => l.id === listId);
      if (list) {
        list.targetCount = this.data.prospects.filter(x => x.listIds?.includes(listId)).length;
        list.updatedAt = new Date().toISOString();
      }
      this.save();
      return true;
    }
    return false;
  }

  getActivities(): ActivityItem[] {
    return this.data.activities;
  }

  logActivity(action: ActivityItem['action'], title: string, description: string, count: number): void {
    const act: ActivityItem = {
      id: 'act_' + Date.now(),
      action,
      title,
      description,
      count,
      timestamp: new Date().toISOString()
    };
    this.data.activities.unshift(act);
    if (this.data.activities.length > 50) this.data.activities.pop();
    this.save();
  }

  getExports(): ExportItem[] {
    return this.data.exports;
  }

  logExport(filename: string, format: 'csv' | 'xlsx', count: number, sourceList: string): ExportItem {
    const exp: ExportItem = {
      id: 'exp_' + Date.now(),
      filename,
      format,
      count,
      sourceList,
      createdAt: new Date().toISOString()
    };
    this.data.exports.unshift(exp);
    this.logActivity('leads_exported', 'Leads Exported', `Generated ${format.toUpperCase()} export: ${filename} (${count} leads)`, count);
    this.save();
    return exp;
  }

  getSettings(): SettingsConfig {
    return this.data.settings;
  }

  updateSettings(patch: Partial<SettingsConfig>): SettingsConfig {
    Object.assign(this.data.settings, patch);
    this.save();
    return this.data.settings;
  }

  consumeCredits(amount: number): number {
    this.data.settings.creditsUsed += amount;
    this.save();
    return this.data.settings.creditsUsed;
  }
}

export const localDb = new LocalDb();
