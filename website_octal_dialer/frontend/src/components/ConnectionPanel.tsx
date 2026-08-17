import React, { useState, useEffect, useCallback } from 'react';
import { Smartphone, CheckCircle, ShieldAlert, Cpu, Laptop, RefreshCw, Copy, Check, Download, QrCode, Power, Trash2, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface DeviceItem {
  id: string;
  name: string;
  btAddress?: string | null;
  osType?: string | null;
  ipAddress?: string | null;
  status: string;
  isSocketOnline?: boolean;
  userId?: string | null;
  tenantId?: string;
  platform?: string;
  appVersion?: string;
  deviceUid?: string | null;
  isRevoked?: number;
  lastSeenAt?: string | null;
  createdAt: string;
}

interface ConnectionPanelProps {
  isConnected: boolean;
  sessionId: string | null;
  token: string | null;
  qrPayload: any;
  phoneConnected: boolean;
  phoneDeviceName: string | null;
  phoneBtAddress: string | null;
  phoneOsType: string | null;
  phoneIpAddress: string | null;
  phoneDeviceId?: string | null;
  laptopBtAddress: string | null;
  revokePhone: () => void;
  connectDevice?: (deviceId: string) => void;
  disconnectDevice?: (deviceId?: string) => void;
  deviceError?: string | null;
  authToken?: string;
  socket?: any;
  serverUrl: string;
  isLight?: boolean;
}

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  isConnected,
  sessionId,
  token,
  qrPayload,
  phoneConnected,
  phoneDeviceName,
  phoneBtAddress,
  phoneOsType,
  phoneIpAddress,
  phoneDeviceId,
  laptopBtAddress,
  revokePhone,
  connectDevice,
  disconnectDevice,
  deviceError,
  authToken,
  socket,
  serverUrl,
  isLight
}) => {
  const [activeTab, setActiveTab] = useState<'devices' | 'qr'>('devices');
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [deviceActionLoading, setDeviceActionLoading] = useState<string | null>(null);
  const [qrMode, setQrMode] = useState<'download' | 'pair'>('download');
  const [copied, setCopied] = useState(false);
  const [showApkQr, setShowApkQr] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const laptopName = window.location.hostname || 'Localhost';
  const currentHost = window.location.hostname;
  const apiProtocol = window.location.protocol;

  const safeServerUrl = (qrPayload && qrPayload.serverUrl && qrPayload.serverUrl.startsWith('http'))
    ? qrPayload.serverUrl
    : (serverUrl && serverUrl.startsWith('http') 
      ? serverUrl 
      : `${apiProtocol}//${currentHost}:3000`);

  const directApkUrl = `${safeServerUrl}/download/apk`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(directApkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const effectiveSessionId = sessionId || 'sess_offline';
  const effectiveToken = token || '8888';
  const nativePairingUrl = (qrPayload && qrPayload.pairingUri)
    ? qrPayload.pairingUri
    : `octaldialer://join?sessionId=${effectiveSessionId}&token=${effectiveToken}&laptop=${encodeURIComponent(laptopName)}&bt=${encodeURIComponent(laptopBtAddress || '00:1A:7D:DA:71:11')}`;
  const activeQrValue = qrMode === 'download' ? directApkUrl : nativePairingUrl;

  const fetchDevices = useCallback(async () => {
    if (!authToken) return;
    setLoadingDevices(true);
    try {
      const res = await fetch(`${safeServerUrl}/api/devices`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setDevices(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch devices:', e);
    } finally {
      setLoadingDevices(false);
    }
  }, [authToken, safeServerUrl]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Listen for socket device status updates in real-time
  useEffect(() => {
    if (!socket) return;

    const handleStatusChanged = () => {
      fetchDevices();
    };

    socket.on('device:status-changed', handleStatusChanged);
    socket.on('device:list-updated', handleStatusChanged);
    socket.on('phone:connected', handleStatusChanged);
    socket.on('phone:disconnected', handleStatusChanged);

    return () => {
      socket.off('device:status-changed', handleStatusChanged);
      socket.off('device:list-updated', handleStatusChanged);
      socket.off('phone:connected', handleStatusChanged);
      socket.off('phone:disconnected', handleStatusChanged);
    };
  }, [socket, fetchDevices]);

  const handleConnect = async (deviceId: string) => {
    if (!connectDevice) return;
    setDeviceActionLoading(deviceId);
    setLocalError(null);
    try {
      connectDevice(deviceId);
    } catch (e: any) {
      setLocalError(e?.message || 'Failed to connect device.');
    } finally {
      setTimeout(() => setDeviceActionLoading(null), 1000);
    }
  };

  const handleDisconnect = async (deviceId?: string) => {
    if (disconnectDevice) {
      disconnectDevice(deviceId);
    } else {
      revokePhone();
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (!window.confirm('Are you sure you want to revoke this device? It will not be able to connect until authenticated again.')) {
      return;
    }
    if (!authToken) return;
    try {
      const res = await fetch(`${safeServerUrl}/api/devices/${deviceId}/revoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        fetchDevices();
      }
    } catch (e) {
      console.error('Failed to revoke device:', e);
    }
  };

  const formatLastSeen = (isoString?: string | null) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    const now = new Date();
    const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSecs < 15) return 'Just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={`border rounded-2xl p-6 shadow-2xl space-y-6 text-left transition-colors ${
      isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50 text-slate-900' : 'bg-[#0f172a]/95 border-slate-800/90 text-white'
    }`}>
      {/* Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b gap-3 ${
        isLight ? 'border-slate-200' : 'border-slate-800/80'
      }`}>
        <div>
          <h2 className={`text-xl font-black font-display tracking-tight flex items-center gap-2.5 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            <Smartphone className="w-5 h-5 text-amber-500" />
            GSM Hardware Calling Bridge
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Connect your authenticated Android device to dial real SIM/GSM calls directly through your phone.
          </p>
        </div>
        <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border shrink-0 ${
          isConnected 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 emerald-glow' 
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider">
            {isConnected ? 'Bridge Ready' : 'Server Offline'}
          </span>
        </div>
      </div>

      {/* Active Call / Connected Phone Banner */}
      {phoneConnected && (
        <div className={`p-5 border rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
          isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-emerald-950/20 border-emerald-900/30 text-emerald-200'
        }`}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400 shrink-0">
              <CheckCircle className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-emerald-400 font-display">
                  Active Phone Connected
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  READY TO DIAL
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Device: <strong className="text-white font-mono">{phoneDeviceName || 'Android Handset'}</strong> • Network IP: <span className="font-mono text-slate-400">{phoneIpAddress || '127.0.0.1'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => handleDisconnect(phoneDeviceId || undefined)}
            className="px-4 py-2.5 rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition flex items-center gap-2 shrink-0"
          >
            <Power className="w-3.5 h-3.5" />
            Disconnect Handset
          </button>
        </div>
      )}

      {/* Error Banners */}
      {(deviceError || localError) && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{deviceError || localError}</span>
        </div>
      )}

      {/* Mode Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('devices')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'devices'
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          Registered Devices
          {devices.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 font-bold">
              {devices.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('qr')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'qr'
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
          Alternative / Recovery Pairing (QR)
        </button>
      </div>

      {/* TAB 1: Registered Devices List */}
      {activeTab === 'devices' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                Account Devices
              </span>
              <span className="text-[11px] text-slate-500">
                (Logged in with your Octal account)
              </span>
            </div>
            <button
              onClick={fetchDevices}
              disabled={loadingDevices}
              className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition text-xs flex items-center gap-1"
              title="Refresh Devices"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingDevices ? 'animate-spin text-amber-400' : ''}`} />
              <span className="text-[11px]">Refresh</span>
            </button>
          </div>

          {devices.length === 0 ? (
            <div className={`p-8 border rounded-2xl text-center space-y-4 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800/80'
            }`}>
              <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Smartphone className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h4 className="text-sm font-bold text-slate-200 font-display">No Registered Phones Yet</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Open the Octal Dialer Android application on your phone, log in with your Octal account, and it will instantly appear here ready to connect.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setActiveTab('qr')}
                  className="px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold transition flex items-center gap-2"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Use QR Code Pairing
                </button>
                <a
                  href={directApkUrl}
                  download="OctalDialer.apk"
                  className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Android APK
                </a>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {devices.map((dev) => {
                const isThisPhoneActive = phoneConnected && (phoneDeviceId === dev.id || phoneBtAddress === dev.btAddress);
                const isOnline = dev.isSocketOnline || dev.status === 'ONLINE' || dev.status === 'PAIRED';

                return (
                  <div
                    key={dev.id}
                    className={`p-4 border rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${
                      isThisPhoneActive
                        ? 'border-emerald-500/40 bg-emerald-950/15'
                        : isOnline
                        ? 'border-slate-700/80 bg-slate-900/60 hover:border-slate-600'
                        : 'border-slate-800/60 bg-slate-900/30 opacity-75'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 ${
                        isThisPhoneActive
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : isOnline
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          : 'bg-slate-800/60 border-slate-700/40 text-slate-500'
                      }`}>
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-100 font-display">
                            {dev.name || 'Android Device'}
                          </h4>
                          {isThisPhoneActive ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Connected to Laptop
                            </span>
                          ) : isOnline ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Online
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
                              Offline
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {dev.osType || 'Android'} • Octal App v{dev.appVersion || '1.2.0'} • Last seen: <span className="text-slate-300 font-mono">{formatLastSeen(dev.lastSeenAt)}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {isThisPhoneActive ? (
                        <button
                          onClick={() => handleDisconnect(dev.id)}
                          className="px-3.5 py-2 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition flex items-center gap-1.5"
                        >
                          <Power className="w-3.5 h-3.5" />
                          Disconnect
                        </button>
                      ) : isOnline ? (
                        <button
                          onClick={() => handleConnect(dev.id)}
                          disabled={deviceActionLoading === dev.id || !isConnected}
                          className="px-4 py-2 rounded-xl border border-amber-500/40 bg-amber-500 text-slate-950 hover:bg-amber-400 text-xs font-black transition flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
                        >
                          <Wifi className="w-3.5 h-3.5" />
                          {deviceActionLoading === dev.id ? 'Connecting...' : 'Connect to Laptop'}
                        </button>
                      ) : (
                        <button
                          disabled
                          className="px-3.5 py-2 rounded-xl border border-slate-800 bg-slate-800/60 text-slate-500 text-xs font-bold cursor-not-allowed flex items-center gap-1.5"
                          title="Open the app on your phone to connect"
                        >
                          <WifiOff className="w-3.5 h-3.5" />
                          Offline
                        </button>
                      )}

                      <button
                        onClick={() => handleRevokeDevice(dev.id)}
                        className="p-2 rounded-xl border border-slate-800 hover:border-red-500/30 hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition"
                        title="Revoke device access"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Alternative / Recovery QR Pairing */}
      {activeTab === 'qr' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left QR Section */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 border rounded-2xl bg-[#090d16] border-slate-800/80 space-y-4">
              <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl w-full max-w-[240px]">
                <button
                  onClick={() => setQrMode('download')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                    qrMode === 'download' 
                      ? 'bg-amber-500 text-slate-950 shadow-sm' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  1. Get APK
                </button>
                <button
                  onClick={() => setQrMode('pair')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                    qrMode === 'pair' 
                      ? 'bg-amber-500 text-slate-950 shadow-sm' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  2. Pair App
                </button>
              </div>

              <div className="p-4 bg-white rounded-2xl shadow-xl border-4 border-slate-800">
                <QRCodeSVG
                  value={activeQrValue}
                  size={190}
                  level="M"
                  includeMargin={false}
                />
              </div>

              <span className="text-[11px] font-mono font-bold text-amber-400 tracking-wider">
                {qrMode === 'download' ? 'SCAN TO DOWNLOAD APK' : 'SCAN FROM APP CAMERA'}
              </span>
            </div>

            {/* Right Instructions Section */}
            <div className="lg:col-span-7 space-y-4">
              <div className="p-5 border border-slate-800 rounded-2xl bg-slate-900/40 space-y-3">
                <h3 className="text-sm font-bold text-slate-200 font-display flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-amber-500" />
                  Instant QR Pairing Instructions
                </h3>
                <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside leading-relaxed">
                  <li>Install and open the Octal Dialer Android APK on your device.</li>
                  <li>Tap the <strong>SCAN QR</strong> button on the connect screen.</li>
                  <li>Scan the pairing QR code displayed here to pair instantly.</li>
                </ol>
              </div>

              <div className="p-4 border border-slate-800/80 rounded-2xl bg-slate-900/30 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-[10px] font-mono font-bold text-slate-400 uppercase">One-Time Pairing PIN</div>
                  <div className="text-lg font-mono font-black text-amber-400 tracking-widest">{token?.substring(0, 8) || '8888-9999'}</div>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="px-3.5 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition flex items-center gap-1.5 shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied APK Link' : 'Copy APK Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
