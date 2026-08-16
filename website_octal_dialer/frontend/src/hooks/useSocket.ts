import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useSocket(serverUrl: string = 'http://localhost:3000', authToken?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [qrPayload, setQrPayload] = useState<any>(null);
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [phoneDeviceName, setPhoneDeviceName] = useState<string | null>(null);
  const [phoneBtAddress, setPhoneBtAddress] = useState<string | null>(null);
  const [phoneOsType, setPhoneOsType] = useState<string | null>(null);
  const [phoneIpAddress, setPhoneIpAddress] = useState<string | null>(null);
  const [phoneDeviceId, setPhoneDeviceId] = useState<string | null>(null);
  const [laptopBtAddress, setLaptopBtAddress] = useState<string | null>(null);
  const [callState, setCallState] = useState<'IDLE' | 'CALLING' | 'ACTIVE'>('IDLE');
  const [lastCallFinished, setLastCallFinished] = useState<{ reason: string; duration: number } | null>(null);
  const [lastBlockedReason, setLastBlockedReason] = useState<{ reason: string; message: string } | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Standalone heartbeat ping effect
  useEffect(() => {
    if (!isConnected || !sessionId || !phoneConnected || !socketRef.current) {
      setLatencyMs(null);
      return;
    }

    const intervalId = setInterval(() => {
      if (socketRef.current) {
        socketRef.current.emit('client:ping', { sessionId, timestamp: Date.now() });
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [isConnected, sessionId, phoneConnected]);

  useEffect(() => {
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: authToken ? { token: authToken } : {}
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      const prevSessionId = localStorage.getItem('octal_session_id');
      socket.emit('laptop:register', { previousSessionId: prevSessionId || undefined });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('session:created', (data: {
      sessionId: string;
      token: string;
      laptopBtAddress: string;
      qrPayload: any;
    }) => {
      setSessionId(data.sessionId);
      setToken(data.token);
      setLaptopBtAddress(data.laptopBtAddress);
      setQrPayload(data.qrPayload);
      localStorage.setItem('octal_session_id', data.sessionId);
    });

    socket.on('session:refreshed', (data: {
      token: string;
      qrPayload: any;
    }) => {
      setToken(data.token);
      setQrPayload(data.qrPayload);
    });

    socket.on('phone:connected', (data: { 
      deviceName: string; 
      phoneBtAddress: string;
      phoneOsType: string;
      phoneIpAddress: string;
      deviceId?: string;
    }) => {
      setPhoneConnected(true);
      setPhoneDeviceName(data.deviceName);
      setPhoneBtAddress(data.phoneBtAddress);
      setPhoneOsType(data.phoneOsType);
      setPhoneIpAddress(data.phoneIpAddress);
      if (data.deviceId) setPhoneDeviceId(data.deviceId);
    });

    socket.on('phone:disconnected', () => {
      setPhoneConnected(false);
      setPhoneDeviceName(null);
      setPhoneBtAddress(null);
      setPhoneOsType(null);
      setPhoneIpAddress(null);
      setPhoneDeviceId(null);
      setCallState('IDLE');
    });

    socket.on('device:error', (data: { error: string }) => {
      setDeviceError(data.error);
      setCallState('IDLE');
      setTimeout(() => setDeviceError(null), 6000);
    });

    socket.on('error', (err: any) => {
      setCallState('IDLE');
      console.warn('[Socket Error]:', err);
    });

    socket.on('call:started', () => {
      setCallState('ACTIVE');
    });

    socket.on('call:finished', (data: { reason: string; duration: number; leadId?: string; commandId?: string }) => {
      setCallState('IDLE');
      setLastCallFinished(data);
    });

    socket.on('dial:blocked', (data: { reason: string; message: string }) => {
      setCallState('IDLE');
      setLastBlockedReason(data);
      console.warn('[SafetyController] Call blocked:', data.reason, data.message);
    });

    socket.on('campaign:emergency_stopped', () => {
      setCallState('IDLE');
    });

    socket.on('client:pong', (data: { timestamp: number }) => {
      const diff = Date.now() - data.timestamp;
      setLatencyMs(diff);
    });

    socket.on('session:ended', () => {
      setSessionId(null);
      setToken(null);
      setLaptopBtAddress(null);
      setQrPayload(null);
      setPhoneConnected(false);
      setPhoneDeviceName(null);
      setPhoneBtAddress(null);
      setPhoneOsType(null);
      setPhoneIpAddress(null);
      setPhoneDeviceId(null);
      setCallState('IDLE');
      localStorage.removeItem('octal_session_id');
    });

    socket.on('error', (err: any) => {
      console.error('[Socket Error]', err);
    });

    return () => {
      socket.disconnect();
    };
  }, [serverUrl, authToken]);

  const revokePhone = () => {
    if (socketRef.current && sessionId) {
      socketRef.current.emit('laptop:revoke-phone', { sessionId });
      setPhoneConnected(false);
      setPhoneDeviceName(null);
      setPhoneBtAddress(null);
      setPhoneOsType(null);
      setPhoneIpAddress(null);
      setPhoneDeviceId(null);
    }
  };

  const connectDevice = (deviceId: string) => {
    if (socketRef.current && sessionId) {
      setDeviceError(null);
      socketRef.current.emit('laptop:connect-device', { sessionId, deviceId });
    }
  };

  const disconnectDevice = (deviceId?: string) => {
    if (socketRef.current && sessionId) {
      socketRef.current.emit('laptop:disconnect-device', { sessionId, deviceId });
      setPhoneConnected(false);
      setPhoneDeviceName(null);
      setPhoneBtAddress(null);
      setPhoneOsType(null);
      setPhoneIpAddress(null);
      setPhoneDeviceId(null);
    }
  };

  const dialLead = (
    phone: string,
    name: string,
    timeout: number = 30,
    leadId?: string,
    campaignId?: string
  ) => {
    if (socketRef.current && sessionId) {
      setCallState('CALLING');
      setLastBlockedReason(null);
      socketRef.current.emit('dial:lead', { sessionId, phone, name, timeout, leadId, campaignId });
    }
  };

  const hangupCall = () => {
    if (socketRef.current && sessionId) {
      socketRef.current.emit('dial:hangup', { sessionId });
      // Do NOT set IDLE here — wait for server's call:finished event
      // This prevents the UI from showing 'IDLE' while the phone is still ringing/connected
    }
  };

  const emergencyStop = () => {
    if (socketRef.current && sessionId) {
      socketRef.current.emit('campaign:emergency_stop', { sessionId });
      // Do NOT set IDLE here — wait for call:finished from server
      // The emergency_stopped event will still be received and can update UI accordingly
    }
  };

  const clearEmergencyStop = () => {
    if (socketRef.current) {
      socketRef.current.emit('campaign:clear_emergency_stop');
    }
  };

  return {
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
    callState,
    lastCallFinished,
    lastBlockedReason,
    deviceError,
    latencyMs,
    revokePhone,
    connectDevice,
    disconnectDevice,
    dialLead,
    hangupCall,
    emergencyStop,
    clearEmergencyStop,
    socket: socketRef.current
  };
}
