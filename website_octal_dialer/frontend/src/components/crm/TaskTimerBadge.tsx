import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface TaskTimerBadgeProps {
  dueAt: string;
  status?: string;
  priority?: string;
  className?: string;
}

export const TaskTimerBadge: React.FC<TaskTimerBadgeProps> = ({
  dueAt,
  status = 'open',
  className = ''
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // 1-second dynamic countdown ticker
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (status === 'completed') {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 ${className}`}>
        <CheckCircle2 className="w-3 h-3" />
        <span>DONE</span>
      </span>
    );
  }

  if (status === 'cancelled') {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-800 text-zinc-400 border border-zinc-700 ${className}`}>
        <span>CANCELLED</span>
      </span>
    );
  }

  if (!dueAt) {
    return <span className="text-zinc-500 text-[10px]">No deadline</span>;
  }
  const dueMs = new Date(dueAt).getTime();
  if (isNaN(dueMs)) {
    return <span className="text-zinc-500 text-[10px]">No deadline</span>;
  }

  const diffMs = dueMs - now;

  // OVERDUE / EXPIRED: Time has run out -> Turns solid pulsing RED!
  if (diffMs <= 0) {
    const absDiff = Math.abs(diffMs);
    const mins = Math.floor(absDiff / 60000);
    const secs = Math.floor((absDiff % 60000) / 1000);
    const hrs = Math.floor(mins / 60);

    let timeStr = '';
    if (hrs > 0) {
      timeStr = `-${hrs}h ${mins % 60}m`;
    } else {
      timeStr = `-${mins}m ${secs}s`;
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-red-500/25 text-red-300 border-2 border-red-500/70 shadow-md shadow-red-500/25 animate-pulse ${className}`} title={`Task is overdue since ${new Date(dueAt).toLocaleTimeString()}`}>
        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
        <span>OVERDUE {timeStr}</span>
      </span>
    );
  }

  // ACTIVE COUNTDOWN:
  const totalSecs = Math.floor(diffMs / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  // Near-deadline warning (< 5 minutes left) -> Pulsing Amber/Yellow
  if (diffMs <= 5 * 60 * 1000) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse ${className}`}>
        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span>{mins}m {secs}s LEFT</span>
      </span>
    );
  }

  // Healthy Countdown (> 5 minutes left) -> Clean Amber/Emerald
  let countdownLabel = '';
  if (hrs > 24) {
    const days = Math.floor(hrs / 24);
    countdownLabel = `${days}d ${hrs % 24}h left`;
  } else if (hrs > 0) {
    countdownLabel = `${hrs}h ${mins}m ${secs}s left`;
  } else {
    countdownLabel = `${mins}m ${secs}s left`;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 ${className}`}>
      <Clock className="w-3 h-3 text-amber-400 shrink-0" />
      <span>{countdownLabel}</span>
    </span>
  );
};
