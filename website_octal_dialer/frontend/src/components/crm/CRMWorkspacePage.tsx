import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users, Building2, Calendar, Clock, PhoneCall,
  Search, ArrowRight, AlertCircle, Plus,
  Activity, Layers, RefreshCw, Phone,
  Briefcase, CalendarCheck, Edit3,
  Calculator, Settings, X, UserCheck,
  TrendingUp, Award, CheckSquare, Video, Check
} from 'lucide-react';
import { LeadProfileDrawer } from './LeadProfileDrawer';
import { CompanyProfileDrawer } from './CompanyProfileDrawer';
import { ContactProfileDrawer } from './ContactProfileDrawer';
import { TaskTimerBadge } from './TaskTimerBadge';
import {
  CloseTaskModal,
  RescheduleTaskModal,
  CancelTaskModal,
  AddCompanyModal,
  AddContactModal,
  AddLeadModal,
  CreateTaskModal,
  EditCompanyModal,
  EditContactModal,
  EditLeadCrmModal,
  EditTaskModal,
  CreateWorkItemModal,
  EditWorkItemModal,
  QuoteBuilderModal,
  PricingRulesModal
} from './CRMModals';
import type { Campaign } from '../../types';
import type {
  CrmCompany,
  CrmContact,
  CrmTask,
  CrmOverviewMetrics,
  CrmTimelineItem,
  CrmWorkItem,
  CrmWorkStatus,
  CrmQuote,
  CrmPerformanceData,
  CrmSearchResult
} from '../../types/crm';

interface CRMWorkspacePageProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  campaigns: Campaign[];
  userRole?: string;
  initialSubTab?: 'overview' | 'companies' | 'contacts' | 'leads' | 'tasks' | 'meetings' | 'client-work' | 'quotes' | 'performance' | 'activity' | 'follow-ups';
  onDialLead?: (phone: string, leadId: string, leadName: string) => void;
  onNavigateTab?: (tab: string) => void;
}

