import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Inbox, Mail, MessageSquare, PhoneCall,
  Search, RefreshCw, Send, ShieldAlert,
  Sparkles, Flame, PhoneForwarded, Copy, Check,
  Star, Clock, Ban, Archive, ArrowLeft, Info
} from 'lucide-react';

interface Thread {
  id: string;
  tenantId: string;
  leadId: string | null;
  emailLeadId: string | null;
  channel: 'email' | 'facebook_dm' | 'facebook_comment';
  accountId: string;
  externalThreadId: string;
  prospectAddress: string;
  prospectName: string;
  prospectCompany?: string;
  subject: string;
  status: 'replied_hot' | 'positive' | 'question' | 'ooo' | 'dnc' | 'objection' | 'replied' | 'closed';
  sequenceLocked: number;
  unreadCount: number;
  lastMessageSnippet: string;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  threadId: string;
  direction: 'inbound' | 'outbound';
  channel: 'email' | 'facebook_dm' | 'facebook_comment';
  senderAddress: string;
  recipientAddress: string;
  externalMessageId?: string;
  inReplyTo?: string;
  referencesHeader?: string;
  subject?: string;
  bodyRaw: string;
  bodyClean: string;
  intent?: 'phone_shared' | 'positive' | 'question' | 'ooo' | 'dnc' | 'outbound_reply';
  extractedPhone?: string | null;
  createdAt: string;
}

interface OmnichannelUniboxProps {
  isLight?: boolean;
  serverUrl: string;
  authToken: string;
  onDialLead?: (phone: string, leadId: string, leadName: string) => void;
  socket?: any;
}

