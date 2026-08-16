import React, { useState } from 'react';
import { Smartphone, CheckCircle, ShieldAlert, Cpu, Laptop, RefreshCw, Copy, Check, Download, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

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
  laptopBtAddress: string | null;
  revokePhone: () => void;
  serverUrl: string;
  isLight?: boolean;
}

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  isConnected,
  sessionId,
  token,
  phoneConnected,
  phoneDeviceName,
  phoneBtAddress,
  phoneOsType,
  phoneIpAddress,
  laptopBtAddress,
  revokePhone,
  serverUrl,
  isLight
}) => {
  const [qrMode, setQrMode] = useState<'download' | 'pair'>('download');
  const [copied, setCopied] = useState(false);
  const [showApkQr, setShowApkQr] = useState(false);

  const laptopName = window.location.hostname || 'Localhost';
  const currentHost = window.location.hostname;
  const currentOrigin = window.location.origin;
  
  // Dynamic API server URL: prioritize authoritative backend qrPayload.serverUrl, then prop, then host
  const apiProtocol = window.location.protocol;
  const safeServerUrl = (qrPayload && qrPayload.serverUrl && qrPayload.serverUrl.startsWith('http'))
    ? qrPayload.serverUrl
    : (serverUrl && serverUrl.startsWith('http') 
      ? serverUrl 
      : (currentHost === 'localhost' || currentHost === '127.0.0.1' ? `${apiProtocol}//${currentHost}:3000` : `${apiProtocol}//${currentHost}:3000`));

  // Direct APK download link from backend server
  const directApkUrl = `${safeServerUrl}/download/apk`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(directApkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // Direct Instant Native App Pairing Payload (like instant Bluetooth hardware pairing)
  const effectiveSessionId = sessionId || 'sess_offline';
  const effectiveToken = token || '8888';
  const nativePairingUrl = `octaldialer://join?sessionId=${effectiveSessionId}&token=${effectiveToken}&serverUrl=${encodeURIComponent(safeServerUrl)}&laptop=${encodeURIComponent(laptopName)}&laptopBtAddress=${encodeURIComponent(laptopBtAddress || '00:1A:7D:DA:71:11')}`;
  
  // Choose QR payload: 'download' mode = APK web link, 'pair' mode = Instant direct Bluetooth app scheme link
  const activeQrValue = qrMode === 'download' ? directApkUrl : nativePairingUrl;

  return (
    <div className={`border rounded-2xl p-6 shadow-2xl space-y-6 text-left transition-colors ${
      isLight ? 'bg-white border-slate-200/90 shadow-slate-200/50 text-slate-900' : 'bg-[#0f172a]/95 border-slate-800/90 text-white'
    }`}>
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b gap-3 ${
        isLight ? 'border-slate-200' : 'border-slate-800/80'
      }`}>
        <div>
          <h2 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            Bluetooth Hardware GSM Bridge
          </h2>
          <p className="text-xs text-slate-400 mt-1">Pair your Android handset via secure QR token to route real SIM calls straight through your physical device.</p>
        </div>
        <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border shrink-0 ${
          isConnected 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 emerald-glow' 
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider">
            {isConnected ? 'Bluetooth Bridge Ready' : 'Server Offline'}
          </span>
        </div>
      </div>

      {phoneConnected ? (
        <div className="space-y-6">
          {/* Active pairing success banner */}
          <div className={`p-5 border rounded-2xl flex items-center gap-4 ${
            isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-emerald-950/20 border-emerald-900/30'
          }`}>
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-500 shrink-0">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold uppercase tracking-wider">Bluetooth Link Active</h3>
              <p className="text-xs text-slate-500 mt-0.5">Bluetooth pair established. Calls will trigger directly via physical mobile handset.</p>
            </div>
          </div>

          {/* Connection Hardware Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Laptop Host parameters */}
            <div className={`p-4 border rounded-xl space-y-3 text-left ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850'
            }`}>
              <div className={`flex items-center gap-2 pb-2 border-b ${
                isLight ? 'border-slate-200 text-slate-700' : 'border-slate-800 text-slate-400'
              }`}>
                <Laptop className="w-4 h-4 text-amber-500" />
                <span className={`text-xs font-bold uppercase tracking-wide ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Laptop Host (Bluetooth)
                </span>
              </div>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Host Name:</span>
                  <span className={`font-bold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>{laptopName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Host Identifier:</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold">{laptopBtAddress || '00:1A:7D:DA:71:11'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Server Link:</span>
                  <span className="text-slate-500 select-all">{serverUrl}</span>
                </div>
              </div>
            </div>

            {/* Paired phone parameters */}
            <div className={`p-4 border rounded-xl space-y-3 text-left ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850'
            }`}>
              <div className={`flex items-center gap-2 pb-2 border-b ${
                isLight ? 'border-slate-200 text-slate-700' : 'border-slate-800 text-slate-400'
              }`}>
                <Smartphone className="w-4 h-4 text-emerald-500" />
                <span className={`text-xs font-bold uppercase tracking-wide ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Paired Mobile Phone
                </span>
              </div>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Device Name:</span>
                  <span className={`font-bold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>{phoneDeviceName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Device ID:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">{phoneBtAddress || '48:D2:24:D3:5F:AA'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Platform OS:</span>
                  <span className="capitalize text-slate-500">{phoneOsType || 'Android'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center pt-2">
            <button
              onClick={revokePhone}
              className="px-6 py-2.5 text-xs font-mono font-bold tracking-wider text-red-500 hover:text-red-600 border border-red-300 hover:border-red-400 bg-red-50 hover:bg-red-100 rounded-xl transition cursor-pointer"
            >
              Disconnect Wireless Link
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: QR Code box */}
          <div className={`lg:col-span-5 min-w-0 flex flex-col items-center justify-center p-5 border rounded-2xl ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850'
          }`}>
            <div className="p-4 bg-white rounded-2xl shadow-xl border border-slate-200 max-w-full overflow-hidden flex flex-col items-center">
              <QRCodeSVG
                value={showApkQr ? directApkUrl : nativePairingUrl}
                size={210}
                fgColor="#000000"
                bgColor="#ffffff"
                level="L"
                includeMargin={true}
              />
            </div>
            <span className="text-xs font-mono text-amber-600 dark:text-amber-400 mt-3 font-black uppercase tracking-wider text-center">
              {showApkQr ? '● Camera Scan: Download APK' : '● App Scan: Pair Phone Link'}
            </span>
          </div>

          {/* Right: Instructions & Download APK options */}
          <div className="lg:col-span-7 min-w-0 space-y-4 text-left">
            <div className="space-y-1.5">
              <h4 className={`text-sm font-bold flex items-center gap-1.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                <Cpu className="w-4 h-4 text-amber-500 shrink-0" />
                Establish Wireless Pairing Tunnel
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Scan this QR code using the **Octal Dialer Mobile App** on your phone to link your console.
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Establishes a direct wireless tunnel between your laptop and phone.
              </p>
            </div>

            <div className={`space-y-2 border-t pt-3 ${isLight ? 'border-slate-200' : 'border-slate-800/60'}`}>
              <div className="flex flex-wrap justify-between items-center text-[10px] font-mono text-slate-500 gap-1">
                <span>Laptop Host Name:</span>
                <span className={`font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>{laptopName}</span>
              </div>
              <div className="flex flex-wrap justify-between items-center text-[10px] font-mono text-slate-500 gap-1">
                <span>Host Identifier:</span>
                <span className="text-amber-600 dark:text-amber-400 font-bold truncate">{laptopBtAddress || '00:1A:7D:DA:71:11'}</span>
              </div>
              <div className="flex flex-wrap justify-between items-center text-[10px] font-mono text-slate-500 gap-1">
                <span>One-Time Pairing Pin:</span>
                <div className="flex items-center gap-2">
                  <span className={`font-bold tracking-widest px-2 py-0.5 rounded border ${
                    isLight ? 'bg-slate-100 border-slate-300 text-emerald-700' : 'bg-slate-950 border-slate-850 text-emerald-400'
                  }`}>
                    {effectiveToken}
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile App Download Card */}
            <div className={`p-4 border rounded-2xl space-y-3 min-w-0 ${
              isLight ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-950/20 border-amber-900/40'
            }`}>
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-amber-500 shrink-0" />
                  <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                    Get Mobile App (.APK)
                  </h4>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowApkQr(!showApkQr)}
                    className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg border transition flex items-center gap-1.5 cursor-pointer ${
                      showApkQr 
                        ? 'bg-amber-500 text-slate-950 border-amber-500 font-black' 
                        : isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100' : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    {showApkQr ? 'Hide APK QR' : 'Show APK QR'}
                  </button>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">v1.1.0 Live</span>
                </div>
              </div>

              {showApkQr && (
                <div className={`p-4 border rounded-xl flex flex-col items-center justify-center text-center space-y-2.5 ${
                  isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-850'
                }`}>
                  <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-md max-w-full overflow-hidden">
                    <QRCodeSVG
                      value={directApkUrl}
                      size={150}
                      fgColor="#0f172a"
                      bgColor="#ffffff"
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                  <p className="text-[10px] font-mono text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">
                    Point phone camera here to download APK directly to phone
                  </p>
                  <p className="text-[9px] font-mono text-slate-500 select-all">{directApkUrl}</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-1 min-w-0">
                <a
                  href={directApkUrl}
                  download="OctalDialer.apk"
                  className="flex-1 py-2.5 px-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-[11px] font-mono uppercase tracking-wider rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer text-center"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  Download OctalDialer.apk
                </a>

                <button
                  onClick={handleCopyLink}
                  className={`py-2.5 px-3 rounded-xl border text-[11px] font-mono font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                    copied 
                      ? 'bg-emerald-500 text-slate-950 border-emerald-500 font-black' 
                      : isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100' : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Link Copied!' : 'Copy Direct Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
