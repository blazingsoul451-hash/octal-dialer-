import React from 'react';

interface AdminUsersProps {
  isLight: boolean;
  serverUrl: string;
  authToken: string;
}

export const AdminUsers: React.FC<AdminUsersProps> = ({ isLight }) => {
  return (
    <div className={`p-6 ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
      <h2 className={`text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>User Management</h2>
      <p className={`mt-2 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>User management interface coming soon</p>
    </div>
  );
};