export const CRMWorkspacePage: React.FC<CRMWorkspacePageProps> = ({
  isLight,
  serverUrl,
  authToken,
  campaigns,
  userRole = 'member',
  initialSubTab = 'overview',
  onDialLead,
  onNavigateTab: _onNavigateTab
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'overview' | 'companies' | 'contacts' | 'leads' | 'tasks' | 'meetings' | 'client-work' | 'quotes' | 'performance' | 'activity'
  >(
    initialSubTab === 'follow-ups' ? 'tasks' : (initialSubTab as any) || 'overview'
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Date Range for Overview Metrics & Performance
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | '7d' | '30d' | 'this_month' | 'all'>('30d');
  const [performancePeriod, setPerformancePeriod] = useState<'today' | 'this_week' | 'this_month' | 'all_time'>('this_month');

  // CRM Data State
  const [metrics, setMetrics] = useState<CrmOverviewMetrics | null>(null);
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [meetings, setMeetings] = useState<CrmTask[]>([]);
  const [workItems, setWorkItems] = useState<CrmWorkItem[]>([]);
  const [quotes, setQuotes] = useState<CrmQuote[]>([]);
  const [performance, setPerformance] = useState<CrmPerformanceData | null>(null);
  const [timeline, setTimeline] = useState<CrmTimelineItem[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);

  // Active Drawers
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Creation & Edit Modals
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateWorkItem, setShowCreateWorkItem] = useState(false);
  const [showQuoteBuilder, setShowQuoteBuilder] = useState(false);
  const [showPricingRules, setShowPricingRules] = useState(false);

  // Entity specific edit modals
  const [editingCompany, setEditingCompany] = useState<CrmCompany | null>(null);
  const [editingContact, setEditingContact] = useState<CrmContact | null>(null);
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const [editingTask, setEditingTask] = useState<CrmTask | null>(null);
  const [editingWorkItem, setEditingWorkItem] = useState<CrmWorkItem | null>(null);

  // Task Action Modals
  const [selectedTaskForClose, setSelectedTaskForClose] = useState<CrmTask | null>(null);
  const [selectedTaskForReschedule, setSelectedTaskForReschedule] = useState<CrmTask | null>(null);
  const [selectedTaskForCancel, setSelectedTaskForCancel] = useState<CrmTask | null>(null);

  // Global Cross-Entity Search State
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<CrmSearchResult[]>([]);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const [showGlobalDropdown, setShowGlobalDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Subtab Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [companyStatusFilter, setCompanyStatusFilter] = useState('all');
  const [companyPaymentFilter, setCompanyPaymentFilter] = useState('all');
  const [contactCompanyFilter, setContactCompanyFilter] = useState('all');
  const [leadStatusFilter, setLeadStatusFilter] = useState('all');
  const [leadCampaignFilter, setLeadCampaignFilter] = useState('all');
  const [taskTypeFilter, setTaskTypeFilter] = useState('all');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('all');
  const [workStatusFilter, setWorkStatusFilter] = useState('ALL');
  const [quoteStatusFilter, setQuoteStatusFilter] = useState('ALL');

  const isOwner = userRole === 'platform_admin' || userRole === 'company_owner' || userRole === 'superadmin' || userRole === 'admin';

  // Fetch all CRM workspace data
  const fetchCRMData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { 'Authorization': `Bearer ${authToken}` };

      // 1. Overview metrics
      const metricsRes = await fetch(`${serverUrl}/api/crm/overview?range=${dateRange}`, { headers });
      if (metricsRes.ok) {
        const json = await metricsRes.json();
        setMetrics(json.metrics);
      }

      // 2. Companies
      const compRes = await fetch(`${serverUrl}/api/crm/companies`, { headers });
      if (compRes.ok) {
        const json = await compRes.json();
        setCompanies(json.companies || []);
      }

      // 3. Contacts
      const contRes = await fetch(`${serverUrl}/api/crm/contacts`, { headers });
      if (contRes.ok) {
        const json = await contRes.json();
        setContacts(json.contacts || []);
      }

      // 4. Canonical leads
      const leadsRes = await fetch(`${serverUrl}/api/crm/leads?limit=100`, { headers });
      if (leadsRes.ok) {
        const json = await leadsRes.json();
        setLeads(json.leads || []);
      }

      // 5. Tasks
      const tasksRes = await fetch(`${serverUrl}/api/crm/tasks`, { headers });
      if (tasksRes.ok) {
        const json = await tasksRes.json();
        setTasks(json.tasks || []);
      }

      // 6. Meetings
      const meetingsRes = await fetch(`${serverUrl}/api/crm/meetings`, { headers });
      if (meetingsRes.ok) {
        const json = await meetingsRes.json();
        setMeetings(json.meetings || []);
      }

      // 7. Client Work Items
      const workRes = await fetch(`${serverUrl}/api/crm/work-items`, { headers });
      if (workRes.ok) {
        const json = await workRes.json();
        setWorkItems(json.workItems || []);
      }

      // 8. Quotes
      const quotesRes = await fetch(`${serverUrl}/api/crm/quotes`, { headers });
      if (quotesRes.ok) {
        const json = await quotesRes.json();
        setQuotes(json.quotes || []);
      }

      // 9. Performance
      const perfRes = await fetch(`${serverUrl}/api/crm/performance?period=${performancePeriod}`, { headers });
      if (perfRes.ok) {
        const json = await perfRes.json();
        setPerformance(json);
      }

      // 10. Timeline
      const timelineRes = await fetch(`${serverUrl}/api/crm/timeline?limit=50`, { headers });
      if (timelineRes.ok) {
        const json = await timelineRes.json();
        setTimeline(json.items || []);
      }

      // 11. Users for assignment
      try {
        const usersRes = await fetch(`${serverUrl}/api/admin/users`, { headers });
        if (usersRes.ok) {
          const json = await usersRes.json();
          setUsers((json.users || []).map((u: any) => ({ id: u.id, name: u.name || u.email })));
        }
      } catch {
        // Ignored
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching CRM workspace data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCRMData();
  }, [serverUrl, authToken, dateRange, performancePeriod]);

  useEffect(() => {
    if (initialSubTab) {
      if (initialSubTab === 'follow-ups') {
        setActiveSubTab('tasks');
      } else {
        setActiveSubTab(initialSubTab as any);
      }
    }
  }, [initialSubTab]);

  // Global Cross-Entity Search Debounce
  useEffect(() => {
    if (!globalSearchQuery.trim() || globalSearchQuery.trim().length < 2) {
      setGlobalSearchResults([]);
      setIsSearchingGlobal(false);
      return;
    }

    setIsSearchingGlobal(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${serverUrl}/api/crm/search?q=${encodeURIComponent(globalSearchQuery.trim())}`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          setGlobalSearchResults(data.results || []);
          setShowGlobalDropdown(true);
        }
      } catch (err) {
        console.error('Global search error', err);
      } finally {
        setIsSearchingGlobal(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [globalSearchQuery, serverUrl, authToken]);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowGlobalDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSearchResult = (item: CrmSearchResult) => {
    setShowGlobalDropdown(false);
    setGlobalSearchQuery('');
    if (item.type === 'company') {
      setSelectedCompanyId(item.entityId);
    } else if (item.type === 'contact') {
      setSelectedContactId(item.entityId);
    } else if (item.type === 'lead') {
      setSelectedLeadId(item.entityId);
    } else if (item.type === 'task') {
      setActiveSubTab('tasks');
    } else if (item.type === 'meeting') {
      setActiveSubTab('meetings');
    } else if (item.type === 'work') {
      setActiveSubTab('client-work');
    } else if (item.type === 'quote') {
      setActiveSubTab('quotes');
    }
  };

  // Status transition for work item quick buttons
  const handleUpdateWorkStatus = async (id: string, status: CrmWorkStatus) => {
    try {
      const res = await fetch(`${serverUrl}/api/crm/work-items/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchCRMData();
      }
    } catch (err) {
      console.error('Error updating work status', err);
    }
  };

  // Status transition for quotes
  const handleUpdateQuoteStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`${serverUrl}/api/crm/quotes/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchCRMData();
      }
    } catch (err) {
      console.error('Error updating quote status', err);
    }
  };

  // Derived Overview lists
  const urgentTasks = useMemo(() => {
    return tasks
      .filter(t => t.status === 'pending' || t.status === 'overdue')
      .slice(0, 5);
  }, [tasks]);

  // Filtered Companies
  const filteredCompanies = useMemo(() => {
    return companies.filter(c => {
      if (companyStatusFilter !== 'all' && c.status !== companyStatusFilter) return false;
      if (companyPaymentFilter !== 'all' && c.paymentStatus !== companyPaymentFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.industry && c.industry.toLowerCase().includes(q)) ||
          (c.country && c.country.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [companies, companyStatusFilter, companyPaymentFilter, searchQuery]);

  // Filtered Contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      if (contactCompanyFilter !== 'all' && c.crmCompanyId !== contactCompanyFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.phone && c.phone.toLowerCase().includes(q)) ||
          (c.roleTitle && c.roleTitle.toLowerCase().includes(q)) ||
          (c.companyName && c.companyName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [contacts, contactCompanyFilter, searchQuery]);

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (leadStatusFilter !== 'all' && (l.status || '').toUpperCase() !== leadStatusFilter.toUpperCase()) return false;
      if (leadCampaignFilter !== 'all' && l.campaignId !== leadCampaignFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          (l.name && l.name.toLowerCase().includes(q)) ||
          (l.businessName && l.businessName.toLowerCase().includes(q)) ||
          (l.phone && l.phone.toLowerCase().includes(q)) ||
          (l.companyName && l.companyName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [leads, leadStatusFilter, leadCampaignFilter, searchQuery]);

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (taskTypeFilter !== 'all' && t.taskType !== taskTypeFilter) return false;
      if (taskStatusFilter !== 'all' && t.status !== taskStatusFilter) return false;
      if (taskPriorityFilter !== 'all' && t.priority !== taskPriorityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.companyName && t.companyName.toLowerCase().includes(q)) ||
          (t.leadName && t.leadName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [tasks, taskTypeFilter, taskStatusFilter, taskPriorityFilter, searchQuery]);

  // Filtered Meetings
  const filteredMeetings = useMemo(() => {
    return meetings.filter(m => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          m.title.toLowerCase().includes(q) ||
          (m.companyName && m.companyName.toLowerCase().includes(q)) ||
          (m.leadName && m.leadName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [meetings, searchQuery]);

  // Filtered Work Items
  const filteredWorkItems = useMemo(() => {
    return workItems.filter(w => {
      if (workStatusFilter !== 'ALL' && w.status !== workStatusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          w.title.toLowerCase().includes(q) ||
          (w.description && w.description.toLowerCase().includes(q)) ||
          (w.companyName && w.companyName.toLowerCase().includes(q)) ||
          (w.category && w.category.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [workItems, workStatusFilter, searchQuery]);

  // Filtered Quotes
  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => {
      if (quoteStatusFilter !== 'ALL' && q.status !== quoteStatusFilter) return false;
      if (searchQuery.trim()) {
        const term = searchQuery.toLowerCase();
        return (
          q.quoteNumber.toLowerCase().includes(term) ||
          (q.companyName && q.companyName.toLowerCase().includes(term)) ||
          (q.contactName && q.contactName.toLowerCase().includes(term)) ||
          (q.packageName && q.packageName.toLowerCase().includes(term))
        );
      }
      return true;
    });
  }, [quotes, quoteStatusFilter, searchQuery]);

  return (
    <div className="crm-geist-scope space-y-6 pb-20 text-left animate-fade-in select-none">
      {/* ── Top Header with Global Search & Metrics Selector ── */}
      <div className={`p-6 border rounded-2xl shadow-xl backdrop-blur-md relative overflow-hidden ${
        isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
      }`}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
                  <span>CRM & Customer Intelligence</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    Phase 2 Full
                  </span>
                </h1>
                <p className="text-sm font-normal text-zinc-400 mt-1">
                  Accounts, Relationships, Work Tracking, Quotes, and Role-Scoped Intelligence
                </p>
              </div>
            </div>
          </div>

          {/* Global Search Bar */}
          <div className="flex-1 max-w-md w-full relative" ref={searchContainerRef}>
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                onFocus={() => { if (globalSearchResults.length > 0) setShowGlobalDropdown(true); }}
                placeholder="Global CRM Search (Companies, Contacts, Leads, Work, Quotes)..."
                className="w-full pl-9 pr-8 py-2 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
              {isSearchingGlobal && (
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
              )}
            </div>

            {/* Global Search Results Dropdown */}
            {showGlobalDropdown && globalSearchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#121216] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto">
                <div className="p-2 border-b border-[#1f1f23] text-[10px] font-mono font-bold uppercase text-zinc-400 flex items-center justify-between">
                  <span>Search Matches ({globalSearchResults.length})</span>
                  <button onClick={() => setShowGlobalDropdown(false)} className="text-zinc-500 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="divide-y divide-[#18181c]">
                  {globalSearchResults.map((item, idx) => (
                    <div
                      key={`${item.type}-${item.id}-${idx}`}
                      onClick={() => handleSelectSearchResult(item)}
                      className="p-2.5 hover:bg-[#18181b] cursor-pointer transition flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase ${
                          item.type === 'company' ? 'bg-amber-500/20 text-amber-400' :
                          item.type === 'contact' ? 'bg-cyan-500/20 text-cyan-400' :
                          item.type === 'lead' ? 'bg-emerald-500/20 text-emerald-400' :
                          item.type === 'meeting' ? 'bg-indigo-500/20 text-indigo-400' :
                          item.type === 'work' ? 'bg-blue-500/20 text-blue-400' :
                          item.type === 'quote' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-zinc-800 text-zinc-300'
                        }`}>
                          {item.type}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{item.title}</div>
                          <div className="text-[10px] text-zinc-400 truncate">{item.subtitle}</div>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-500 shrink-0 ml-2" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Refresh & Role Badge */}
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
              Role: {userRole}
            </span>
            <button
              onClick={fetchCRMData}
              disabled={loading}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700' : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-300'
              }`}
              title="Refresh CRM Records"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Sub-Navigation Tabs ── */}
        <div className={`flex flex-wrap items-center gap-2 pt-6 border-t mt-6 select-none ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
          {[
            { id: 'overview', label: 'CRM Overview', icon: Activity, count: null },
            { id: 'companies', label: 'Companies', icon: Building2, count: companies.length },
            { id: 'contacts', label: 'Contacts', icon: Users, count: contacts.length },
            { id: 'leads', label: 'Canonical Leads', icon: Phone, count: leads.length },
            { id: 'tasks', label: 'Tasks', icon: CheckSquare, count: tasks.filter(t => t.status === 'pending' || t.status === 'overdue').length },
            { id: 'meetings', label: 'Meetings', icon: CalendarCheck, count: meetings.filter(m => m.status === 'pending').length },
            { id: 'client-work', label: 'Client Work', icon: Briefcase, count: workItems.filter(w => w.status !== 'COMPLETED' && w.status !== 'REJECTED').length },
            { id: 'quotes', label: 'Quotes & Pricing', icon: Calculator, count: quotes.length },
            { id: 'performance', label: 'Performance', icon: Award, count: null },
            { id: 'activity', label: 'Unified Activity', icon: Layers, count: timeline.length },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveSubTab(tab.id as any);
                  setSearchQuery('');
                }}
                className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all cursor-pointer border flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-amber-500 text-black border-amber-500 shadow-sm'
                    : isLight
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                      : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-300'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-black' : 'text-zinc-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                    isActive ? 'bg-black/20 text-black' : isLight ? 'bg-slate-200 text-slate-700' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-3.5 border text-xs rounded-2xl flex items-start gap-2.5 shadow-sm bg-red-500/10 border-red-500/30 text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 1: OVERVIEW                                                       */}
      {/* ========================================================================= */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className={`flex items-center gap-2 text-xs font-medium ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
              <Calendar className="w-4 h-4 text-amber-500" />
              <span>Metrics Date Range:</span>
            </div>
            <div className={`flex items-center gap-1.5 p-1 rounded-xl text-xs font-medium border ${
              isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#121216] border-[#27272a]'
            }`}>
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: 'this_month', label: 'This Month' },
                { id: 'all', label: 'All Time' }
              ].map(r => (
                <button
                  key={r.id}
                  onClick={() => setDateRange(r.id as any)}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    dateRange === r.id
                      ? 'bg-amber-500 text-black font-semibold shadow-xs'
                      : isLight
                        ? 'text-slate-600 hover:text-slate-950 hover:bg-slate-200'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`p-4 border rounded-2xl space-y-1 ${
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#121216] border-[#27272a]'
            }`}>
              <span className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Total client companies</span>
              <div className={`text-3xl font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>{metrics?.totalCompanies ?? companies.length}</div>
              <div className="text-xs font-normal text-emerald-600 dark:text-emerald-400">{metrics?.activeCompanies ?? companies.length} active relationships</div>
            </div>

            <div className={`p-4 border rounded-2xl space-y-1 ${
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#121216] border-[#27272a]'
            }`}>
              <span className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Total contacts</span>
              <div className={`text-3xl font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>{metrics?.totalContacts ?? contacts.length}</div>
              <div className="text-xs font-normal text-cyan-600 dark:text-cyan-400">Linked to accounts</div>
            </div>

            <div className={`p-4 border rounded-2xl space-y-1 ${
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#121216] border-[#27272a]'
            }`}>
              <span className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Open tasks & meetings</span>
              <div className="text-3xl font-bold text-amber-600 dark:text-amber-400 tracking-tight">{metrics?.openTasks ?? 0}</div>
              <div className="text-xs font-normal text-red-600 dark:text-red-400">{metrics?.overdueTasks ?? 0} overdue actions</div>
            </div>

            <div className={`p-4 border rounded-2xl space-y-1 ${
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#121216] border-[#27272a]'
            }`}>
              <span className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Client deliverables</span>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 tracking-tight">
                {workItems.filter(w => w.status === 'IN_PROGRESS' || w.status === 'TODO').length}
              </div>
              <div className={`text-xs font-normal ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>{workItems.filter(w => w.status === 'COMPLETED').length} completed</div>
            </div>
          </div>

          {/* Urgent Tasks & Live Activity Stream */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`p-5 border rounded-2xl space-y-4 ${
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#09090b] border-[#18181b]'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <h3 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Urgent tasks & meetings
                  </h3>
                </div>
                <button
                  onClick={() => setActiveSubTab('tasks')}
                  className="text-xs text-amber-500 hover:text-amber-600 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>View All ({tasks.length})</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {urgentTasks.length === 0 ? (
                <div className={`p-8 border border-dashed rounded-xl text-center text-xs font-mono ${
                  isLight ? 'border-slate-300 bg-slate-50 text-slate-500' : 'border-[#27272a] text-zinc-500'
                }`}>
                  No upcoming urgent tasks. You're completely caught up!
                </div>
              ) : (
                <div className="space-y-2.5">
                  {urgentTasks.map(task => (
                    <div key={task.id} className={`p-3 border rounded-xl flex items-center justify-between gap-3 ${
                      isLight ? 'bg-slate-50 border-slate-200 hover:bg-slate-100' : 'bg-[#121216] border-[#27272a]'
                    }`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>{task.title}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase ${
                            isLight ? 'bg-slate-200 text-slate-700' : 'bg-zinc-800 text-zinc-300'
                          }`}>
                            {task.taskType}
                          </span>
                        </div>
                        <div className={`text-[11px] flex items-center gap-2 mt-1 truncate ${
                          isLight ? 'text-slate-500' : 'text-zinc-400'
                        }`}>
                          <span>Due: {new Date(task.dueAt).toLocaleDateString()} {new Date(task.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {task.companyName && <span>• {task.companyName}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setSelectedTaskForClose(task)}
                          className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold transition"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Activity Stream */}
            <div className={`p-5 border rounded-2xl space-y-4 ${
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#09090b] border-[#18181b]'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-500" />
                  <h3 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Live activity stream
                  </h3>
                </div>
                <button
                  onClick={() => setActiveSubTab('activity')}
                  className="text-xs text-amber-500 hover:text-amber-600 font-mono font-bold flex items-center gap-1 cursor-pointer"
                >
                  <span>View All</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {timeline.length === 0 ? (
                <div className={`p-8 border border-dashed rounded-xl text-center text-xs font-mono ${
                  isLight ? 'border-slate-300 bg-slate-50 text-slate-500' : 'border-[#27272a] text-zinc-500'
                }`}>
                  No activity logged yet.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {timeline.slice(0, 6).map(item => {
                    const rawDate = (item as any).timestamp || (item as any).createdAt;
                    const dateDisplay = rawDate && !isNaN(new Date(rawDate).getTime()) ? new Date(rawDate).toLocaleString() : 'Recent';
                    const itemTypeDisplay = ((item as any).itemType || (item as any).type || (item as any).eventType || 'activity').toLowerCase();
                    const userDisplay = (item as any).userName || (item as any).username || 'Operator';
                    const titleDisplay = (item as any).title || (item as any).eventType || (item as any).type || 'Activity logged';

                    return (
                      <div key={item.id} className={`p-3 border rounded-xl space-y-1 ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121216] border-[#27272a]'
                      }`}>
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full font-bold uppercase bg-amber-500/10 text-amber-500">
                              {itemTypeDisplay}
                            </span>
                            <span className={`font-bold ${isLight ? 'text-slate-700' : 'text-zinc-300'}`}>{userDisplay}</span>
                          </div>
                          <span className={isLight ? 'text-slate-400' : 'text-zinc-500'}>{dateDisplay}</span>
                        </div>
                        <p className={`text-xs font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{titleDisplay}</p>
                        {item.description && (
                          <p className={`text-[11px] line-clamp-1 ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>{item.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: COMPANIES                                                      */}
      {/* ========================================================================= */}
      {activeSubTab === 'companies' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search companies by name, industry, country, or email..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={companyStatusFilter}
                onChange={(e) => setCompanyStatusFilter(e.target.value)}
                className="px-3 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>

              <select
                value={companyPaymentFilter}
                onChange={(e) => setCompanyPaymentFilter(e.target.value)}
                className="px-3 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Payments</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
              </select>

              <button
                onClick={() => setShowAddCompany(true)}
                className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Company</span>
              </button>
            </div>
          </div>

          {/* Companies Table */}
          <div className="border border-[#1f1f23] rounded-2xl overflow-hidden bg-[#0a0a0d]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#121216] border-b border-[#1f1f23] text-xs font-semibold text-zinc-400">
                    <th className="py-3.5 px-4">Company Name</th>
                    <th className="py-3.5 px-4">Industry / Region</th>
                    <th className="py-3.5 px-4 text-center">Contacts</th>
                    <th className="py-3.5 px-4 text-center">Leads</th>
                    <th className="py-3.5 px-4 text-center">Open Tasks</th>
                    <th className="py-3.5 px-4">Payment</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#18181c] text-xs">
                  {filteredCompanies.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-zinc-500 font-mono">
                        No client companies match the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredCompanies.map(c => (
                      <tr
                        key={c.id}
                        className="hover:bg-[#121216]/60 transition cursor-pointer"
                        onClick={() => setSelectedCompanyId(c.id)}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-amber-500" />
                            <span>{c.name}</span>
                          </div>
                          {c.website && (
                            <span className="text-[11px] text-zinc-500 block truncate max-w-xs">{c.website}</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-zinc-300">
                          <div>{c.industry || '—'}</div>
                          {c.country && <div className="text-[11px] text-zinc-500">{c.country}</div>}
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono font-bold text-zinc-300">
                          {c.contactCount ?? 0}
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono font-bold text-emerald-400">
                          {c.leadCount ?? 0}
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono font-bold text-amber-400">
                          {c.openTaskCount ?? 0}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            c.paymentStatus === 'paid'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : c.paymentStatus === 'overdue'
                              ? 'bg-red-500/10 text-red-400 border-red-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}>
                            {c.paymentStatus?.replace('_', ' ') || 'pending'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            c.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}>
                            {c.status}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setEditingCompany(c)}
                              className="px-2.5 py-1.5 bg-[#18181b] hover:bg-[#222227] text-zinc-300 hover:text-white border border-[#27272a] rounded-lg text-xs font-mono font-bold transition flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => setSelectedCompanyId(c.id)}
                              className="px-3 py-1.5 bg-[#18181b] hover:bg-[#222227] text-amber-400 border border-[#27272a] rounded-lg text-xs font-mono font-bold transition flex items-center gap-1"
                            >
                              <span>Open</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: CONTACTS                                                       */}
      {/* ========================================================================= */}
      {activeSubTab === 'contacts' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contacts by name, email, phone, or title..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={contactCompanyFilter}
                onChange={(e) => setContactCompanyFilter(e.target.value)}
                className="px-3 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Companies</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <button
                onClick={() => setShowAddContact(true)}
                className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Contact</span>
              </button>
            </div>
          </div>

          {/* Contacts Table */}
          <div className="border border-[#1f1f23] rounded-2xl overflow-hidden bg-[#0a0a0d]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#121216] border-b border-[#1f1f23] text-xs font-semibold text-zinc-400">
                    <th className="py-3.5 px-4">Contact Person</th>
                    <th className="py-3.5 px-4">Affiliated Company</th>
                    <th className="py-3.5 px-4">Job Title</th>
                    <th className="py-3.5 px-4">Phone Number</th>
                    <th className="py-3.5 px-4">Email</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#18181c] text-xs">
                  {filteredContacts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-zinc-500 font-mono">
                        No contacts found.
                      </td>
                    </tr>
                  ) : (
                    filteredContacts.map(contact => (
                      <tr
                        key={contact.id}
                        className="hover:bg-[#121216]/60 transition cursor-pointer"
                        onClick={() => setSelectedContactId(contact.id)}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white flex items-center gap-2">
                            <Users className="w-4 h-4 text-cyan-400" />
                            <span>{contact.name}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-zinc-300">
                          {contact.companyName ? (
                            <span className="text-amber-400 font-medium">{contact.companyName}</span>
                          ) : (
                            <span className="text-zinc-500 italic">Independent</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-zinc-300">
                          {contact.roleTitle || '—'}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-zinc-300">
                          {contact.phone ? (
                            <span className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-zinc-500" />
                              <span>{contact.phone}</span>
                            </span>
                          ) : '—'}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-zinc-300">
                          {contact.email || '—'}
                        </td>

                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setEditingContact(contact)}
                              className="px-2.5 py-1.5 bg-[#18181b] hover:bg-[#222227] text-zinc-300 hover:text-white border border-[#27272a] rounded-lg text-xs font-mono font-bold transition flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => setSelectedContactId(contact.id)}
                              className="px-3 py-1.5 bg-[#18181b] hover:bg-[#222227] text-cyan-400 border border-[#27272a] rounded-lg text-xs font-mono font-bold transition flex items-center gap-1"
                            >
                              <span>Profile</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 4: CANONICAL LEADS                                                */}
      {/* ========================================================================= */}
      {activeSubTab === 'leads' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search leads by name, phone, business, or company..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={leadStatusFilter}
                onChange={(e) => setLeadStatusFilter(e.target.value)}
                className="px-3 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Pipeline Stages</option>
                <option value="NEW">New</option>
                <option value="CONTACTED">Contacted</option>
                <option value="QUALIFIED">Qualified</option>
                <option value="PROPOSAL">Proposal</option>
                <option value="NEGOTIATION">Negotiation</option>
                <option value="WON">Won / Converted</option>
                <option value="LOST">Lost</option>
              </select>

              <select
                value={leadCampaignFilter}
                onChange={(e) => setLeadCampaignFilter(e.target.value)}
                className="px-3 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Campaigns</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <button
                onClick={() => setShowAddLead(true)}
                className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Lead</span>
              </button>
            </div>
          </div>

          {/* Leads Table */}
          <div className="border border-[#1f1f23] rounded-2xl overflow-hidden bg-[#0a0a0d]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#121216] border-b border-[#1f1f23] text-xs font-semibold text-zinc-400">
                    <th className="py-3.5 px-4">Lead Name / Business</th>
                    <th className="py-3.5 px-4">Phone Number</th>
                    <th className="py-3.5 px-4">Company Affiliation</th>
                    <th className="py-3.5 px-4">Pipeline Status</th>
                    <th className="py-3.5 px-4">Calls Made</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#18181c] text-xs">
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-zinc-500 font-mono">
                        No canonical leads found.
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map(lead => (
                      <tr
                        key={lead.id}
                        className="hover:bg-[#121216]/60 transition cursor-pointer"
                        onClick={() => setSelectedLeadId(lead.id)}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white flex items-center gap-2">
                            <Phone className="w-4 h-4 text-amber-400" />
                            <span>{lead.name || lead.businessName || 'Lead'}</span>
                          </div>
                          {lead.businessName && lead.name && lead.businessName !== lead.name && (
                            <span className="text-[11px] text-zinc-500 block">{lead.businessName}</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-zinc-300">
                          {lead.phone || '—'}
                        </td>

                        <td className="py-3.5 px-4 text-zinc-300">
                          {lead.companyName ? (
                            <span className="text-amber-400 font-medium">{lead.companyName}</span>
                          ) : (
                            <span className="text-zinc-500 italic">Unlinked</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            lead.status === 'WON'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : lead.status === 'LOST'
                              ? 'bg-red-500/10 text-red-400 border-red-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}>
                            {lead.status || 'NEW'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-zinc-300">
                          {lead.callCount ?? 0}
                        </td>

                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {lead.phone && onDialLead && (
                              <button
                                onClick={() => onDialLead(lead.phone, lead.id, lead.name || 'Lead')}
                                className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1"
                              >
                                <PhoneCall className="w-3 h-3" />
                                <span>Dial</span>
                              </button>
                            )}
                            <button
                              onClick={() => setEditingLead(lead)}
                              className="px-2.5 py-1.5 bg-[#18181b] hover:bg-[#222227] text-zinc-300 hover:text-white border border-[#27272a] rounded-lg text-xs font-mono font-bold transition flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => setSelectedLeadId(lead.id)}
                              className="px-3 py-1.5 bg-[#18181b] hover:bg-[#222227] text-amber-400 border border-[#27272a] rounded-lg text-xs font-mono font-bold transition flex items-center gap-1"
                            >
                              <span>Drawer</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 5: TASKS                                                          */}
      {/* ========================================================================= */}
      {activeSubTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks by title, instructions, or company..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={taskTypeFilter}
                onChange={(e) => setTaskTypeFilter(e.target.value)}
                className="px-3 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Task Types</option>
                <option value="call">Calls</option>
                <option value="follow_up">Follow-ups</option>
                <option value="meeting">Meetings</option>
                <option value="email">Emails</option>
                <option value="payment">Payments</option>
              </select>

              <select
                value={taskStatusFilter}
                onChange={(e) => setTaskStatusFilter(e.target.value)}
                className="px-3 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
                <option value="completed">Completed</option>
              </select>

              <select
                value={taskPriorityFilter}
                onChange={(e) => setTaskPriorityFilter(e.target.value)}
                className="px-3 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Priorities</option>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>

              <button
                onClick={() => setShowCreateTask(true)}
                className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Task</span>
              </button>
            </div>
          </div>

          {/* Tasks Table */}
          <div className="border border-[#1f1f23] rounded-2xl overflow-hidden bg-[#0a0a0d]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#121216] border-b border-[#1f1f23] text-xs font-semibold text-zinc-400">
                    <th className="py-3.5 px-4">Task Title & Details</th>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4">Priority</th>
                    <th className="py-3.5 px-4">Due Date</th>
                    <th className="py-3.5 px-4">Linked Account</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#18181c] text-xs">
                  {filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-zinc-500 font-mono">
                        No tasks match the filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map(task => {
                      const isOverdue = task.status !== 'completed' && task.status !== 'cancelled' && Boolean(task.dueAt) && !isNaN(new Date(task.dueAt).getTime()) && new Date(task.dueAt).getTime() < Date.now();
                      return (
                        <tr key={task.id} className={`transition ${isOverdue ? 'bg-red-950/20 border-l-4 border-l-red-500 hover:bg-red-950/30' : 'hover:bg-[#121216]/60'}`}>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{task.title}</span>
                              {isOverdue && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                                  🚨 OVERDUE
                                </span>
                              )}
                            </div>
                            {task.description && (
                              <div className="text-[11px] text-zinc-400 line-clamp-1">{task.description}</div>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-zinc-800 text-zinc-300">
                              {task.taskType}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                              task.priority === 'urgent' ? 'bg-red-500/20 text-red-400' :
                              task.priority === 'high' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-zinc-800 text-zinc-400'
                            }`}>
                              {task.priority}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-zinc-300">
                            <div className="flex flex-col gap-1 items-start">
                              {task.dueAt && !isNaN(new Date(task.dueAt).getTime()) ? (
                                <>
                                  <span className="text-[11px] text-zinc-400">
                                    {`${new Date(task.dueAt).toLocaleDateString()} ${new Date(task.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                  </span>
                                  <TaskTimerBadge dueAt={task.dueAt} status={task.status} />
                                </>
                              ) : (
                                <>
                                  <span className="text-[11px] text-zinc-500">No deadline</span>
                                  {(task.status === 'completed' || task.status === 'cancelled') && (
                                    <TaskTimerBadge dueAt="" status={task.status} />
                                  )}
                                </>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-zinc-300">
                            {task.companyName || task.leadName || '—'}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                              task.status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : isOverdue
                                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            }`}>
                              {task.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {task.status !== 'completed' && (
                                <>
                                  <button
                                    onClick={() => setSelectedTaskForClose(task)}
                                    className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold transition"
                                    title="Close task with outcome notes"
                                  >
                                    Close
                                  </button>
                                  <button
                                    onClick={() => setSelectedTaskForReschedule(task)}
                                    className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold transition"
                                    title="Reschedule task"
                                  >
                                    Reschedule
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => setEditingTask(task)}
                                className="px-2 py-1 bg-[#18181b] hover:bg-[#222227] text-zinc-300 border border-[#27272a] rounded-lg text-xs font-mono font-bold transition"
                              >
                                Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 6: MEETINGS (Dedicated)                                          */}
      {/* ========================================================================= */}
      {activeSubTab === 'meetings' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search scheduled meetings by agenda or attendee..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              onClick={() => setShowCreateTask(true)}
              className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition shrink-0"
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Schedule New Meeting</span>
            </button>
          </div>

          {/* Meetings Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMeetings.length === 0 ? (
              <div className="col-span-full p-12 border border-dashed border-[#27272a] rounded-2xl text-center text-zinc-500 font-mono text-xs">
                No meetings scheduled. Click "Schedule New Meeting" to set up an agenda.
              </div>
            ) : (
              filteredMeetings.map(meeting => {
                const isOnline = meeting.taskType === 'online_meeting';
                return (
                  <div key={meeting.id} className="p-4 bg-[#121216] border border-[#27272a] rounded-2xl flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase flex items-center gap-1 ${
                          isOnline ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {isOnline ? <Video className="w-3 h-3" /> : <CalendarCheck className="w-3 h-3" />}
                          {isOnline ? 'Online Meeting' : 'In-Person'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          meeting.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                          {meeting.status}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-white mb-1">{meeting.title}</h4>
                      {meeting.description && (
                        <p className="text-xs text-zinc-400 line-clamp-2 mb-2">{meeting.description}</p>
                      )}

                      <div className="text-[11px] text-zinc-400 space-y-1 font-mono pt-2 border-t border-[#1f1f23]">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                          <span>{new Date(meeting.dueAt).toLocaleString()}</span>
                        </div>
                        {meeting.companyName && (
                          <div className="flex items-center gap-1.5 text-amber-400">
                            <Building2 className="w-3.5 h-3.5" />
                            <span>{meeting.companyName}</span>
                          </div>
                        )}
                        {meeting.leadName && (
                          <div className="flex items-center gap-1.5 text-zinc-300">
                            <Phone className="w-3.5 h-3.5 text-zinc-500" />
                            <span>{meeting.leadName}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#1f1f23] flex items-center justify-end gap-1.5">
                      {meeting.status !== 'completed' && (
                        <button
                          onClick={() => setSelectedTaskForClose(meeting)}
                          className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition"
                        >
                          Close / Notes
                        </button>
                      )}
                      <button
                        onClick={() => setEditingTask(meeting)}
                        className="px-2.5 py-1.5 bg-[#18181b] hover:bg-[#202025] text-zinc-300 border border-[#27272a] rounded-xl text-xs font-bold transition"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 7: CLIENT WORK (Pipeline / Kanban / List)                         */}
      {/* ========================================================================= */}
      {activeSubTab === 'client-work' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search work deliverables, projects, or tasks..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              onClick={() => setShowCreateWorkItem(true)}
              className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Work Item</span>
            </button>
          </div>

          {/* Status Pipeline Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'ALL', label: 'All Items' },
              { id: 'TODO', label: 'To Do' },
              { id: 'IN_PROGRESS', label: 'In Progress' },
              { id: 'PENDING', label: 'Pending Client' },
              { id: 'SHORTLISTED', label: 'Shortlisted' },
              { id: 'COMPLETED', label: 'Completed' },
              { id: 'REJECTED', label: 'Rejected' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setWorkStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
                  workStatusFilter === tab.id
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/10'
                    : 'bg-[#121216] text-zinc-400 hover:text-white border border-[#27272a]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Work Items Table */}
          <div className="border border-[#1f1f23] rounded-2xl overflow-hidden bg-[#0a0a0d]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#121216] border-b border-[#1f1f23] text-xs font-semibold text-zinc-400">
                    <th className="py-3.5 px-4">Title & Scope</th>
                    <th className="py-3.5 px-4">Category</th>
                    <th className="py-3.5 px-4">Client Company</th>
                    <th className="py-3.5 px-4">Priority</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Assignee</th>
                    <th className="py-3.5 px-4 text-right">Quick Pipeline & Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#18181c] text-xs">
                  {filteredWorkItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-zinc-500 font-mono">
                        No client work items found for the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredWorkItems.map(item => (
                      <tr key={item.id} className="hover:bg-[#121216]/60 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white">{item.title}</div>
                          {item.description && (
                            <div className="text-[11px] text-zinc-400 line-clamp-1">{item.description}</div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-zinc-300">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-zinc-800 text-zinc-300">
                            {item.category}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-amber-400 font-medium">
                          {item.companyName || '—'}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                            item.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                            item.priority === 'high' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-zinc-800 text-zinc-400'
                          }`}>
                            {item.priority}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            item.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                            item.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                            item.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                            'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}>
                            {item.status.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-zinc-300">
                          {item.assignedUserName || 'Unassigned'}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {item.status !== 'COMPLETED' && (
                              <button
                                onClick={() => handleUpdateWorkStatus(item.id, 'COMPLETED')}
                                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold transition flex items-center gap-1"
                                title="Mark as Completed"
                              >
                                <Check className="w-3 h-3" />
                                <span>Complete</span>
                              </button>
                            )}
                            <button
                              onClick={() => setEditingWorkItem(item)}
                              className="px-2 py-1 bg-[#18181b] hover:bg-[#202025] text-zinc-300 border border-[#27272a] rounded-lg text-xs font-bold transition"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 8: QUOTES & PRICE CALCULATOR                                      */}
      {/* ========================================================================= */}
      {activeSubTab === 'quotes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search quotes by number, client, or package tier..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={quoteStatusFilter}
                onChange={(e) => setQuoteStatusFilter(e.target.value)}
                className="px-3 py-2.5 bg-[#121216] border border-[#27272a] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">All Quotes</option>
                <option value="DRAFT">Draft</option>
                <option value="SENT">Sent</option>
                <option value="ACCEPTED">Accepted / Won</option>
                <option value="REJECTED">Rejected</option>
              </select>

              {isOwner && (
                <button
                  onClick={() => setShowPricingRules(true)}
                  className="px-3.5 py-2.5 bg-[#18181b] hover:bg-[#222227] text-amber-400 border border-amber-500/40 font-bold text-xs rounded-xl flex items-center gap-1.5 transition shrink-0"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Configure Base Pricing</span>
                </button>
              )}

              <button
                onClick={() => setShowQuoteBuilder(true)}
                className="px-3.5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition shrink-0 shadow-lg shadow-amber-500/20"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>New Quote & Price Calculator</span>
              </button>
            </div>
          </div>

          {/* Quotes Table */}
          <div className="border border-[#1f1f23] rounded-2xl overflow-hidden bg-[#0a0a0d]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#121216] border-b border-[#1f1f23] text-xs font-semibold text-zinc-400">
                    <th className="py-3.5 px-4">Quote #</th>
                    <th className="py-3.5 px-4">Client Company / Contact</th>
                    <th className="py-3.5 px-4">Tier & Seats</th>
                    <th className="py-3.5 px-4">Cycle</th>
                    <th className="py-3.5 px-4">Discount</th>
                    <th className="py-3.5 px-4">Total Amount</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#18181c] text-xs">
                  {filteredQuotes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-zinc-500 font-mono">
                        No quotes created yet. Use the Quote Builder above to generate pricing.
                      </td>
                    </tr>
                  ) : (
                    filteredQuotes.map(quote => (
                      <tr key={quote.id} className="hover:bg-[#121216]/60 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                          {quote.quoteNumber}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white">{quote.companyName || quote.contactName || 'Direct Quote'}</div>
                          {quote.contactName && quote.companyName && (
                            <div className="text-[11px] text-zinc-400">{quote.contactName}</div>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-bold text-zinc-200">{quote.packageName || 'Custom Tier'}</span>
                          <span className="text-[11px] text-zinc-500 block">({quote.userCount} seats)</span>
                        </td>

                        <td className="py-3.5 px-4 font-mono uppercase text-zinc-300">
                          {quote.billingCycle}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-zinc-300">
                          {quote.discountPct > 0 ? (
                            <span className="text-emerald-400 font-bold">{quote.discountPct}% off</span>
                          ) : '0%'}
                        </td>

                        <td className="py-3.5 px-4 font-mono font-black text-amber-400">
                          ${quote.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            quote.status === 'ACCEPTED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                            quote.status === 'SENT' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                            quote.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                            'bg-zinc-800 text-zinc-300 border-zinc-700'
                          }`}>
                            {quote.status}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {quote.status === 'DRAFT' && (
                              <button
                                onClick={() => handleUpdateQuoteStatus(quote.id, 'SENT')}
                                className="px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold transition"
                              >
                                Mark Sent
                              </button>
                            )}
                            {quote.status === 'SENT' && (
                              <button
                                onClick={() => handleUpdateQuoteStatus(quote.id, 'ACCEPTED')}
                                className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold transition"
                              >
                                Mark Won
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 9: PERFORMANCE DASHBOARD (Scoped)                                 */}
      {/* ========================================================================= */}
      {activeSubTab === 'performance' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              <h2 className="text-sm font-mono font-black uppercase text-white tracking-wide">
                Sales & Telephony Performance Scorecard
              </h2>
            </div>

            <div className="flex items-center gap-1.5 bg-[#121216] border border-[#27272a] p-1 rounded-xl text-xs font-mono">
              {[
                { id: 'today', label: 'Today' },
                { id: 'this_week', label: 'This Week' },
                { id: 'this_month', label: 'This Month' },
                { id: 'all_time', label: 'All Time' },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setPerformancePeriod(p.id as any)}
                  className={`px-3 py-1 rounded-lg transition ${
                    performancePeriod === p.id ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Performance Summary Cards */}
          {performance?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-[#121216] border border-[#27272a] rounded-2xl space-y-1">
                <span className="text-xs font-medium text-zinc-400">Total calls dialed</span>
                <div className="text-3xl font-bold text-white tracking-tight">{performance.summary.totalCalls}</div>
                <div className="text-xs font-normal text-emerald-400">
                  {performance.summary.totalAnsweredCalls} answered ({performance.summary.answerRate}%)
                </div>
              </div>

              <div className="p-4 bg-[#121216] border border-[#27272a] rounded-2xl space-y-1">
                <span className="text-xs font-medium text-zinc-400">Tasks & meetings conducted</span>
                <div className="text-3xl font-bold text-amber-400 tracking-tight">
                  {performance.summary.totalTasksCompleted}
                </div>
                <div className="text-xs font-normal text-cyan-400">
                  {performance.summary.totalMeetingsConducted} meetings held
                </div>
              </div>

              <div className="p-4 bg-[#121216] border border-[#27272a] rounded-2xl space-y-1">
                <span className="text-xs font-medium text-zinc-400">Client deliverables completed</span>
                <div className="text-3xl font-bold text-blue-400 tracking-tight">
                  {performance.summary.totalWorkCompleted}
                </div>
                <div className="text-xs font-normal text-zinc-400">Deliverables closed</div>
              </div>

              <div className="p-4 bg-[#121216] border border-[#27272a] rounded-2xl space-y-1">
                <span className="text-xs font-medium text-zinc-400">Won revenue & quotes</span>
                <div className="text-3xl font-bold text-emerald-400 tracking-tight">
                  ${performance.summary.totalWonValue.toLocaleString()}
                </div>
                <div className="text-xs font-normal text-zinc-400">
                  {performance.summary.totalQuotesWon} / {performance.summary.totalQuotesCreated} quotes won ({performance.summary.conversionRate}%)
                </div>
              </div>
            </div>
          )}

          {/* Agent Breakdown Leaderboard (Owner & Team Lead only) */}
          {performance?.agentBreakdown && performance.agentBreakdown.length > 0 && (
            <div className="p-5 bg-[#09090b] border border-[#18181b] rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-500" />
                  <span>Agent performance breakdown</span>
                </h3>
                <span className="text-[11px] font-mono text-zinc-400">
                  {performance.isOwner ? 'Company-wide Team' : 'My Team Members'}
                </span>
              </div>

              <div className="border border-[#1f1f23] rounded-xl overflow-hidden bg-[#0a0a0d]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#121216] border-b border-[#1f1f23] text-xs font-semibold text-zinc-400">
                      <th className="py-3 px-4">Agent Name</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4 text-center">Leads Assigned</th>
                      <th className="py-3 px-4 text-center">Calls Made</th>
                      <th className="py-3 px-4 text-center">Tasks Done</th>
                      <th className="py-3 px-4 text-center">Meetings</th>
                      <th className="py-3 px-4 text-center">Work Done</th>
                      <th className="py-3 px-4 text-right">Won Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#18181c] text-xs">
                    {performance.agentBreakdown.map(agent => (
                      <tr key={agent.userId} className="hover:bg-[#121216]/60 transition">
                        <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-amber-400" />
                          <span>{agent.username}</span>
                        </td>
                        <td className="py-3 px-4 text-zinc-400 uppercase font-mono text-[10px]">
                          {agent.role}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-zinc-300">
                          {agent.leadsAssigned}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-zinc-300">
                          {agent.callsMade}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-zinc-300">
                          {agent.tasksCompleted}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-cyan-400">
                          {agent.meetingsConducted}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-blue-400">
                          {agent.workCompleted}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          ${agent.wonValue.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 10: UNIFIED ACTIVITY                                              */}
      {/* ========================================================================= */}
      {activeSubTab === 'activity' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-500" />
              <span>Audit Trail & Unified CRM Events</span>
            </h3>
            <span className="text-xs text-zinc-500 font-mono">Showing last 50 events</span>
          </div>

          <div className="border border-[#1f1f23] rounded-2xl bg-[#0a0a0d] p-4 space-y-3">
            {timeline.length === 0 ? (
              <div className="p-12 text-center text-zinc-500 font-mono text-xs">
                No activity records logged.
              </div>
            ) : (
              timeline.map(item => {
                const rawDate = (item as any).timestamp || (item as any).createdAt;
                const dateDisplay = rawDate && !isNaN(new Date(rawDate).getTime()) ? new Date(rawDate).toLocaleString() : 'Recent';
                const itemTypeDisplay = ((item as any).itemType || (item as any).type || (item as any).eventType || 'activity').toLowerCase();
                const userDisplay = (item as any).userName || (item as any).username || 'Operator';
                const titleDisplay = (item as any).title || (item as any).eventType || (item as any).type || 'Activity logged';

                return (
                  <div key={item.id} className="p-3.5 bg-[#121216] border border-[#27272a] rounded-xl flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase ${
                          itemTypeDisplay.includes('call') ? 'bg-emerald-500/10 text-emerald-400' :
                          itemTypeDisplay.includes('task') || itemTypeDisplay.includes('meeting') ? 'bg-amber-500/10 text-amber-400' :
                          'bg-cyan-500/10 text-cyan-400'
                        }`}>
                          {itemTypeDisplay}
                        </span>
                        <span className="text-xs font-bold text-white">{titleDisplay}</span>
                      </div>
                      {item.description && (
                        <p className="text-xs text-zinc-400">{item.description}</p>
                      )}
                      <div className="text-[10px] text-zinc-500 font-mono">
                        Logged by: <span className="text-zinc-300">{userDisplay}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                      {dateDisplay}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWERS                                                                   */}
      {/* ========================================================================= */}
      {selectedCompanyId && (
        <CompanyProfileDrawer
          isLight={isLight}
          companyId={selectedCompanyId}
          isOpen={true}
          onClose={() => setSelectedCompanyId(null)}
          serverUrl={serverUrl}
          authToken={authToken}
          onDialPhone={onDialLead}
          onOpenLead={(leadId) => setSelectedLeadId(leadId)}
          users={users}
        />
      )}

      {selectedLeadId && (
        <LeadProfileDrawer
          isLight={isLight}
          leadId={selectedLeadId}
          isOpen={true}
          onClose={() => setSelectedLeadId(null)}
          serverUrl={serverUrl}
          authToken={authToken}
          onDialLead={onDialLead}
          onOpenCompany={(companyId) => setSelectedCompanyId(companyId)}
          users={users}
        />
      )}

      {selectedContactId && (
        <ContactProfileDrawer
          isLight={isLight}
          contactId={selectedContactId}
          isOpen={true}
          onClose={() => setSelectedContactId(null)}
          serverUrl={serverUrl}
          authToken={authToken}
          onDialPhone={onDialLead}
          onOpenCompany={(companyId) => setSelectedCompanyId(companyId)}
          onOpenLead={(leadId) => setSelectedLeadId(leadId)}
          onEditContact={(c) => setEditingContact(c)}
          onOpenQuoteBuilder={() => {
            setShowQuoteBuilder(true);
          }}
          users={users}
        />
      )}

      {/* ========================================================================= */}
      {/* CREATION MODALS                                                           */}
      {/* ========================================================================= */}
      {showAddCompany && (
        <AddCompanyModal
          isOpen={true}
          onClose={() => setShowAddCompany(false)}
          onSuccess={() => {
            setShowAddCompany(false);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
          users={users}
        />
      )}

      {showAddContact && (
        <AddContactModal
          isOpen={true}
          companies={companies.map(c => ({ id: c.id, name: c.name }))}
          onClose={() => setShowAddContact(false)}
          onSuccess={() => {
            setShowAddContact(false);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
          users={users}
        />
      )}

      {showAddLead && (
        <AddLeadModal
          isOpen={true}
          companies={companies.map(c => ({ id: c.id, name: c.name }))}
          campaigns={campaigns.map(c => ({ id: c.id, name: c.name }))}
          onClose={() => setShowAddLead(false)}
          onSuccess={() => {
            setShowAddLead(false);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
          onDialLead={onDialLead}
        />
      )}

      {showCreateTask && (
        <CreateTaskModal
          isOpen={true}
          defaultTaskType={activeSubTab === 'meetings' ? 'meeting' : 'follow_up'}
          companies={companies.map(c => ({ id: c.id, name: c.name }))}
          leads={leads.map(l => ({ id: l.id, name: l.name || l.businessName || 'Lead' }))}
          users={users}
          onClose={() => setShowCreateTask(false)}
          onSuccess={() => {
            setShowCreateTask(false);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {showCreateWorkItem && (
        <CreateWorkItemModal
          isOpen={true}
          companies={companies}
          contacts={contacts}
          users={users}
          onClose={() => setShowCreateWorkItem(false)}
          onSuccess={() => {
            setShowCreateWorkItem(false);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {showQuoteBuilder && (
        <QuoteBuilderModal
          isOpen={true}
          userRole={userRole}
          companies={companies}
          contacts={contacts}
          leads={leads}
          onClose={() => setShowQuoteBuilder(false)}
          onSuccess={() => {
            setShowQuoteBuilder(false);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {showPricingRules && (
        <PricingRulesModal
          isOpen={true}
          onClose={() => setShowPricingRules(false)}
          onSuccess={() => {
            setShowPricingRules(false);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {/* ========================================================================= */}
      {/* EDIT MODALS                                                               */}
      {/* ========================================================================= */}
      {editingCompany && (
        <EditCompanyModal
          isOpen={true}
          company={editingCompany}
          onClose={() => setEditingCompany(null)}
          onSuccess={() => {
            setEditingCompany(null);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {editingContact && (
        <EditContactModal
          isOpen={true}
          contact={editingContact}
          companies={companies}
          users={users}
          onClose={() => setEditingContact(null)}
          onSuccess={() => {
            setEditingContact(null);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {editingLead && (
        <EditLeadCrmModal
          isOpen={true}
          lead={editingLead}
          companies={companies}
          contacts={contacts}
          users={users}
          onClose={() => setEditingLead(null)}
          onSuccess={() => {
            setEditingLead(null);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {editingTask && (
        <EditTaskModal
          isOpen={true}
          task={editingTask}
          users={users}
          onClose={() => setEditingTask(null)}
          onSuccess={() => {
            setEditingTask(null);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {editingWorkItem && (
        <EditWorkItemModal
          isOpen={true}
          workItem={editingWorkItem}
          companies={companies}
          contacts={contacts}
          users={users}
          onClose={() => setEditingWorkItem(null)}
          onSuccess={() => {
            setEditingWorkItem(null);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}

      {/* ========================================================================= */}
      {/* TASK ACTION MODALS                                                        */}
      {/* ========================================================================= */}
      {selectedTaskForClose && (
        <CloseTaskModal
          isOpen={true}
          task={selectedTaskForClose}
          onClose={() => setSelectedTaskForClose(null)}
          onSuccess={() => {
            setSelectedTaskForClose(null);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
          users={users}
        />
      )}

      {selectedTaskForReschedule && (
        <RescheduleTaskModal
          isOpen={true}
          task={selectedTaskForReschedule}
          onClose={() => setSelectedTaskForReschedule(null)}
          onSuccess={() => {
            setSelectedTaskForReschedule(null);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
          users={users}
        />
      )}

      {selectedTaskForCancel && (
        <CancelTaskModal
          isOpen={true}
          task={selectedTaskForCancel}
          onClose={() => setSelectedTaskForCancel(null)}
          onSuccess={() => {
            setSelectedTaskForCancel(null);
            fetchCRMData();
          }}
          serverUrl={serverUrl}
          authToken={authToken}
        />
      )}
    </div>
  );
};
