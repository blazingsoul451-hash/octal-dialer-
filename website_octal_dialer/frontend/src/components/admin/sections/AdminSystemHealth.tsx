import React from 'react';

interface AdminSystemHealthProps {
  isLight: boolean;
  serverUrl: string;
  authToken: string;
}

export const AdminSystemHealth: React.FC<AdminSystemHealthProps> = ({ isLight }) => {
  return (
    <div className={`p-6 ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
      <h2 className={`text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>System Health</h2>
      <p className={`mt-2 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>System health interface coming soon</p>
    </div>
  );
};