export const OmnichannelUnibox: React.FC<OmnichannelUniboxProps> = ({
  isLight = false,
  serverUrl,
  authToken,
  onDialLead,
  socket,
}) => {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [callingLead, setCallingLead] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'facebook_dm' | 'facebook_comment'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'replied_hot' | 'positive' | 'question' | 'ooo' | 'dnc'>('all');
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [rawViewMsgId, setRawViewMsgId] = useState<string | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showMobileIntel, setShowMobileIntel] = useState(false);

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedThread || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`${serverUrl}/api/unibox/threads/${selectedThread.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setSelectedThread(prev => prev ? { ...prev, status: newStatus as any } : null);
        setThreads(prev => prev.map(t => t.id === selectedThread.id ? { ...t, status: newStatus as any } : t));
      } else {
        const err = await res.json();
        alert(`Failed to update status: ${err.error || 'Server error'}`);
      }
    } catch (err: any) {
      alert(`Error updating thread status: ${err.message}`);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${serverUrl}/api/unibox/stats`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadTotal(data.unreadCount || 0);
      }
    } catch {}
  }, [serverUrl, authToken]);

  const fetchThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const params = new URLSearchParams();
      if (channelFilter !== 'all') params.append('channel', channelFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`${serverUrl}/api/unibox/threads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        const loadedThreads: Thread[] = data.threads || [];
        setThreads(loadedThreads);
        setSelectedThread((prev) => {
          if (loadedThreads.length === 0) return null;
          if (!prev) return loadedThreads[0];
          const updatedMatch = loadedThreads.find((t) => t.id === prev.id);
          return updatedMatch || loadedThreads[0];
        });
      }
    } catch (err) {
      console.error('Failed to fetch threads:', err);
    } finally {
      setLoadingThreads(false);
    }
  }, [serverUrl, authToken, channelFilter, statusFilter, searchQuery]);

  const fetchMessages = useCallback(async (threadId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`${serverUrl}/api/unibox/threads/${threadId}/messages`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        // decrement unread locally
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, unreadCount: 0 } : t))
        );
        fetchStats();
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, [serverUrl, authToken, fetchStats]);

  useEffect(() => {
    fetchThreads();
    fetchStats();
  }, [channelFilter, statusFilter, fetchStats, fetchThreads]);

  useEffect(() => {
    if (selectedThread?.id) {
      fetchMessages(selectedThread.id);
    }
  }, [selectedThread?.id, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Real-time Socket.IO Listeners
  useEffect(() => {
    if (!socket) return;

    const handleNewReply = (payload: any) => {
      fetchThreads();
      fetchStats();
      if (selectedThread?.id === payload.threadId) {
        fetchMessages(selectedThread.id);
      }
    };

    const handleMessageSent = (payload: any) => {
      if (selectedThread?.id === payload.threadId) {
        fetchMessages(selectedThread.id);
      }
    };

    socket.on('unibox:new_reply', handleNewReply);
    socket.on('unibox:message_sent', handleMessageSent);

    return () => {
      socket.off('unibox:new_reply', handleNewReply);
      socket.off('unibox:message_sent', handleMessageSent);
    };
  }, [socket, selectedThread?.id, fetchThreads, fetchStats, fetchMessages]);

  const handleSendReply = async () => {
    if (!selectedThread || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      const res = await fetch(`${serverUrl}/api/unibox/threads/${selectedThread.id}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ body: replyText.trim() }),
      });
      if (res.ok) {
        setReplyText('');
        fetchMessages(selectedThread.id);
        fetchThreads();
      } else {
        const err = await res.json();
        alert(`Failed to send reply: ${err.error || 'Server error'}`);
      }
    } catch (err: any) {
      alert(`Error sending reply: ${err.message}`);
    } finally {
      setSendingReply(false);
    }
  };

  const handleTriggerCall = async () => {
    if (!selectedThread || callingLead) return;
    setCallingLead(true);
    try {
      const res = await fetch(`${serverUrl}/api/unibox/threads/${selectedThread.id}/trigger-call`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (data.success && data.phone) {
        if (onDialLead) {
          onDialLead(data.phone, data.leadId || '', selectedThread.prospectName || 'Prospect');
        }
      } else {
        alert(data.error || 'No phone number available to call.');
      }
    } catch (err: any) {
      alert(`Dialer dispatch error: ${err.message}`);
    } finally {
      setCallingLead(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  // Extract latest phone from messages if available
  const detectedPhone = messages.reduce<string | null>((acc, m) => m.extractedPhone || acc, null);

  const formatTimestamp = (iso: string) => {
    if (!iso) return '';
    const date = new Date(iso);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className={`flex h-[calc(100vh-64px)] w-full overflow-hidden ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100'}`}>
      
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* PANE 1: THREAD LIST (LEFT)                                          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className={`w-full md:w-80 lg:w-96 flex flex-col border-r shrink-0 ${
        selectedThread ? 'hidden md:flex' : 'flex'
      } ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'}`}>
        
        {/* Header & Search */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                <Inbox className="w-5 h-5" />
              </div>
              <h2 className="font-bold text-base tracking-tight">Omnichannel Unibox</h2>
            </div>
            {unreadTotal > 0 && (
              <span className="bg-rose-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full animate-pulse shadow-sm shadow-rose-500/40">
                {unreadTotal} Unread
              </span>
            )}
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search prospects or messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchThreads()}
              className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none transition ${
                isLight
                  ? 'bg-slate-100 border-slate-200 focus:bg-white focus:border-amber-500'
                  : 'bg-slate-800/80 border-slate-700 focus:bg-slate-800 focus:border-amber-400'
              }`}
            />
          </div>

          {/* Channel Filters */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[11px]">
            {[
              { id: 'all', label: 'All Channels' },
              { id: 'email', label: 'Email', icon: Mail },
              { id: 'facebook_dm', label: 'FB DMs', icon: MessageSquare },
              { id: 'facebook_comment', label: 'FB Posts' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setChannelFilter(f.id as any)}
                className={`px-2 py-1 rounded-md font-medium whitespace-nowrap transition cursor-pointer ${
                  channelFilter === f.id
                    ? 'bg-amber-500 text-black font-semibold'
                    : isLight
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Intent Filters */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px]">
            {[
              { id: 'all', label: 'All Status' },
              { id: 'replied_hot', label: '🔥 Hot' },
              { id: 'positive', label: '✅ Positive' },
              { id: 'question', label: '❓ Question' },
              { id: 'dnc', label: '🛑 DNC' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id as any)}
                className={`px-2 py-0.5 rounded font-medium whitespace-nowrap transition cursor-pointer ${
                  statusFilter === st.id
                    ? 'bg-slate-700 text-white font-bold'
                    : isLight
                    ? 'text-slate-500 hover:text-slate-800'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Thread Cards List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {loadingThreads && threads.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
              <span>Syncing omnichannel threads...</span>
            </div>
          ) : threads.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No conversations match your filter.
            </div>
          ) : (
            threads.map((thread) => {
              const isSelected = selectedThread?.id === thread.id;
              const isHot = thread.status === 'replied_hot';
              return (
                <div
                  key={thread.id}
                  onClick={() => setSelectedThread(thread)}
                  className={`p-3 cursor-pointer transition relative flex flex-col gap-1.5 ${
                    isSelected
                      ? isLight
                        ? 'bg-amber-500/10 border-l-4 border-amber-500'
                        : 'bg-amber-500/15 border-l-4 border-amber-500'
                      : isLight
                      ? 'hover:bg-slate-100/70'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  {/* Top row: Channel icon, Prospect Name, Timestamp */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {thread.channel === 'email' ? (
                        <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      ) : (
                        <MessageSquare className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      )}
                      <span className={`font-semibold truncate ${thread.unreadCount > 0 ? 'font-bold text-slate-900 dark:text-white' : ''}`}>
                        {thread.prospectName || thread.prospectAddress}
                      </span>
                      {thread.unreadCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {formatTimestamp(thread.lastMessageAt)}
                    </span>
                  </div>

                  {/* Subject or Company */}
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                    {thread.subject}
                  </div>

                  {/* Snippet */}
                  <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                    {thread.lastMessageSnippet}
                  </div>

                  {/* Intent & Lock Badges */}
                  <div className="flex items-center gap-1.5 pt-1">
                    {isHot && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <Flame className="w-3 h-3 text-rose-500" /> Hot Reply
                      </span>
                    )}
                    {thread.status === 'positive' && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        Positive
                      </span>
                    )}
                    {thread.status === 'question' && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">
                        Question
                      </span>
                    )}
                    {thread.status === 'dnc' && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30">
                        DNC / Opt-Out
                      </span>
                    )}
                    {thread.sequenceLocked === 1 && (
                      <span className="text-[9px] text-slate-400 font-mono ml-auto">
                        🔒 Halted
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* PANE 2: CONVERSATION THREAD & REPLY COMPOSER (CENTER)               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className={`flex-1 flex-col min-w-0 ${
        selectedThread ? 'flex' : 'hidden md:flex'
      }`}>
        {selectedThread ? (
          <>
            {/* Thread Header */}
            <div className={`p-3 sm:p-4 border-b flex items-center justify-between gap-2 shrink-0 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
              <div className="flex items-center gap-2 min-w-0">
                {/* Mobile Back Button */}
                <button
                  onClick={() => setSelectedThread(null)}
                  className="md:hidden flex items-center gap-1 p-1.5 rounded-lg border text-xs font-bold transition shrink-0 border-slate-700 bg-slate-800 text-slate-200 hover:text-white cursor-pointer"
                  title="Back to conversations list"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Threads</span>
                </button>
                <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm sm:text-base truncate">
                    {selectedThread.prospectName || selectedThread.prospectAddress}
                  </h3>
                  <span className="text-xs text-slate-400 truncate">
                    &lt;{selectedThread.prospectAddress}&gt;
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                    {selectedThread.subject}
                  </span>
                  <span>•</span>
                  <span className="capitalize">{selectedThread.channel.replace('_', ' ')}</span>
                  {selectedThread.sequenceLocked === 1 && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-500 font-medium">Atomic Stop-on-Reply Active</span>
                    </>
                  )}
                </div>
              </div>

              </div>
              {/* Right actions: Toggle Intel & Handset Dial Button */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  onClick={() => setShowMobileIntel(!showMobileIntel)}
                  className="xl:hidden flex items-center gap-1 p-2 rounded-lg border text-xs font-bold transition shrink-0 border-slate-700 bg-slate-800 text-slate-200 hover:text-white cursor-pointer"
                  title="Toggle Prospect Intel"
                >
                  <Info className="w-4 h-4 text-amber-500" />
                </button>
                <button
                  onClick={handleTriggerCall}
                  disabled={callingLead}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold text-xs bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-md shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
                  title="Push hot lead to Android Handset (Priority 100)"
                >
                  <PhoneCall className={`w-4 h-4 ${callingLead ? 'animate-bounce' : ''}`} />
                  <span>{callingLead ? 'Dispatching...' : 'Call Handset'}</span>
                </button>
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {loadingMessages ? (
                <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                  Loading message history...
                </div>
              ) : messages.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No message history recorded for this thread.
                </div>
              ) : (
                messages.map((msg) => {
                  const isInbound = msg.direction === 'inbound';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl p-4 shadow-sm border ${
                          isInbound
                            ? isLight
                              ? 'bg-white border-slate-200 text-slate-900'
                              : 'bg-slate-900 border-slate-800 text-slate-100'
                            : isLight
                            ? 'bg-amber-500/10 border-amber-500/30 text-slate-900'
                            : 'bg-amber-500/15 border-amber-500/30 text-slate-100'
                        }`}
                      >
                        {/* Message Metadata Header */}
                        <div className="flex items-center justify-between gap-4 text-[11px] text-slate-400 mb-2 border-b pb-1.5 border-slate-100 dark:border-slate-800">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            {isInbound ? msg.senderAddress : `You (${msg.senderAddress})`}
                          </span>
                          <div className="flex items-center gap-2">
                            <span>{new Date(msg.createdAt).toLocaleString()}</span>
                            {msg.intent && msg.intent !== 'outbound_reply' && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400">
                                {msg.intent.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Extracted Phone Highlight */}
                        {msg.extractedPhone && (
                          <div className="mb-2.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                              <PhoneForwarded className="w-3.5 h-3.5" />
                              <span>Detected Phone: {msg.extractedPhone}</span>
                            </div>
                            <button
                              onClick={() => copyToClipboard(msg.extractedPhone!)}
                              className="text-[10px] text-emerald-300 hover:text-emerald-100 font-medium flex items-center gap-1"
                            >
                              {copiedPhone ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedPhone ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        )}

                        {/* Clean Body Text */}
                        <div className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                          {msg.bodyClean || msg.bodyRaw}
                        </div>

                        {/* Collapsible Raw MIME Toggle */}
                        {isInbound && (
                          <div className="mt-2.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                            <button
                              onClick={() => setRawViewMsgId(rawViewMsgId === msg.id ? null : msg.id)}
                              className="text-slate-400 hover:text-slate-200 underline cursor-pointer"
                            >
                              {rawViewMsgId === msg.id ? 'Hide Raw MIME / Headers' : 'Inspect Raw Headers'}
                            </button>
                            {rawViewMsgId === msg.id && (
                              <pre className="mt-1.5 p-2 rounded bg-black/40 text-[9px] font-mono overflow-x-auto text-slate-300 whitespace-pre">
                                {`Message-ID: ${msg.externalMessageId || 'N/A'}\nIn-Reply-To: ${msg.inReplyTo || 'N/A'}\nReferences: ${msg.referencesHeader || 'N/A'}\n\n${msg.bodyRaw}`}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Composer */}
            <div className={`p-3 border-t shrink-0 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
              <div className="flex flex-col gap-2">
                <textarea
                  rows={3}
                  placeholder={`Write your reply to ${selectedThread.prospectName || selectedThread.prospectAddress}... (Preserves RFC 2822 In-Reply-To thread)`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className={`w-full p-2.5 text-xs rounded-xl border outline-none resize-none transition ${
                    isLight
                      ? 'bg-slate-100 border-slate-200 focus:bg-white focus:border-amber-500'
                      : 'bg-slate-800/80 border-slate-700 focus:bg-slate-800 focus:border-amber-400'
                  }`}
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Sending via connected mailbox with instant header chaining</span>
                  </div>
                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || sendingReply}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition cursor-pointer disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingReply ? 'Sending...' : 'Send Reply'}</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <Inbox className="w-12 h-12 text-slate-600 mb-3" />
            <h3 className="font-bold text-base text-slate-300">Select a conversation</h3>
            <p className="text-xs max-w-sm mt-1">
              Select any incoming email or Facebook reply from the left panel to review messages, trigger immediate Android calls, or send responses.
            </p>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* PANE 3: LEAD CONTEXT & QUICK INTEL (RIGHT)                          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {selectedThread && (
        <div className={`border-l p-4 flex flex-col gap-4 overflow-y-auto shrink-0 ${
          showMobileIntel
            ? 'fixed inset-y-16 right-0 z-40 w-80 max-w-[90vw] shadow-2xl xl:static xl:inset-auto xl:w-72 xl:max-w-none'
            : 'hidden xl:flex w-72 lg:w-80'
        } ${isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-slate-800 text-white'}`}>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Prospect Intelligence
          </h4>

          {/* Contact Card */}
          <div className={`p-3.5 rounded-xl border flex flex-col gap-2.5 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/60 border-slate-700'}`}>
            <div>
              <div className="text-xs text-slate-400">Name</div>
              <div className="text-sm font-bold truncate">
                {selectedThread.prospectName || 'Unknown Prospect'}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">Email Address</div>
              <div className="text-xs font-mono truncate text-amber-500">
                {selectedThread.prospectAddress}
              </div>
            </div>

            {detectedPhone && (
              <div>
                <div className="text-xs text-slate-400">Extracted Phone</div>
                <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                  <span>{detectedPhone}</span>
                  <button
                    onClick={() => copyToClipboard(detectedPhone)}
                    className="p-1 hover:bg-emerald-500/10 rounded cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            <div>
              <div className="text-xs text-slate-400">Outreach Channel</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                {selectedThread.channel.replace('_', ' ')}
              </div>
            </div>
          </div>

          {/* Lead Triage & Quick Actions */}
          <div className={`p-3.5 rounded-xl border flex flex-col gap-2.5 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/60 border-slate-700'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Triage Actions</span>
              {updatingStatus && <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleUpdateStatus('positive')}
                disabled={updatingStatus || selectedThread.status === 'positive'}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition cursor-pointer disabled:opacity-50"
                title="Mark as Qualified / Interested"
              >
                <Star className="w-3.5 h-3.5 fill-emerald-400/30" />
                <span>Qualified</span>
              </button>
              <button
                onClick={() => handleUpdateStatus('replied')}
                disabled={updatingStatus || selectedThread.status === 'replied'}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition cursor-pointer disabled:opacity-50"
                title="Snooze for follow-up"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Snooze</span>
              </button>
              <button
                onClick={() => handleUpdateStatus('dnc')}
                disabled={updatingStatus || selectedThread.status === 'dnc'}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition cursor-pointer disabled:opacity-50"
                title="Mark Do Not Contact"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Mark DNC</span>
              </button>
              <button
                onClick={() => handleUpdateStatus('closed')}
                disabled={updatingStatus || selectedThread.status === 'closed'}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 transition cursor-pointer disabled:opacity-50"
                title="Close and archive conversation"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>
          </div>

          {/* Android Auto-Dialer Status */}
          <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <PhoneCall className="w-4 h-4" />
              <span>Android Handset Priority</span>
            </div>
            <div className="text-[11px] text-slate-400 leading-relaxed">
              When hot intent or a phone number is detected, the lead is immediately assigned <span className="text-white font-bold">Priority = 100</span>, jumping to the top of the handset dial queue.
            </div>
            <button
              onClick={handleTriggerCall}
              disabled={callingLead}
              className="mt-1 w-full py-2 rounded-lg font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-black transition cursor-pointer text-center"
            >
              1-Click Call Handset
            </button>
          </div>

          {/* Atomic Sequence Lock Card */}
          <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
              <ShieldAlert className="w-4 h-4" />
              <span>Atomic Stop-on-Reply</span>
            </div>
            <div className="text-[11px] text-slate-400 leading-relaxed">
              Automated campaign sequences for this prospect have been halted in PostgreSQL. Future automated emails and Facebook DMs are locked.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
