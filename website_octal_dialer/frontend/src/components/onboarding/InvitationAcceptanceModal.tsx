import React, { useState } from 'react';
import {
  Building2, AlertCircle, UserCheck, ShieldCheck
} from 'lucide-react';
import { type AuthIdentity, tryNormalizeStructuralRole } from '../../utils/roleUtils';

interface InvitationAcceptanceModalProps {
  serverUrl: string;
  authToken: string;
  pendingInvitation: {
    id?: string;
    token?: string;
    tenantName?: string;
    companyName?: string;
    role: string;
    teamName?: string;
    teamId?: string;
    inviterName?: string;
    email?: string;
  };
  currentUser: AuthIdentity;
  onAccepted: (token: string, identity: AuthIdentity, tenant: any) => void;
  onLogout: () => void;
}

export const InvitationAcceptanceModal: React.FC<InvitationAcceptanceModalProps> = ({
  serverUrl,
  authToken,
  pendingInvitation,
  currentUser,
  onAccepted,
  onLogout
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgName = pendingInvitation.tenantName || pendingInvitation.companyName || 'Company Workspace';
  const roleLabel = pendingInvitation.role === 'team_lead' ? 'Team Lead' : 'Team Member';
  const inviter = pendingInvitation.inviterName || 'Workspace Administrator';

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/invitations/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          invitationId: pendingInvitation.id,
          token: pendingInvitation.token
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to accept workspace invitation.');
      }

      const newToken = data.token || authToken;
      const tenant = data.tenant;
      const user = data.user;

      const rawRole = user.role || pendingInvitation.role;
      const normalizedRole = tryNormalizeStructuralRole(rawRole) || 'user';

      const updatedIdentity: AuthIdentity = {
        username: user.username || currentUser.username,
        role: normalizedRole,
        displayName: user.displayName || currentUser.displayName,
        tenantId: user.tenantId || tenant?.id,
        userId: user.id || currentUser.userId,
        email: user.email || currentUser.email
      };

      localStorage.setItem('octal_auth_token', newToken);
      localStorage.setItem('octal_auth_user', updatedIdentity.username);

      onAccepted(newToken, updatedIdentity, tenant);
    } catch (err: any) {
      setError(err.message || 'Failed to accept invitation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl shadow-black/90 overflow-hidden">
        
        {/* Brand Header */}
        <div className="bg-slate-950/70 p-6 border-b border-slate-800 text-center relative">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
            WORKSPACE INVITATION
          </span>
          <h2 className="text-lg font-bold text-white mt-1">
            Join <span className="text-amber-400">{orgName}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Invited by <strong className="text-slate-200">{inviter}</strong>
          </p>
        </div>

        {/* Body Details */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-950/40 border border-red-500/40 rounded-xl px-3.5 py-2.5 text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Target Organization</span>
              <span className="font-bold text-white font-mono">{orgName}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Assigned Role</span>
              <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-mono">
                {roleLabel}
              </span>
            </div>
            {pendingInvitation.teamName && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Assigned Team</span>
                <span className="font-bold text-white font-mono">{pendingInvitation.teamName}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">User Identity</span>
              <span className="text-slate-300 font-mono">{currentUser.email || currentUser.username}</span>
            </div>
          </div>

          <div className="space-y-2 text-[11px] text-slate-400 bg-slate-950/30 p-3 rounded-xl border border-slate-800/60">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Standard Team Seat Provisioning</span>
            </div>
            <p className="leading-relaxed">
              Accepting will link your personal account to this workspace. You will have access to the CRM suite, OCTAL dialer, and team campaigns scoped by your assigned role.
            </p>
          </div>

          <div className="pt-2 space-y-2.5">
            <button
              type="button"
              id="accept-invitation-btn"
              onClick={handleAccept}
              disabled={loading}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                  <span>Joining Workspace...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>Accept & Join Workspace</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-center"
            >
              Decline / Sign In with Another Account
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
