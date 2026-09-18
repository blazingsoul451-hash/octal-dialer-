import React, { useState, useEffect } from 'react';
import { Users, Phone, Database } from 'lucide-react';

interface AdminDashboardProps {
  isLight: boolean;
  serverUrl: string;
  authToken: string;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ isLight, serverUrl, authToken }) => {
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {
      const res = await fetch(`${serverUrl}/admin/analytics/overview`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        setOverview(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch overview:', err);
    } finally {
      setLoading(false);
    }
  };

  const KpiCard = ({ icon: Icon, label, value }: any) => (
    <div className={`p-6 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800 border-[#27272a]'}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>{label}</p>
          <p className={`text-2xl font-bold mt-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>{value}</p>
        </div>
        <Icon className={`w-8 h-8 ${isLight ? 'text-amber-500' : 'text-amber-400'}`} />
      </div>
    </div>
  );

  return (
    <div className={`p-6 ${isLight ? 'bg-white' : 'bg-[#18181b]'}`}>
      <div className="max-w-7xl mx-auto">
        <h2 className={`text-2xl font-bold mb-6 ${isLight ? 'text-slate-900' : 'text-white'}`}>Dashboard</h2>

        {loading ? (
          <p className="text-slate-500">Loading...</p>
        ) : overview ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={Users} label="Total Users" value={overview.totalUsers} />
            <KpiCard icon={Users} label="Active Sessions" value={overview.activeSessions} />
            <KpiCard icon={Phone} label="Calls Today" value={overview.callsToday} />
            <KpiCard icon={Database} label="Leads Scraped Today" value={overview.leadsScrapedToday} />
          </div>
        ) : null}
      </div>
    </div>
  );
};
