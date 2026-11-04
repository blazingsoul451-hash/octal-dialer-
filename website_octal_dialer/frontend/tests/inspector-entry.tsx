import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { LoginScreen } from '../src/components/LoginScreen';
import App from '../src/App';
import { DashboardOverview } from '../src/components/DashboardOverview';
import { CRMWorkspacePage } from '../src/components/crm/CRMWorkspacePage';
import { OmnichannelUnibox } from '../src/components/OmnichannelUnibox';
import { AutoEmailer } from '../src/components/AutoEmailer';
import { SuperAdminPortal } from '../src/components/SuperAdminPortal';
import type { Campaign } from '../src/types';

const mockCampaigns: Campaign[] = [
  { id: 'c1', name: 'West Coast Real Estate High Intent', status: 'ACTIVE', leadCount: 450, fileName: 'leads_west.csv', createdAt: new Date().toISOString() },
  { id: 'c2', name: 'Q4 Fintech Decision Makers', status: 'ACTIVE', leadCount: 120, fileName: 'fintech_q4.xlsx', createdAt: new Date().toISOString() },
];

function InspectorRoot() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view') || 'login';
  const initialMode = params.get('mode') || 'login';
  const theme = params.get('theme') || 'dark';
  const isLight = theme === 'light';

  useEffect(() => {
    if (isLight) {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.body.className = 'bg-slate-100 text-slate-900 antialiased';
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      document.body.className = 'bg-black text-slate-100 antialiased';
    }
  }, [isLight]);

  if (view === 'login') {
    return <LoginScreen serverUrl="" onLogin={() => {}} />;
  }

  if (view === 'app') {
    // Authenticated App shell & header
    return <App />;
  }

  if (view === 'dashboard') {
    return (
      <div className={`min-h-screen p-4 sm:p-6 ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-black text-slate-100'}`}>
        <DashboardOverview
          isLight={isLight}
          serverUrl=""
          authToken="fixture-token"
          phoneConnected={true}
          phoneDeviceName="Galaxy S24 (SM-S928B)"
          campaigns={mockCampaigns}
          onNavigateTab={() => {}}
          onSelectCampaign={() => {}}
        />
      </div>
    );
  }

  if (view === 'crm') {
    return (
      <div className={`min-h-screen p-4 sm:p-6 ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-black text-slate-100'}`}>
        <CRMWorkspacePage
          isLight={isLight}
          serverUrl=""
          authToken="fixture-token"
          campaigns={mockCampaigns}
          userRole="platform_admin"
          initialSubTab="overview"
          onDialLead={() => {}}
        />
      </div>
    );
  }

  if (view === 'unibox') {
    return (
      <div className={`min-h-screen ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-black text-slate-100'}`}>
        <OmnichannelUnibox
          isLight={isLight}
          serverUrl=""
          authToken="fixture-token"
          onDialLead={() => {}}
        />
      </div>
    );
  }

  if (view === 'emailer') {
    return (
      <div className={`min-h-screen p-4 sm:p-6 ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-black text-slate-100'}`}>
        <AutoEmailer
          isLight={isLight}
          serverUrl=""
          authToken="fixture-token"
          activeSubTab="emailer-gmail"
          onNavigateTab={() => {}}
        />
      </div>
    );
  }

  if (view === 'superadmin') {
    return (
      <SuperAdminPortal
        serverUrl=""
        authToken="fixture-token"
        currentUser={{ username: 'superadmin', role: 'superadmin' }}
        onLogout={() => {}}
        isLight={isLight}
        onToggleTheme={() => {}}
      />
    );
  }

  return <div>Unknown view: {view}</div>;
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<InspectorRoot />);
}
