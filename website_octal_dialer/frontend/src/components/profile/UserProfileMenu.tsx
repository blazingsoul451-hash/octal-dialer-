import React, { useState, useEffect, useRef } from 'react';
import {
  User, Lock, Key, Eye, EyeOff, Shield, ShieldAlert,
  Check, X, Camera, LogOut, CheckCircle2, XCircle,
  Upload, RefreshCw, Trash2
} from 'lucide-react';

interface UserProfileMenuProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  authUser: string | null;
  onLogout: () => void;
}

interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  accountNo: string;
  recordsPerPage: number;
  twoFactorEnabled: boolean;
  avatarUrl?: string;
}

export const UserProfileMenu: React.FC<UserProfileMenuProps> = ({
  isLight,
  serverUrl,
  authToken,
  authUser,
  onLogout
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Profile data state
  const [profile, setProfile] = useState<UserProfile>({
    id: '',
    username: authUser || '',
    displayName: authUser || '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: '',
    status: 'Active',
    accountNo: 'Trial-2421',
    recordsPerPage: 25,
    twoFactorEnabled: false,
    avatarUrl: ''
  });

  // Profile Form State
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRecordsPerPage, setEditRecordsPerPage] = useState(25);
  const [editTwoFactor, setEditTwoFactor] = useState(false);
  const [editAvatarUrl, setEditAvatarUrl] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Camera & Image Picker Modal State
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Password Form State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submittingPassword, setSubmittingPassword] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Fetch profile on mount / token change
  const fetchProfile = async () => {
    if (!authToken) return;
    try {
      const res = await fetch(`${serverUrl}/api/user/profile`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setEditFirstName(data.firstName || '');
        setEditLastName(data.lastName || '');
        setEditPhone(data.phone || '');
        setEditRecordsPerPage(data.recordsPerPage || 25);
        setEditTwoFactor(!!data.twoFactorEnabled);
        setEditAvatarUrl(data.avatarUrl || '');
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [serverUrl, authToken]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMouseEnter = () => {
    if (profileModalOpen || passwordModalOpen || imageModalOpen) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setDropdownOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setDropdownOpen(false);
    }, 250);
  };

  // Open Modals
  const handleOpenProfileModal = () => {
    setDropdownOpen(false);
    setEditFirstName(profile.firstName || '');
    setEditLastName(profile.lastName || '');
    setEditPhone(profile.phone || '');
    setEditRecordsPerPage(profile.recordsPerPage || 25);
    setEditTwoFactor(profile.twoFactorEnabled);
    setEditAvatarUrl(profile.avatarUrl || '');
    setProfileModalOpen(true);
  };

  const handleOpenPasswordModal = () => {
    setDropdownOpen(false);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordModalOpen(true);
  };

  // ─── Seamless Modal Lifecycle for Image Picker ───
  // When Update Profile Picture appears, hide dropdown and Edit Profile Information screen.
  const handleOpenImageModal = () => {
    setDropdownOpen(false);
    setProfileModalOpen(false);
    setImageModalOpen(true);
  };

  // When image modal is closed/cancelled, restore Edit Profile Information screen.
  const handleCloseImageModal = () => {
    stopCameraStream();
    setImageModalOpen(false);
    setProfileModalOpen(true);
  };

  // ─── Camera Handling ────────────────────────────────────────────────────────
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    setCapturedPreview(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 640 },
          facingMode: 'user'
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('Unable to access camera. Please check camera permissions in your browser.');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Crop center square
    const minDim = Math.min(video.videoWidth, video.videoHeight);
    const startX = (video.videoWidth - minDim) / 2;
    const startY = (video.videoHeight - minDim) / 2;

    ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, 320, 320);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    setCapturedPreview(dataUrl);
    stopCameraStream();
  };

  const confirmCapturedPhoto = async () => {
    if (!capturedPreview) return;
    const photo = capturedPreview;
    setEditAvatarUrl(photo);
    stopCameraStream();
    setImageModalOpen(false);
    setProfileModalOpen(true);

    // Auto-save avatar to backend
    try {
      const res = await fetch(`${serverUrl}/api/user/avatar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ avatarUrl: photo })
      });
      if (res.ok) {
        setProfile(prev => ({ ...prev, avatarUrl: photo }));
        showToast('Profile photo updated successfully!');
      }
    } catch (e) {
      console.error('Error saving avatar:', e);
    }
  };

  // ─── File Upload Handling ───────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setEditAvatarUrl(dataUrl);
        stopCameraStream();
        setImageModalOpen(false);
        setProfileModalOpen(true);

        // Auto-save avatar to backend
        try {
          const res = await fetch(`${serverUrl}/api/user/avatar`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`
            },
            body: JSON.stringify({ avatarUrl: dataUrl })
          });
          if (res.ok) {
            setProfile(prev => ({ ...prev, avatarUrl: dataUrl }));
            showToast('Profile photo updated successfully!');
          }
        } catch (e) {
          console.error('Error saving avatar:', e);
        }
      }
    };
    reader.readAsDataURL(file);
    // Reset file input so selecting same file again fires onChange
    e.target.value = '';
  };

  // Remove Photo
  const handleRemovePhoto = async () => {
    setEditAvatarUrl('');
    stopCameraStream();
    setImageModalOpen(false);
    setProfileModalOpen(true);
    try {
      await fetch(`${serverUrl}/api/user/avatar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ avatarUrl: '' })
      });
      setProfile(prev => ({ ...prev, avatarUrl: '' }));
      showToast('Profile photo removed.');
    } catch (e) {
      console.error('Error removing avatar:', e);
    }
  };

  // Save Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch(`${serverUrl}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          firstName: editFirstName.trim(),
          lastName: editLastName.trim(),
          phone: editPhone.trim(),
          recordsPerPage: editRecordsPerPage,
          twoFactorEnabled: editTwoFactor,
          avatarUrl: editAvatarUrl
        })
      });

      if (res.ok) {
        showToast('Profile updated successfully!');
        setProfileModalOpen(false);
        fetchProfile();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to update profile.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error saving profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // Remove Trusted Devices
  const handleRemoveTrustedDevices = async () => {
    if (!window.confirm('Are you sure you want to sign out and remove all other trusted devices?')) {
      return;
    }
    try {
      const res = await fetch(`${serverUrl}/api/user/revoke-devices`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        showToast('All other trusted devices removed.');
      } else {
        showToast('Failed to revoke trusted devices.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error revoking devices.', 'error');
    }
  };

  // Live password rules calculation (Pic 3)
  const hasCapital = /[A-Z]/.test(newPassword);
  const hasNumeric = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
  const hasMinLength = newPassword.length >= 8;
  const isPasswordValid = hasCapital && hasNumeric && hasSpecial && hasMinLength;

  // Submit Change Password
  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword) {
      showToast('Old password is required.', 'error');
      return;
    }
    if (!isPasswordValid) {
      showToast('Please satisfy all password complexity rules.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New password and confirm password do not match.', 'error');
      return;
    }

    setSubmittingPassword(true);
    try {
      const res = await fetch(`${serverUrl}/api/user/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          oldPassword,
          newPassword,
          confirmPassword
        })
      });

      if (res.ok) {
        showToast('Password updated successfully!');
        setPasswordModalOpen(false);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to change password.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error changing password.', 'error');
    } finally {
      setSubmittingPassword(false);
    }
  };

  const displayName = profile.displayName || (profile.firstName ? `${profile.firstName} ${profile.lastName}`.trim() : authUser) || 'User';
  const displayEmail = profile.email || `${authUser || 'user'}@octaldialer.com`;
  const activeAvatar = profile.avatarUrl || editAvatarUrl;

  return (
    <div
      ref={menuRef}
      className="relative select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        capture="user"
        className="hidden"
      />

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

      {/* ── Trigger Avatar with Online Indicator ── */}
      <button
        onClick={() => {
          if (profileModalOpen || passwordModalOpen || imageModalOpen) return;
          setDropdownOpen(prev => !prev);
        }}
        className="relative flex items-center justify-center cursor-pointer outline-none group"
        title={`Profile: ${displayName}`}
      >
        <div className={`w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center border overflow-hidden transition-all ${
          dropdownOpen
            ? 'ring-2 ring-amber-500/50 border-amber-500'
            : isLight
              ? 'bg-slate-100 text-slate-900 border-slate-300 group-hover:border-slate-400'
              : 'bg-slate-900 text-amber-400 border-slate-800 group-hover:border-zinc-700'
        }`}>
          {activeAvatar ? (
            <img src={activeAvatar} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <User className="w-4 h-4" />
          )}
        </div>
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#00A651] border-2 border-white dark:border-slate-900 shadow-sm" />
      </button>

      {/* ── 1. PROFILE DROPDOWN (Pic 1) ── */}
      {dropdownOpen && (
        <div
          className={`absolute right-0 mt-2 w-72 rounded-2xl shadow-2xl border overflow-hidden z-50 transition-all animate-fadeIn ${
            isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#09090b] border-[#18181b] text-zinc-200'
          }`}
        >
          {/* Top Banner with Silhouette Avatar */}
          <div className={`pt-6 pb-4 px-4 text-center border-b ${
            isLight
              ? 'bg-gradient-to-b from-sky-50/70 to-white border-slate-100'
              : 'bg-gradient-to-b from-zinc-900 to-[#09090b] border-[#18181b]'
          }`}>
            <div className="w-16 h-16 mx-auto rounded-full bg-slate-300 dark:bg-zinc-700 flex items-center justify-center text-slate-500 dark:text-zinc-300 shadow-inner mb-3 overflow-hidden border-2 border-white/40">
              {activeAvatar ? (
                <img src={activeAvatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-9 h-9" />
              )}
            </div>
            <h3 className={`text-base font-black font-display tracking-tight truncate ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              {displayName}
            </h3>
            <p className="text-xs font-mono text-zinc-400 truncate mt-0.5">
              {displayEmail}
            </p>
          </div>

          {/* Menu Items */}
          <div className="p-2 space-y-1">
            <button
              onClick={handleOpenProfileModal}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isLight
                  ? 'hover:bg-slate-100 text-slate-700'
                  : 'hover:bg-zinc-900 text-zinc-300'
              }`}
            >
              <User className="w-4 h-4 text-zinc-400" />
              <span>My Profile</span>
            </button>

            <button
              onClick={handleOpenPasswordModal}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isLight
                  ? 'hover:bg-slate-100 text-slate-700'
                  : 'hover:bg-zinc-900 text-zinc-300'
              }`}
            >
              <Lock className="w-4 h-4 text-zinc-400" />
              <span>Change Password</span>
            </button>
          </div>

          {/* Bottom Sign Out Button */}
          <div className={`p-3 border-t ${isLight ? 'border-slate-100 bg-slate-50/50' : 'border-[#18181b] bg-zinc-950/40'}`}>
            <button
              onClick={() => {
                setDropdownOpen(false);
                onLogout();
              }}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold font-mono transition-all flex items-center justify-center gap-2 bg-[#4b5563] hover:bg-[#374151] text-white shadow-sm cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* ── 2. EDIT PROFILE INFORMATION MODAL (Pic 2) ── */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden transition-all text-left ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
          }`}>
            {/* Header */}
            <div className={`p-5 border-b flex items-center justify-between ${
              isLight ? 'border-slate-200 bg-slate-50/50' : 'border-[#18181b] bg-zinc-950/50'
            }`}>
              <h2 className="text-lg font-black font-display tracking-tight">
                Edit Profile Information
              </h2>
              <button
                onClick={() => setProfileModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveProfile} className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    placeholder="First Name"
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-sans outline-none transition-all ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                        : 'bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    placeholder="Last Name"
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-sans outline-none transition-all ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                        : 'bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                    Email Address
                  </label>
                  <input
                    type="email"
                    disabled
                    value={profile.email || displayEmail}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-sans outline-none cursor-not-allowed opacity-70 ${
                      isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-600'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <div>
                  <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                    Mobile Number
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="e.g. 03288144064"
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-sans outline-none transition-all ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                        : 'bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                    Records Per Page Preference
                  </label>
                  <select
                    value={editRecordsPerPage}
                    onChange={(e) => setEditRecordsPerPage(Number(e.target.value))}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-sans outline-none transition-all cursor-pointer ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                        : 'bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500'
                    }`}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                {/* Avatar with Interactive Camera Badge */}
                <div className="flex flex-col items-center justify-center pt-2">
                  <div className="relative group">
                    <div
                      onClick={handleOpenImageModal}
                      className="w-16 h-16 rounded-full bg-slate-200 dark:bg-zinc-800 border-2 border-slate-300 dark:border-zinc-700 flex items-center justify-center text-slate-500 dark:text-zinc-300 overflow-hidden cursor-pointer shadow-md group-hover:border-amber-500 transition-all"
                    >
                      {editAvatarUrl ? (
                        <img src={editAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-9 h-9" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenImageModal}
                      title="Update Photo (Camera / Upload)"
                      className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-purple-700 text-white flex items-center justify-center shadow-md hover:bg-purple-600 transition-transform active:scale-95 cursor-pointer ring-2 ring-black"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] font-mono font-bold text-[#00A651] mt-2">
                    Account No. : {profile.accountNo || 'Trial-2421'}
                  </p>
                </div>
              </div>

              {/* Two-Factor & Trusted Devices */}
              <div className="pt-3 border-t border-zinc-800/60 space-y-3">
                <div>
                  <label className="block text-xs font-mono font-bold mb-1 text-zinc-400">
                    Two-Factor Authentication
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={editTwoFactor}
                      onChange={(e) => setEditTwoFactor(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer"
                    />
                    <span className={isLight ? 'text-slate-700' : 'text-zinc-300'}>
                      Add an extra layer of security
                    </span>
                  </label>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handleRemoveTrustedDevices}
                    className="text-xs font-semibold text-red-500 hover:text-red-400 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>Remove All Trusted Devices</span>
                  </button>
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800/60">
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(false)}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold font-mono border transition-all cursor-pointer ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold font-mono transition-all bg-[#00A651] hover:bg-[#008f45] text-white shadow-md cursor-pointer disabled:opacity-50"
                >
                  {savingProfile ? 'Saving...' : 'Save and Close'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 2b. CAMERA & PHOTO PICKER MODAL ── */}
      {imageModalOpen && (
        <div
          onClick={handleCloseImageModal}
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden transition-all text-left ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
          }`}>
            <div className={`p-4 border-b flex items-center justify-between ${
              isLight ? 'border-slate-200 bg-slate-50' : 'border-[#18181b] bg-zinc-950'
            }`}>
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-black font-display">Update Profile Picture</h3>
              </div>
              <button
                onClick={handleCloseImageModal}
                className="p-1 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-center">
              {/* Camera Error */}
              {cameraError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
                  {cameraError}
                </div>
              )}

              {/* Viewfinder / Preview Display */}
              {isCameraActive ? (
                <div className="relative w-64 h-64 mx-auto rounded-full overflow-hidden border-4 border-purple-500 shadow-2xl bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                  <div className="absolute inset-0 pointer-events-none rounded-full border-2 border-white/20" />
                </div>
              ) : capturedPreview ? (
                <div className="space-y-3">
                  <div className="w-44 h-44 mx-auto rounded-full overflow-hidden border-4 border-[#00A651] shadow-2xl">
                    <img src={capturedPreview} alt="Captured" className="w-full h-full object-cover" />
                  </div>
                  <p className="text-xs font-mono text-emerald-400 font-bold">Photo captured!</p>
                </div>
              ) : (
                <div className="w-32 h-32 mx-auto rounded-full bg-slate-100 dark:bg-zinc-800 border-2 border-dashed border-zinc-600 flex items-center justify-center overflow-hidden">
                  {editAvatarUrl ? (
                    <img src={editAvatarUrl} alt="Current" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-14 h-14 text-zinc-500" />
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                {isCameraActive ? (
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={stopCameraStream}
                      className="px-4 py-2 rounded-xl text-xs font-bold font-mono border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="px-5 py-2 rounded-xl text-xs font-bold font-mono bg-purple-600 hover:bg-purple-500 text-white shadow-lg flex items-center gap-2 cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Capture Photo</span>
                    </button>
                  </div>
                ) : capturedPreview ? (
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="px-4 py-2 rounded-xl text-xs font-bold font-mono border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retake</span>
                    </button>
                    <button
                      type="button"
                      onClick={confirmCapturedPhoto}
                      className="px-5 py-2 rounded-xl text-xs font-bold font-mono bg-[#00A651] hover:bg-[#008f45] text-white shadow-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Use this Photo</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="p-3 rounded-xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Camera className="w-5 h-5 text-purple-400" />
                      <span>Take Photo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-3 rounded-xl border border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-200 text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Upload className="w-5 h-5 text-zinc-400" />
                      <span>Upload File</span>
                    </button>
                  </div>
                )}

                {editAvatarUrl && !isCameraActive && !capturedPreview && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="w-full py-2 text-xs font-semibold text-red-400 hover:text-red-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer pt-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Profile Photo</span>
                  </button>
                )}

                {!isCameraActive && !capturedPreview && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleCloseImageModal}
                      className="w-full py-2 rounded-xl text-xs font-mono font-bold border border-zinc-700/60 bg-zinc-900/40 hover:bg-zinc-800 text-zinc-300 transition-colors cursor-pointer"
                    >
                      Back to Edit Profile
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. CHANGE PASSWORD MODAL (Pic 3) ── */}
      {passwordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden transition-all text-left ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
          }`}>
            {/* Header */}
            <div className={`p-5 border-b flex items-center justify-between ${
              isLight ? 'border-slate-200 bg-slate-50/50' : 'border-[#18181b] bg-zinc-950/50'
            }`}>
              <h2 className="text-lg font-black font-display tracking-tight">
                Change Password
              </h2>
              <button
                onClick={() => setPasswordModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Form Body (2 Columns matching Pic 3) */}
            <form onSubmit={handleSubmitPassword} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                {/* Left Column: 3 Password Inputs (3 of 5 cols) */}
                <div className="md:col-span-3 space-y-4">
                  {/* Old Password */}
                  <div>
                    <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                      Old Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showOldPassword ? 'text' : 'password'}
                        required
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder="Current password"
                        className={`w-full pl-3 pr-10 py-2 rounded-xl border text-xs font-sans outline-none transition-all ${
                          isLight
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                            : 'bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowOldPassword(!showOldPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                      >
                        {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                      New Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New password"
                        className={`w-full pl-3 pr-10 py-2 rounded-xl border text-xs font-sans outline-none transition-all ${
                          isLight
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                            : 'bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-xs font-mono font-bold mb-1.5 text-zinc-400">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat new password"
                        className={`w-full pl-3 pr-10 py-2 rounded-xl border text-xs font-sans outline-none transition-all ${
                          isLight
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                            : 'bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Column: Live Validation Checklist (2 of 5 cols) */}
                <div className="md:col-span-2 flex flex-col justify-center space-y-2.5 p-4 rounded-xl border border-dashed border-zinc-700/60 bg-zinc-900/30 text-xs">
                  <span className="font-mono text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    At least
                  </span>

                  {/* 1 Capital Letter */}
                  <div className={`flex items-center justify-between font-medium ${
                    hasCapital ? 'text-emerald-400' : 'text-zinc-400'
                  }`}>
                    <span>1 capital letter</span>
                    {hasCapital ? <Check className="w-4 h-4 text-emerald-400 stroke-[3]" /> : <X className="w-4 h-4 text-red-400 stroke-[3]" />}
                  </div>

                  {/* 1 Numeric Character */}
                  <div className={`flex items-center justify-between font-medium ${
                    hasNumeric ? 'text-emerald-400' : 'text-zinc-400'
                  }`}>
                    <span>1 numeric character</span>
                    {hasNumeric ? <Check className="w-4 h-4 text-emerald-400 stroke-[3]" /> : <X className="w-4 h-4 text-red-400 stroke-[3]" />}
                  </div>

                  {/* 1 Special Character */}
                  <div className={`flex items-center justify-between font-medium ${
                    hasSpecial ? 'text-emerald-400' : 'text-zinc-400'
                  }`}>
                    <span>1 special character</span>
                    {hasSpecial ? <Check className="w-4 h-4 text-emerald-400 stroke-[3]" /> : <X className="w-4 h-4 text-red-400 stroke-[3]" />}
                  </div>

                  {/* Min 8 Characters */}
                  <div className={`flex items-center justify-between font-medium ${
                    hasMinLength ? 'text-emerald-400' : 'text-zinc-400'
                  }`}>
                    <span>Minimum 8 characters</span>
                    {hasMinLength ? <Check className="w-4 h-4 text-emerald-400 stroke-[3]" /> : <X className="w-4 h-4 text-red-400 stroke-[3]" />}
                  </div>
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t border-zinc-800/60 mt-6">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold font-mono border transition-all cursor-pointer ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPassword || !isPasswordValid}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold font-mono transition-all bg-[#00A651] hover:bg-[#008f45] text-white shadow-md cursor-pointer disabled:opacity-50"
                >
                  {submittingPassword ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
