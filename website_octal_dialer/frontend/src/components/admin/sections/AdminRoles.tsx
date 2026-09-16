import React, { useState, useEffect, useMemo } from 'react';
import {
  Lock, Search, Plus, Minus, Users, Edit, Trash2, ArrowLeft,
  CheckCircle2, XCircle, ChevronLeft, ChevronRight, Shield,
  Check, AlertCircle, RefreshCw
} from 'lucide-react';

export interface PermissionItem {
  id: string;
  label: string;
}

export interface PermissionCategory {
  id: string;
  label: string;
  items: PermissionItem[];
}

export interface PermissionSection {
  title: string;
  categories: PermissionCategory[];
}

// ─── Octal Dialer Canonical Permission Catalog ───────────────────────────────
export const DIALER_PERMISSION_SECTIONS: PermissionSection[] = [
  {
    title: 'FORMS',
    categories: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        items: [
          { id: 'dashboard:view', label: 'View Dashboard & Real-time Metrics' },
          { id: 'dashboard:export_stats', label: 'Export Dashboard KPI Reports' }
        ]
      },
      {
        id: 'campaigns',
        label: 'Campaigns',
        items: [
          { id: 'campaigns:view', label: 'View Campaigns Directory' },
          { id: 'campaigns:create', label: 'Create New Campaign' },
          { id: 'campaigns:edit', label: 'Edit Campaign Details & Script' },
          { id: 'campaigns:delete', label: 'Delete Campaign' },
          { id: 'campaigns:start_pause', label: 'Start / Pause / Resume Campaign' }
        ]
      },
      {
        id: 'leads',
        label: 'Leads',
        items: [
          { id: 'leads:view', label: 'View Leads List' },
          { id: 'leads:import', label: 'Import Leads via CSV / Excel' },
          { id: 'leads:edit', label: 'Edit Lead Information' },
          { id: 'leads:delete', label: 'Delete Lead Records' },
          { id: 'leads:export', label: 'Export Leads to CSV' }
        ]
      },
      {
        id: 'calls',
        label: 'Calls & Auto Dialer',
        items: [
          { id: 'calls:view_queue', label: 'Access Lead Queue & Dialer Screen' },
          { id: 'calls:dial_outbound', label: 'Trigger Outbound GSM Calls' },
          { id: 'calls:manual_keypad', label: 'Manual Keypad Dialing' },
          { id: 'calls:hangup_transfer', label: 'Hangup & Call Transfer' },
          { id: 'calls:log_disposition', label: 'Log Call Dispositions & Notes' }
        ]
      },
      {
        id: 'history',
        label: 'Call History',
        items: [
          { id: 'history:view_logs', label: 'View Call Detail Records (CDR)' },
          { id: 'history:listen_recordings', label: 'Listen to & Download Recordings' },
          { id: 'history:edit_disposition', label: 'Update Historical Dispositions' }
        ]
      },
      {
        id: 'devices',
        label: 'Devices & SIMs',
        items: [
          { id: 'devices:view', label: 'View Connected Android Phones' },
          { id: 'devices:pair', label: 'Pair New Calling Phone' },
          { id: 'devices:revoke', label: 'Revoke & Disconnect Devices' },
          { id: 'devices:sim_routing', label: 'Configure SIM Slot & Carrier Routing' }
        ]
      },
      {
        id: 'crm',
        label: 'CRM Workspace',
        items: [
          { id: 'crm:view', label: 'Access CRM Workspace & Contact Cards' },
          { id: 'crm:create', label: 'Create New CRM Contact' },
          { id: 'crm:edit', label: 'Edit Contact Details & Follow-ups' },
          { id: 'crm:delete', label: 'Delete CRM Contact' }
        ]
      },
      {
        id: 'users',
        label: 'Users Management',
        items: [
          { id: 'users:view', label: 'View Organization Users' },
          { id: 'users:add', label: 'Add New User Account' },
          { id: 'users:edit', label: 'Edit User Profile & Status' },
          { id: 'users:delete', label: 'Delete / Suspend User' },
          { id: 'users:reset_password', label: 'Reset User Password' }
        ]
      },
      {
        id: 'roles',
        label: 'Roles Management',
        items: [
          { id: 'roles:view', label: 'View Roles & Permission Rights' },
          { id: 'roles:add', label: 'Add New Custom Role' },
          { id: 'roles:edit', label: 'Edit Role Name & Rights' },
          { id: 'roles:delete', label: 'Delete Custom Role' }
        ]
      },
      {
        id: 'settings',
        label: 'Settings',
        items: [
          { id: 'settings:view', label: 'View Settings Directory' },
          { id: 'settings:edit', label: 'Update Organization Settings' },
          { id: 'settings:api_keys', label: 'Manage API Keys & Webhooks' }
        ]
      }
    ]
  },
  {
    title: 'REPORTS',
    categories: [
      {
        id: 'call_reports',
        label: 'Call & CDR Reports',
        items: [
          { id: 'reports:cdr_view', label: 'View Call Logs & Status History' },
          { id: 'reports:cdr_export', label: 'Export Call Detail Records to Excel' }
        ]
      },
      {
        id: 'agent_reports',
        label: 'Agent Performance',
        items: [
          { id: 'reports:agent_kpi_view', label: 'View Agent Talk Time & Outcomes' },
          { id: 'reports:agent_kpi_export', label: 'Export Agent Performance Summary' }
        ]
      },
      {
        id: 'disposition_reports',
        label: 'Disposition Breakdown',
        items: [
          { id: 'reports:disposition_stats_view', label: 'View Call Disposition Analytics' },
          { id: 'reports:disposition_stats_export', label: 'Export Disposition Breakdown' }
        ]
      },
      {
        id: 'campaign_reports',
        label: 'Campaign Summary',
        items: [
          { id: 'reports:campaign_analytics_view', label: 'View Campaign Conversion Analytics' },
          { id: 'reports:campaign_analytics_export', label: 'Export Campaign Analytics' }
        ]
      }
    ]
  },
  {
    title: 'ANALYTICAL REPORTS',
    categories: [
      {
        id: 'dnc_security',
        label: 'DNC & Compliance',
        items: [
          { id: 'security:dnc_view', label: 'View Suppression / DNC List' },
          { id: 'security:dnc_manage', label: 'Add / Remove DNC Phone Numbers' },
          { id: 'security:dnc_override', label: 'Allow Override of DNC Warnings' }
        ]
      },
      {
        id: 'data_protection',
        label: 'Data Protection & Access',
        items: [
          { id: 'security:export_unmasked', label: 'Export Full Unmasked Phone Numbers' },
          { id: 'security:ip_bypass', label: 'Bypass IP Login Restrictions' }
        ]
      }
    ]
  }
];

