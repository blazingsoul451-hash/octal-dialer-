import React from 'react';

interface AdminRolesProps {
  isLight: boolean;
  serverUrl: string;
  authToken: string;
}

export const AdminRoles: React.FC<AdminRolesProps> = ({ isLight }) => {
  return (
    <div className={`p-6 ${isLight ? 'bg-white' : 'bg-[#18181b]'}`}>
      <h2 className={`text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Roles & Permissions</h2>
      <p className={`mt-2 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Roles & Permissions interface coming soon</p>
    </div>
  );
};
