import React from 'react';

interface AdminAuditLogsProps {
  isLight: boolean;
  serverUrl: string;
  authToken: string;
}

export const AdminAuditLogs: React.FC<AdminAuditLogsProps> = ({ isLight }) => {
  return (
    <div className={`p-6 ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
      <h2 className={`text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Audit Logs</h2>
      <p className={`mt-2 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Audit logs interface coming soon</p>
    </div>
  );
};