// Helper to extract all permission IDs
export const ALL_PERMISSION_IDS: string[] = DIALER_PERMISSION_SECTIONS.flatMap(s =>
  s.categories.flatMap(c => c.items.map(i => i.id))
);

export interface Role {
  id: string;
  name: string;
  description?: string;
  isSystem?: boolean;
  status: string;
  permissions: string[];
  createdAt?: string;
  userCount?: number;
}

interface AdminRolesProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  onNavigateUsers?: () => void;
  onBackToSettings?: () => void;
}

export const AdminRoles: React.FC<AdminRolesProps> = ({
  isLight,
  serverUrl,
  authToken,
  onNavigateUsers,
  onBackToSettings
}) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // View Mode: 'list' | 'add' | 'edit'
  const [viewMode, setViewMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  // Form State
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleStatus, setRoleStatus] = useState('Active');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${serverUrl}/api/admin/roles`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : (data.roles || []);
        const formatted: Role[] = rawList.map((r: any) => {
          let perms: string[] = [];
          if (Array.isArray(r.permissions)) {
            perms = r.permissions;
          } else if (typeof r.permissions === 'string') {
            try {
              const parsed = JSON.parse(r.permissions);
              if (Array.isArray(parsed)) {
                perms = parsed;
              } else if (parsed && typeof parsed === 'object') {
                perms = parsed.all ? ALL_PERMISSION_IDS : Object.keys(parsed).filter(k => parsed[k]);
              }
            } catch {
              perms = [];
            }
          }
          return {
            id: String(r.id),
            name: r.roleName || r.name || 'Unnamed Role',
            description: r.description || '',
            status: r.status || 'Active',
            isSystem: r.id === '1' || r.id === '2' || r.id === '3' || r.id === '4' || r.createdBy === 'system',
            permissions: perms,
            createdAt: r.createdAt,
            userCount: r.userCount || 0
          };
        });
        setRoles(formatted);
      } else {
        showToast('Failed to load roles', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error fetching roles', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, [serverUrl, authToken]);

  // ─── Open Add Role ──────────────────────────────────────────────────────────
  const handleOpenAdd = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDescription('');
    setRoleStatus('Active');
    setSelectedPermissions(new Set(['calls:view_queue', 'calls:dial_outbound', 'calls:log_disposition']));
    // Expand top categories by default
    setExpandedCategories(new Set(['dashboard', 'campaigns', 'leads', 'calls']));
    setViewMode('add');
  };

  // ─── Open Edit Role ─────────────────────────────────────────────────────────
  const handleOpenEdit = (role: Role) => {
    setEditingRole(role);
    setRoleName(role.name || '');
    setRoleDescription(role.description || '');
    setRoleStatus(role.status || 'Active');
    const permSet = role.permissions.includes('all')
      ? new Set(ALL_PERMISSION_IDS)
      : new Set(role.permissions);
    setSelectedPermissions(permSet);
    // Expand categories that have granted permissions
    const toExpand = new Set<string>();
    for (const section of DIALER_PERMISSION_SECTIONS) {
      for (const cat of section.categories) {
        if (cat.items.some(item => permSet.has(item.id))) {
          toExpand.add(cat.id);
        }
      }
    }
    setExpandedCategories(toExpand.size > 0 ? toExpand : new Set(['dashboard', 'campaigns', 'leads']));
    setViewMode('edit');
  };

  // ─── Category Accordion Toggle ──────────────────────────────────────────────
  const toggleCategoryExpand = (catId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // ─── Parent Category Checkbox Toggle ─────────────────────────────────────────
  const toggleCategoryPermissions = (category: PermissionCategory) => {
    const itemIds = category.items.map(i => i.id);
    const allSelected = itemIds.every(id => selectedPermissions.has(id));

    setSelectedPermissions(prev => {
      const next = new Set(prev);
      if (allSelected) {
        itemIds.forEach(id => next.delete(id));
      } else {
        itemIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // ─── Individual Permission Toggle ────────────────────────────────────────────
  const togglePermission = (permId: string) => {
    setSelectedPermissions(prev => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  // ─── Save Role ───────────────────────────────────────────────────────────────
  const handleSaveRole = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = roleName.trim();
    if (!cleanName) {
      showToast('Role Name is required.', 'error');
      return;
    }

    try {
      setSaving(true);
      const url = editingRole
        ? `${serverUrl}/api/admin/roles/${editingRole.id}`
        : `${serverUrl}/api/admin/roles`;
      const method = editingRole ? 'PUT' : 'POST';

      const payload = {
        roleName: cleanName,
        name: cleanName,
        description: roleDescription.trim(),
        status: roleStatus,
        permissions: Array.from(selectedPermissions)
      };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast(editingRole ? 'Role updated successfully!' : 'Role created successfully!');
        setViewMode('list');
        fetchRoles();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to save role.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error saving role.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete Role ─────────────────────────────────────────────────────────────
  const handleDeleteRole = async (role: Role) => {
    if (role.isSystem) {
      showToast('System roles cannot be deleted.', 'error');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete role "${role.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`${serverUrl}/api/admin/roles/${role.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (res.ok) {
        showToast('Role deleted successfully.');
        fetchRoles();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to delete role.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error deleting role.', 'error');
    }
  };

  // ─── Filtered Roles for List View ────────────────────────────────────────────
  const filteredRoles = useMemo(() => {
    return roles.filter(r => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
      );
    });
  }, [roles, searchQuery]);

  const totalPages = Math.ceil(filteredRoles.length / pageSize) || 1;
  const paginatedRoles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRoles.slice(start, start + pageSize);
  }, [filteredRoles, currentPage, pageSize]);

  return (
    <div className="space-y-6 select-none animate-fadeIn">
      {/* ── Toast Alert ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-mono font-bold transition-all ${
          toast.type === 'error'
            ? 'bg-red-500 text-white shadow-red-500/20'
            : 'bg-emerald-600 text-white shadow-emerald-500/20'
        }`}>
          {toast.type === 'error' ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          VIEW 1: ADD ROLE / EDIT ROLE (FULL REFERENCE SCREEN)
          Matches media_1789547992336.png - media_1789547992901.png
         ══════════════════════════════════════════════════════════════════════════ */}
      {(viewMode === 'add' || viewMode === 'edit') ? (
        <div className="space-y-6">
          {/* Top Header Row with Page Title and [Save and Close] Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="Back to Roles List"
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  isLight
                    ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                    : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className={`text-xl font-bold font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {viewMode === 'edit' ? 'Edit Role' : 'Add Role'}
                </h1>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
                  Configure role rights and module permissions
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-lg text-xs font-bold font-mono border transition-all cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveRole()}
                className="px-6 py-2 rounded-lg text-xs font-bold font-mono transition-all bg-[#00A651] hover:bg-[#008f45] text-white shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save and Close</span>
                )}
              </button>
            </div>
          </div>

          {/* Role Basic Details Container */}
          <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
          }`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Role Name * */}
              <div>
                <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                  Role Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sales Specialist"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-sans outline-none transition-all ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                      : 'bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500'
                  }`}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Operational responsibilities"
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-sans outline-none transition-all ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                      : 'bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500'
                  }`}
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                  Status
                </label>
                <select
                  value={roleStatus}
                  onChange={(e) => setRoleStatus(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-sans outline-none transition-all cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                      : 'bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500'
                  }`}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Select Rights Section Title ── */}
          <div className="pt-2">
            <h2 className={`text-base font-bold font-display ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>
              Select Rights
            </h2>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>
              Select the modules and granular actions this role has permission to access
            </p>
          </div>

          {/* ── Categorized Rights Accordion ── */}
          <div className={`rounded-2xl border shadow-sm overflow-hidden ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
          }`}>
            {DIALER_PERMISSION_SECTIONS.map((section, sIdx) => (
              <div key={section.title} className={sIdx > 0 ? 'border-t border-zinc-200 dark:border-zinc-800' : ''}>
                {/* Section Header Banner (e.g. FORMS, REPORTS, ANALYTICAL REPORTS) */}
                <div className={`py-3 px-5 border-b font-mono font-black text-xs tracking-wider ${
                  isLight
                    ? 'bg-slate-100/90 text-slate-700 border-slate-200'
                    : 'bg-[#121214] text-zinc-300 border-zinc-800/80'
                }`}>
                  {section.title}
                </div>

                {/* Categories within this Section */}
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                  {section.categories.map((category) => {
                    const isExpanded = expandedCategories.has(category.id);
                    const itemIds = category.items.map(i => i.id);
                    const selectedCount = itemIds.filter(id => selectedPermissions.has(id)).length;
                    const allSelected = selectedCount === itemIds.length;
                    const isIndeterminate = selectedCount > 0 && selectedCount < itemIds.length;

                    return (
                      <div key={category.id} className="transition-colors">
                        {/* Category Row: [+] button | Checkbox | Category Label */}
                        <div className={`flex items-center gap-3.5 py-3 px-5 hover:bg-slate-50/70 dark:hover:bg-zinc-900/40 transition-colors ${
                          isExpanded ? 'bg-slate-50/40 dark:bg-zinc-900/20' : ''
                        }`}>
                          {/* [+] / [-] Toggle Button */}
                          <button
                            type="button"
                            onClick={() => toggleCategoryExpand(category.id)}
                            className={`w-6 h-6 rounded flex items-center justify-center font-mono font-bold text-xs border transition-all cursor-pointer ${
                              isLight
                                ? 'border-slate-300 hover:border-slate-400 text-slate-600 bg-white shadow-xs'
                                : 'border-zinc-700 hover:border-zinc-500 text-zinc-300 bg-zinc-800'
                            }`}
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          </button>

                          {/* Category Select-All Checkbox */}
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = isIndeterminate;
                            }}
                            onChange={() => toggleCategoryPermissions(category)}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer"
                          />

                          {/* Category Label */}
                          <div
                            onClick={() => toggleCategoryExpand(category.id)}
                            className={`flex-1 text-sm font-semibold cursor-pointer select-none ${
                              isLight ? 'text-slate-800' : 'text-zinc-200'
                            }`}
                          >
                            <span>{category.label}</span>
                            <span className="text-[11px] font-mono font-normal ml-2 opacity-50">
                              ({selectedCount}/{itemIds.length} rights)
                            </span>
                          </div>
                        </div>

                        {/* Indented Sub-items / Granular Rights */}
                        {isExpanded && (
                          <div className={`pl-14 pr-6 py-3 border-t space-y-2.5 ${
                            isLight
                              ? 'bg-slate-50/80 border-slate-200/80'
                              : 'bg-zinc-950/60 border-zinc-800/60'
                          }`}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {category.items.map((item) => {
                                const isChecked = selectedPermissions.has(item.id);
                                return (
                                  <label
                                    key={item.id}
                                    className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                                      isChecked
                                        ? isLight
                                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium'
                                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-medium'
                                        : isLight
                                          ? 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => togglePermission(item.id)}
                                      className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer"
                                    />
                                    <span className="truncate">{item.label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Action Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-5 py-2.5 rounded-lg text-xs font-bold font-mono border transition-all cursor-pointer ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
              }`}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveRole()}
              className="px-6 py-2.5 rounded-lg text-xs font-bold font-mono transition-all bg-[#00A651] hover:bg-[#008f45] text-white shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save and Close</span>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════════════
            VIEW 2: ROLES LIST TABLE
           ══════════════════════════════════════════════════════════════════════════ */
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            <div>
              <h1 className={`text-2xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Roles Management
              </h1>
              <p className={`text-xs mt-1 font-medium ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                Manage system roles, granular permissions, and operational access rights
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {onNavigateUsers && (
                <button
                  type="button"
                  onClick={onNavigateUsers}
                  className={`px-4 py-2 rounded-xl text-xs font-bold font-mono border transition-all cursor-pointer flex items-center gap-2 ${
                    isLight
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Manage Users</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenAdd}
                className="px-5 py-2 rounded-xl text-xs font-bold font-mono transition-all bg-[#00A651] hover:bg-[#008f45] text-white shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Role</span>
              </button>
            </div>
          </div>

          {/* Search Bar & Page Size */}
          <div className={`p-4 rounded-2xl border shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
          }`}>
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search roles..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full pl-9 pr-4 py-2 rounded-xl border text-xs font-sans outline-none transition-all ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-900 focus:bg-white focus:border-emerald-500'
                    : 'bg-zinc-900/60 border-zinc-800 text-white focus:bg-zinc-900 focus:border-emerald-500'
                }`}
              />
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className={isLight ? 'text-slate-500' : 'text-zinc-400'}>Show</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1.5 rounded-lg border outline-none font-bold cursor-pointer ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-700'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                }`}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className={isLight ? 'text-slate-500' : 'text-zinc-400'}>entries</span>
            </div>
          </div>

          {/* Roles Table */}
          <div className={`rounded-2xl border shadow-sm overflow-hidden ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className={`border-b font-mono font-bold uppercase tracking-wider text-[11px] ${
                  isLight
                    ? 'bg-slate-50 text-slate-500 border-slate-200'
                    : 'bg-zinc-950/60 text-zinc-400 border-zinc-800'
                }`}>
                  <tr>
                    <th className="py-3.5 px-4">Role Name</th>
                    <th className="py-3.5 px-4">Description</th>
                    <th className="py-3.5 px-4 text-center">Assigned Users</th>
                    <th className="py-3.5 px-4 text-center">Rights Granted</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-medium">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-zinc-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 opacity-60" />
                        <span>Loading roles...</span>
                      </td>
                    </tr>
                  ) : paginatedRoles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-zinc-400">
                        No roles match your search.
                      </td>
                    </tr>
                  ) : (
                    paginatedRoles.map((role) => {
                      const rightsCount = role.permissions.includes('all')
                        ? 'All Rights'
                        : `${role.permissions.length} rights`;

                      return (
                        <tr
                          key={role.id}
                          className="hover:bg-slate-50/60 dark:hover:bg-zinc-900/40 transition-colors"
                        >
                          {/* Role Name */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                {role.name}
                              </span>
                              {role.isSystem && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                                  System
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Description */}
                          <td className="py-3.5 px-4 text-zinc-400 max-w-xs truncate">
                            {role.description || '—'}
                          </td>

                          {/* Assigned Users */}
                          <td className="py-3.5 px-4 text-center font-mono">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              (role.userCount || 0) > 0
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                : 'text-zinc-500'
                            }`}>
                              {role.userCount || 0}
                            </span>
                          </td>

                          {/* Rights Granted */}
                          <td className="py-3.5 px-4 text-center font-mono text-zinc-400">
                            {rightsCount}
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                              role.status === 'Active'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${role.status === 'Active' ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                              {role.status}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(role)}
                                title="Edit Role"
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              {!role.isSystem && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRole(role)}
                                  title="Delete Role"
                                  className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className={`p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono ${
              isLight ? 'border-slate-200 bg-slate-50/50 text-slate-600' : 'border-zinc-800 bg-zinc-950/40 text-zinc-400'
            }`}>
              <div>
                Showing {filteredRoles.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredRoles.length)} of {filteredRoles.length} entries
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                    isLight
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 font-bold">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                    isLight
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                  }`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
